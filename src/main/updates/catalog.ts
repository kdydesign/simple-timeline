import { randomUUID } from 'node:crypto'
import { constants, type ReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { UPDATE_PROTOCOL_VERSION, compareStableVersions, type UpdateCatalogState, type UpdateFile, type UpdateFileId, type UpdatePublication, type UpdateRelease, type UpdateStatus } from '../../shared/updates'
import { extractUpdateBundle, hashUpdateFile, parseUpdateManifest, validateBundleDirectory } from './bundle'

export interface UpdateCatalogOptions { root: string; hostId: string; hostVersion: string; hostSourceSha: string }
export interface UpdateFileLease { file: UpdateFile; stream: ReadStream; release(): void }
interface StoredCatalog { schemaVersion: 1; revision: number; current: UpdateRelease | null; candidate: UpdateRelease | null; publication: UpdatePublication | null; fingerprints: Record<string, string> }
const emptyCatalog = (): StoredCatalog => ({ schemaVersion: 1, revision: 0, current: null, candidate: null, publication: null, fingerprints: {} })
const clone = <T>(value: T): T => structuredClone(value)
/** One instance per app process. Electron's single-instance lock supplies the process boundary. */
export class UpdateCatalog {
  private data: StoredCatalog = emptyCatalog()
  private queue: Promise<unknown> = Promise.resolve()
  private leases = new Map<string, number>()
  private cleanupPending = false
  private constructor(private readonly options: UpdateCatalogOptions) {}
  static async open(options: UpdateCatalogOptions): Promise<UpdateCatalog> {
    compareStableVersions(options.hostVersion, options.hostVersion)
    if (!options.hostId || !/^[a-f0-9]{40}$/.test(options.hostSourceSha)) throw new Error('Invalid host identity')
    const catalog = new UpdateCatalog(options)
    await mkdir(options.root, { recursive: true, mode: 0o700 })
    if (!(await lstat(options.root)).isDirectory() || (await lstat(options.root)).isSymbolicLink()) throw new Error('Invalid update root')
    try {
      const path = join(options.root, 'catalog.json'), info = await lstat(path)
      if (!info.isFile() || info.size > 16 * 1024 ** 2) throw new Error('Invalid catalog file')
      catalog.data = catalog.parse(JSON.parse(await readFile(path, 'utf8')))
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Update catalog corrupt; distribution stopped', { cause: error }) }
    for (const release of [catalog.data.current, catalog.data.candidate]) {
      if (!release) continue
      const verified = await validateBundleDirectory(join(options.root, release.manifest.version))
      if (verified.releaseId !== release.releaseId || JSON.stringify(verified.manifest) !== JSON.stringify(release.manifest)) throw new Error('Registered update files changed; distribution stopped')
    }
    if (catalog.data.publication && (!catalog.matchesHost(catalog.data.publication) || catalog.data.publication.hostId !== options.hostId)) await catalog.withdraw()
    await catalog.cleanup()
    return catalog
  }
  private parse(value: unknown): StoredCatalog {
    const data = value as StoredCatalog
    if (!data || data.schemaVersion !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.fingerprints || typeof data.fingerprints !== 'object' || Array.isArray(data.fingerprints)) throw new Error('Invalid catalog')
    for (const [version, digest] of Object.entries(data.fingerprints)) { compareStableVersions(version, version); if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('Invalid immutable fingerprint') }
    const parseRelease = (raw: UpdateRelease | null): UpdateRelease | null => {
      if (raw === null) return null
      if (!raw || !/^[a-f0-9]{64}$/.test(raw.releaseId)) throw new Error('Invalid stored release')
      const manifest = parseUpdateManifest(raw.manifest)
      if (data.fingerprints[manifest.version] !== raw.releaseId) throw new Error('Invalid stored fingerprint')
      return { releaseId: raw.releaseId, manifest }
    }
    const current = parseRelease(data.current), candidate = parseRelease(data.candidate)
    let publication: UpdatePublication | null = null
    if (data.publication !== null) {
      const p = data.publication
      if (!p || p.protocolVersion !== 1 || typeof p.hostId !== 'string' || typeof p.publicationId !== 'string' || !/^[a-f0-9-]{36}$/.test(p.publicationId) || p.revision !== data.revision || !current || p.releaseId !== current.releaseId || JSON.stringify(parseRelease(p)) !== JSON.stringify(current)) throw new Error('Invalid publication')
      publication = { ...current, protocolVersion: 1, hostId: p.hostId, publicationId: p.publicationId, revision: p.revision }
    }
    return { schemaVersion: 1, revision: data.revision, current, candidate, publication, fingerprints: { ...data.fingerprints } }
  }
  status(): UpdateCatalogState { return clone({ revision: this.data.revision, current: this.data.current, candidate: this.data.candidate, publication: this.data.publication, cleanupPending: this.cleanupPending }) }
  wireStatus(): UpdateStatus { return clone({ protocolVersion: UPDATE_PROTOCOL_VERSION, hostId: this.options.hostId, revision: this.data.revision, publication: this.data.publication }) }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> { const next = this.queue.then(operation); this.queue = next.catch(() => {}); return next }
  private matchesHost(release: UpdateRelease): boolean { return release.manifest.version === this.options.hostVersion && release.manifest.sourceSha === this.options.hostSourceSha }
  private async save(next: StoredCatalog): Promise<void> {
    const temp = join(this.options.root, `.catalog-${randomUUID()}.tmp`)
    try {
      const file = await open(temp, 'wx', 0o600)
      try { await file.writeFile(JSON.stringify(next)); await file.sync() } finally { await file.close() }
      await rename(temp, join(this.options.root, 'catalog.json'))
      this.data = next
    } finally { await rm(temp, { force: true }).catch(() => { this.cleanupPending = true }) }
  }
  importBundle(zipPath: string): Promise<UpdateCatalogState> {
    return this.exclusive(async () => {
      const temp = await mkdtemp(join(this.options.root, '.import-'))
      try {
        const release = await extractUpdateBundle(zipPath, temp), version = release.manifest.version, known = this.data.fingerprints[version]
        if (known && known !== release.releaseId) throw new Error('Immutable version already has different bytes')
        const existing = [this.data.current, this.data.candidate].find(r => r?.releaseId === release.releaseId)
        if (existing) {
          if (existing.releaseId === this.data.current?.releaseId && this.data.candidate && this.data.candidate.releaseId !== existing.releaseId) {
            const next = clone(this.data); next.candidate = null
            await this.save(next); await this.cleanup()
          }
          return this.status()
        }
        const destination = join(this.options.root, version)
        // Recover only an exact completed directory left by a crash before catalog commit.
        try { const orphan = await validateBundleDirectory(destination); if (orphan.releaseId !== release.releaseId) throw new Error('Immutable version directory differs') }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; await rename(temp, destination) }
        const next = clone(this.data); next.candidate = release; next.fingerprints[version] = release.releaseId
        try { await this.save(next) } catch (error) { await this.cleanup(); throw error }
        await this.cleanup()
        return this.status()
      } finally { await rm(temp, { recursive: true, force: true }).catch(() => { this.cleanupPending = true }) }
    })
  }
  publish(): Promise<UpdatePublication> {
    return this.exclusive(async () => {
      const release = this.data.candidate ?? this.data.current
      if (!release || !this.matchesHost(release)) throw new Error('Update must match installed host version and source')
      const verified = await validateBundleDirectory(join(this.options.root, release.manifest.version))
      if (verified.releaseId !== release.releaseId) throw new Error('Registered update files changed')
      const next = clone(this.data); next.revision++
      if (!Number.isSafeInteger(next.revision)) throw new Error('Update revision exhausted')
      next.current = release; next.candidate = null
      const publication: UpdatePublication = { ...release, protocolVersion: 1, hostId: this.options.hostId, revision: next.revision, publicationId: randomUUID() }
      next.publication = publication; await this.save(next); await this.cleanup()
      return clone(publication)
    })
  }
  withdraw(): Promise<UpdateCatalogState> {
    return this.exclusive(async () => {
      const next = clone(this.data); next.revision++; next.publication = null
      if (!Number.isSafeInteger(next.revision)) throw new Error('Update revision exhausted')
      await this.save(next); return this.status()
    })
  }
  readFile(releaseId: string, fileId: UpdateFileId): Promise<UpdateFileLease> {
    return this.exclusive(async () => {
      const publication = this.data.publication
      if (!publication || publication.releaseId !== releaseId) throw new Error('Update is no longer published')
      const file = publication.manifest.files.find(f => f.id === fileId)
      if (!file) throw new Error('Unknown update file')
      const path = join(this.options.root, publication.manifest.version, file.name), actual = await hashUpdateFile(path)
      if (actual.sha256 !== file.sha256 || actual.sha512 !== file.sha512 || actual.size !== file.size) throw new Error('Published update file changed')
      const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
      this.leases.set(releaseId, (this.leases.get(releaseId) ?? 0) + 1)
      const stream = handle.createReadStream(); let released = false
      const release = () => {
        if (released) return; released = true
        stream.destroy(); this.leases.set(releaseId, Math.max(0, (this.leases.get(releaseId) ?? 1) - 1))
        void this.exclusive(() => this.cleanup())
      }
      stream.once('close', release)
      return { file: clone(file), stream, release }
    })
  }
  private async cleanup(): Promise<void> {
    this.cleanupPending = false
    try {
      const keep = new Set([this.data.current?.manifest.version, this.data.candidate?.manifest.version])
      for (const entry of await readdir(this.options.root, { withFileTypes: true })) {
        // Only owned bundle/staging names; member cache and user files are outside this cleanup.
        const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(entry.name)
        if (version && (keep.has(entry.name) || (this.leases.get(this.data.fingerprints[entry.name]) ?? 0) > 0)) continue
        if ((version && entry.isDirectory()) || /^\.import-/.test(entry.name) || /^\.catalog-[a-f0-9-]+\.tmp$/.test(entry.name)) {
          try { await rm(join(this.options.root, entry.name), { recursive: true, force: true }) } catch { this.cleanupPending = true }
        }
      }
    } catch { this.cleanupPending = true }
  }
}
