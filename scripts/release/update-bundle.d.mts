import type { UpdateManifest } from '../../src/shared/updates'
export interface ReleaseBuildManifest {
  version: string
  arch: string
  installer: string
  sourceSha: string
  signed: boolean
  validationUpdateOnly: boolean
  [key: string]: unknown
}
export function createUpdateBundle(input: { directory: string; manifest: ReleaseBuildManifest }): Promise<{ zipPath: string; manifest: UpdateManifest & ReleaseBuildManifest }>
