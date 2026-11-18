import { useState } from 'react'
import { Hexagon, RefreshCw } from 'lucide-react'
import type { NodeRelease } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'
import { nodeActiveVersionLabel, nodeInspectionStale, nodeInventoryKnown, nodeManagerLabel, nodeOperationError, nodeProgress, platformScope, supportedManager } from './nodePresentation'

const filters = [
  { id: 'all', label: '전체' },
  { id: 'lts', label: 'LTS' },
  { id: 'installed', label: '설치됨' },
] as const
const pageSize = 30

export function NodeScreen({ node }: { node: NodeManagement }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<typeof filters[number]['id']>('all')
  const [limit, setLimit] = useState(pageSize)
  const { state, error, busy, catalogPending, refresh, refreshCatalog, mutate } = node
  const unsupported = state?.supported === false
  const stale = nodeInspectionStale(node)
  const inventoryKnown = nodeInventoryKnown(node)
  const progress = nodeProgress(node)
  const operationError = nodeOperationError(node)
  const installed = state?.installedVersions ?? []
  const catalog = state?.catalog
  const checking = !state && !error
  const catalogLoading = catalogPending || catalog?.status === 'loading'
  const canChange = !!state?.supported && !!state.checkedAt && !busy && !stale && !state.conflicts.length
    && state.error?.code !== 'operation-unknown' && state.error?.code !== 'shutdown'
  const managerReady = state?.manager.status === 'ready'
  const managerMissing = state?.manager.status === 'missing'
  const managerError = state?.manager.status === 'error'
  const canUse = canChange && managerReady
  const canInstall = canUse && catalog?.status === 'ready' && !catalogLoading
  const activeVersion = state?.activeVersion
  const activeManaged = state?.activeSource === 'nvm' && !stale
  const detectedConflict = !!state?.conflicts.length
  const manualManager = !unsupported && (!!managerError || !!managerMissing)
  const releaseMap = new Map(catalog?.releases.map(release => [release.version, release]))
  const query = search.trim().toLowerCase().replace(/^v(?=\d)/, '')
  const matches = (version: string, release?: NodeRelease) =>
    version.includes(query) || !!release?.lts?.toLowerCase().includes(query)
  const visibleVersions = filter === 'installed'
    ? installed.filter(version => matches(version, releaseMap.get(version)))
    : (catalog?.releases ?? []).filter(release =>
      (filter !== 'lts' || !!release.lts) && matches(release.version, release)).map(release => release.version)
  const catalogLoadingMessage = '공식 배포 목록을 가져오고 있습니다…'
  const noInventory = inventoryKnown ? '설치된 버전이 없습니다.' : '설치된 버전을 확인할 수 없습니다.'

  function versionAction(version: string, isInstalled: boolean) {
    const action = isInstalled ? '사용' : '설치'
    return (
      <button type="button" className="workrail-control"
        aria-label={version + ' ' + action} disabled={isInstalled ? !canUse : !canInstall}
        onClick={() => void mutate({ kind: isInstalled ? 'use' : 'install', version })}>{action}</button>
    )
  }

  return (
    <main className="workrail-screen workrail-node" aria-label="Node 버전 관리">
      <header className="workrail-page-heading">
        <h2>Node 버전 관리</h2>
        <p>Windows x64 · 공식 {supportedManager} 지원</p>
      </header>
      {unsupported && <p className="workrail-surface workrail-node-empty">{platformScope}</p>}
      {!unsupported && (
        <section className="workrail-surface workrail-node-current" aria-labelledby="workrail-current-heading">
          <Hexagon aria-hidden="true" size={25} strokeWidth={1.5} />
          <div className="workrail-active">
            <h3 id="workrail-current-heading">현재 사용 버전</h3>
            <strong>{nodeActiveVersionLabel(node)}</strong>
          </div>
          {state?.activeSource && !stale && <span className="workrail-tag">{activeManaged ? 'nvm-windows' : '기존 Node 설치'}</span>}
          {state && <p className="workrail-manager">{nodeManagerLabel(state)}</p>}
          <button type="button" className="workrail-control" onClick={() => void refresh()}
            disabled={!node.available || busy || checking}><RefreshCw aria-hidden="true" size={15} />환경 다시 검사</button>
        </section>
      )}
      {progress && <p className="workrail-note" aria-live="polite">{progress}</p>}
      {operationError && <p className="workrail-message" role="alert">{operationError.message}</p>}
      {!unsupported && (detectedConflict || manualManager) && (
        <section className="workrail-surface workrail-node-guidance" aria-labelledby="workrail-node-guidance-heading">
          <h3 id="workrail-node-guidance-heading">{detectedConflict ? 'Node 환경 충돌' : managerMissing ? supportedManager + ' 설치' : 'nvm-windows 상태 확인'}</h3>
          {detectedConflict && (
            <>
              <ul>
                {state.conflicts.map((conflict, index) => <li key={conflict.code + index}>
                  {conflict.message}{conflict.path && <code>{conflict.path}</code>}
                </li>)}
              </ul>
              <p>표시된 경로와 Windows의 Node 설치 및 PATH 설정을 직접 정리한 뒤 환경을 다시 검사해 주세요.</p>
            </>
          )}
          {managerMissing && !detectedConflict && (
            <>
              <p>공식 설치 프로그램을 열려면 Windows 권한 확인이 필요합니다.</p>
              <button type="button" className="workrail-control workrail-primary" disabled={!canChange}
                onClick={() => void mutate({ kind: 'install-manager', version: null })}>{supportedManager} 설치</button>
            </>
          )}
          {manualManager && (
            <p>브라우저에서 공식 {supportedManager} 릴리스를 열어 수동 설치 또는 업그레이드를 진행한 뒤 환경을 다시 검사해 주세요.
              <code>https://github.com/coreybutler/nvm-windows/releases/tag/1.2.2</code>
            </p>
          )}
        </section>
      )}
      {state?.supported && (
        <div className="workrail-node-grid">
          <section className="workrail-node-catalog" aria-labelledby="workrail-catalog-heading">
            <h3 id="workrail-catalog-heading">공식 배포 목록</h3>
            <div className="workrail-node-tools">
              <input className="workrail-control" type="search" aria-label="버전 검색" placeholder="버전 검색"
                value={search} onChange={event => { setSearch(event.target.value); setLimit(pageSize) }} />
              <div className="workrail-node-filters" role="group" aria-label="버전 필터">
                {filters.map(item => <button type="button" className="workrail-control" key={item.id} aria-pressed={filter === item.id}
                  onClick={() => { setFilter(item.id); setLimit(pageSize) }}>{item.label}</button>)}
              </div>
              <button type="button" className="workrail-control" aria-label="공식 배포 목록 새로고침"
                onClick={() => void refreshCatalog()} disabled={busy || catalogLoading}>
                <RefreshCw aria-hidden="true" size={15} />
              </button>
            </div>
            {catalogLoading && (visibleVersions.length > 0 || filter === 'installed') && <p className="workrail-muted" aria-live="polite">{catalogLoadingMessage}</p>}
            {catalog?.error && <div className="workrail-message">
              <p role="alert">{catalog.error.message}</p>
              {catalog.releases.length > 0 && <p>마지막으로 조회한 목록을 표시합니다.</p>}
            </div>}
            {visibleVersions.length > 0 ? (
              <div className="workrail-surface workrail-node-table">
                <table>
                  <thead><tr><th scope="col">Node 버전</th><th scope="col">분류</th><th scope="col">npm</th><th scope="col">상태</th><th scope="col">작업</th></tr></thead>
                  <tbody>{visibleVersions.slice(0, limit).map(version => {
                    const release = releaseMap.get(version)
                    const isInstalled = installed.includes(version)
                    const using = activeManaged && activeVersion === version
                    return (
                      <tr key={version} data-current={using || undefined}>
                        <th scope="row">{version}</th>
                        <td>{release ? release.lts ? <span className="workrail-tag">{release.lts}</span> : '일반' : '—'}</td>
                        <td>{release?.npm ?? '—'}</td>
                        <td>{using ? '사용 중' : !inventoryKnown ? '확인 필요' : isInstalled ? '설치됨' : '미설치'}</td>
                        <td>{versionAction(version, isInstalled)}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
                {visibleVersions.length > limit && <button type="button" className="workrail-control workrail-more"
                  onClick={() => setLimit(value => value + pageSize)}>버전 더 보기</button>}
              </div>
            ) : (
              <div className="workrail-surface workrail-node-empty" aria-live="polite">
                {filter === 'installed'
                  ? inventoryKnown && installed.length ? '검색에 맞는 버전이 없습니다.' : noInventory
                  : catalogLoading ? catalogLoadingMessage
                  : catalog?.status === 'ready' ? '조건에 맞는 배포 버전이 없습니다.'
                  : catalog?.status === 'error' ? '공식 배포 목록을 확인하지 못했습니다.' : '공식 배포 목록을 새로고침해 주세요.'}
              </div>
            )}
            <p className="workrail-muted workrail-source">목록 출처 nodejs.org/dist · Windows x64</p>
          </section>
          <section className="workrail-surface workrail-node-installed" aria-labelledby="workrail-installed-heading">
            <h3 id="workrail-installed-heading">설치된 버전</h3>
            {installed.length > 0 ? (
              <>
                {!inventoryKnown && <p className="workrail-note">마지막으로 확인한 버전을 표시합니다.</p>}
                <ul>{installed.map(version => (
                  <li key={version}>
                    <div>
                      <strong>{version}</strong>
                      {activeManaged && activeVersion === version && <p className="workrail-muted">사용 중</p>}
                    </div>
                    {versionAction(version, true)}
                  </li>
                ))}</ul>
              </>
            ) : <p className="workrail-muted">{noInventory}</p>}
            <p className="workrail-note">버전을 바꾸면 Windows PATH에서 nvm-windows 경로를 사용하는 이후 Node 실행에 적용됩니다. 설치 후 PATH가 변경되면 터미널을 다시 열어 주세요.</p>
          </section>
        </div>
      )}
    </main>
  )
}
