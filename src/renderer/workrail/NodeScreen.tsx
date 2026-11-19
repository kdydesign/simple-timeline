import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { NodeRelease } from '../../shared/node-management'
import type { NodeManagement } from './useNodeManagement'
import { nodeActiveVersionLabel, nodeCanRecheck, nodeCapabilityReason, nodeDefaultVersion, nodeEnvironmentReady, nodeInspectionStale,
  nodeInstalledVersions, nodeInventoryKnown, nodeVersionStatus, platformScope, unknownInventory } from './nodePresentation'
import { EnvironmentActions, EnvironmentName, ManagerBadge, type OpenEnvironment } from './NodeEnvironment'
import { NodeOperationStatus, NodeTooltip, NodeVersionAction, NodeVersionStatus } from './NodeVersionControls'

import {NodeGuidance} from './NodeRecovery'
import { ToolIcon } from './ToolIcon'
import { sortNodeCatalog, type NodeCatalogColumn, type NodeCatalogRow, type NodeCatalogSort } from './nodeCatalogSort'

const sortColumns: { id: NodeCatalogColumn; label: string }[] = [
  { id: 'version', label: 'Node 버전' }, { id: 'category', label: '분류' },
  { id: 'npm', label: 'npm' }, { id: 'status', label: '상태' },
]
const filters = [
  { id: 'all', label: '전체' },
  { id: 'lts', label: 'LTS' },
  { id: 'installed', label: '설치됨' },
] as const
const pageSize = 30

export function NodeScreen({ node, onEnvironment }: { node: NodeManagement; onEnvironment: OpenEnvironment }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<typeof filters[number]['id']>('all')
  const [limit, setLimit] = useState(pageSize)
  const [sort, setSort] = useState<NodeCatalogSort>({ column: 'version', direction: 'descending' })
  const tableScroll = useRef<HTMLDivElement>(null)
  function resetPage() {
    setLimit(pageSize)
    if (tableScroll.current) tableScroll.current.scrollTop = 0
  }
  function changeSort(column: NodeCatalogColumn) {
    setSort(previous => ({ column, direction: previous.column === column
      ? previous.direction === 'ascending' ? 'descending' : 'ascending'
      : column === 'version' || column === 'npm' ? 'descending' : 'ascending' }))
    resetPage()
  }
  const { state, busy, catalogPending, refresh, refreshCatalog } = node
  const unsupported = state?.supported === false
  const ready = nodeEnvironmentReady(node)
  const stale = nodeInspectionStale(node)
  const inventoryKnown = nodeInventoryKnown(node)
  const installed = nodeInstalledVersions(node)
  const catalog = state?.catalog
  const catalogLoading = catalogPending || catalog?.status === 'loading'
  const groupReasons = [
    ['목록 조회', nodeCapabilityReason(state, 'list')],
    ['설치', nodeCapabilityReason(state, 'install')],
    ['버전 전환', nodeCapabilityReason(state, 'use')],
  ].filter(([, reason]) => reason)
  const currentLabel = nodeDefaultVersion(node) ? '기본 버전' : '현재 사용 버전'
  const releaseMap = new Map(catalog?.releases.map(release => [release.version, release]))
  const query = search.trim().toLowerCase().replace(/^v(?=\d)/, '')
  const matches = (version: string, release?: NodeRelease) =>
    version.includes(query) || !!release?.lts?.toLowerCase().includes(query)
  const filteredVersions = filter === 'installed'
    ? installed.filter(version => matches(version, releaseMap.get(version)))
    : (catalog?.releases ?? []).filter(release =>
      (filter !== 'lts' || (release.ltsKnown !== false && !!release.lts)) && matches(release.version, release)).map(release => release.version)
  const rows = sortNodeCatalog(filteredVersions.map(version => {
    const release = releaseMap.get(version)
    return { version, npm: release?.npm ?? null, lts: release?.ltsKnown === false ? undefined : release?.lts,
      status: nodeVersionStatus(node, version) } satisfies NodeCatalogRow
  }), sort)
  const noInventory = inventoryKnown ? '설치된 버전이 없습니다.' : unknownInventory

  return (
    <main className="workrail-screen workrail-node" aria-label="NodeRail">
      {unsupported && <p className="workrail-surface workrail-node-empty">{platformScope}</p>}
      {!unsupported && (
        <section className="workrail-surface workrail-node-current" aria-labelledby="workrail-current-heading">
          <ToolIcon tool="node" size={25} />
          <div className="workrail-active">
            <h3 id="workrail-current-heading">{currentLabel}</h3>
            <EnvironmentName node={node} />
            <strong>{nodeActiveVersionLabel(node)}</strong>
          </div>
          <div className="workrail-current-actions">
            {ready && !stale && state?.manager.status === 'ready' && <ManagerBadge node={node} />}
            {ready && !stale && state?.activeSource === 'standalone' && <span className="workrail-tag">기존 Node 설치</span>}
            <EnvironmentActions node={node} onEnvironment={onEnvironment} />
            {state?.environments?.status !== 'error' && <button type="button" className="workrail-control" onClick={() => void refresh()}
              disabled={!nodeCanRecheck(node) || !state && !node.error}><RefreshCw aria-hidden="true" size={15} />환경 다시 검사</button>}
          </div>
        </section>
      )}
      {state?.environments?.error && <p className="workrail-message" role="alert">{state.environments.error.message}</p>}
      <NodeOperationStatus node={node} showLogs />
      {ready && <NodeGuidance node={node} />}
      {ready && groupReasons.length > 0 && <ul className="workrail-capability-notes">
        {groupReasons.map(([label, reason]) => <li key={label}><strong>{label}</strong> {reason}</li>)}
      </ul>}
      {ready && (
        <div className="workrail-node-grid">
          <section className="workrail-node-catalog" aria-labelledby="workrail-catalog-heading">
            <div className="workrail-catalog-toolbar">
            <h3 id="workrail-catalog-heading">공식 배포 목록</h3>
            <div className="workrail-node-tools">
              <input className="workrail-control" type="search" aria-label="버전 검색" placeholder="버전 검색"
                value={search} onChange={event => { setSearch(event.target.value); resetPage() }} />
              <div className="workrail-node-filters" role="group" aria-label="버전 필터">
                {filters.map(item => <button type="button" className="workrail-control" key={item.id} aria-pressed={filter === item.id}
                  onClick={() => { setFilter(item.id); resetPage() }}>{item.label}</button>)}
              </div>
              <button type="button" className="workrail-control" aria-label="공식 배포 목록 새로고침"
                onClick={() => void refreshCatalog()} disabled={busy || catalogLoading}>
                <RefreshCw aria-hidden="true" size={15} />
              </button>
            </div>
            </div>
            <div className="workrail-surface workrail-node-table" aria-busy={catalogLoading}>
              {catalogLoading && <div className="workrail-catalog-progress" aria-hidden="true" />}
              <span className="sr-only" role="status" aria-label="목록 조회 상태">{catalogLoading ? '공식 배포 목록 조회 중' : catalog?.status === 'error' ? '공식 배포 목록 조회 실패' : catalog?.status === 'ready' ? '공식 배포 목록 조회 완료' : ''}</span>
              {catalog?.error && <div className="workrail-message">
                <p role="alert">{catalog.error.message}</p>
                {catalog.releases.length > 0 && <p>마지막으로 조회한 목록을 표시합니다.</p>}
              </div>}
              <div className="workrail-node-table-scroll" ref={tableScroll}>
                <table aria-label="공식 배포 버전" aria-busy={catalogLoading}>
                  <thead><tr>{sortColumns.map(column => {
                    const sortButton = <button type="button" className="workrail-sort" aria-label={column.label + ' 정렬'} onClick={() => changeSort(column.id)}>
                      <span>{column.label}</span><span aria-hidden="true" className="workrail-sort-direction">{sort.column === column.id ? sort.direction === 'ascending' ? '▲' : '▼' : '↕'}</span>
                    </button>
                    return <th key={column.id} scope="col" aria-sort={sort.column === column.id ? sort.direction : undefined}>
                      {column.id === 'category' ? <NodeTooltip trigger={sortButton}>{'LTS는 장기 지원 계열이며 Krypton은 코드명입니다. 분류만으로 현재 보안 지원 여부를 알 수 없습니다.'}</NodeTooltip> : sortButton}
                    </th>
                  })}<th scope="col">작업</th></tr></thead>
                  <tbody>{rows.slice(0, limit).map(row => (
                    <tr key={row.version} data-current={row.status === 'active' || undefined}>
                      <th scope="row">{row.version}</th>
                      <td>{row.lts === undefined ? '확인 불가' : row.lts ? <span className="workrail-tag">LTS · {row.lts}</span> : '비 LTS'}</td>
                      <td>{row.npm ?? '—'}</td>
                      <td><NodeVersionStatus node={node} version={row.version} /></td>
                      <td><NodeVersionAction node={node} version={row.version} release={releaseMap.get(row.version)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
                {rows.length > limit && <button type="button" className="workrail-control workrail-more"
                  onClick={() => setLimit(value => value + pageSize)}>버전 더 보기</button>}
                {rows.length === 0 && !(catalogLoading && filter !== 'installed') && <div className="workrail-node-empty" aria-live="polite">
                  {filter === 'installed'
                    ? inventoryKnown && installed.length ? '검색에 맞는 버전이 없습니다.' : noInventory
                    : catalog?.status === 'ready' ? '조건에 맞는 배포 버전이 없습니다.'
                    : catalog?.status === 'error' ? '공식 배포 목록을 확인하지 못했습니다.' : '공식 배포 목록을 새로고침해 주세요.'}
                </div>}
              </div>
            </div>
          </section>
          <section className="workrail-surface workrail-node-installed" aria-labelledby="workrail-installed-heading">
            <h3 id="workrail-installed-heading">설치된 버전</h3>
            {installed.length > 0 ? (
              <>
                {!inventoryKnown && <p className="workrail-note">{unknownInventory} 마지막으로 확인한 목록을 표시합니다.</p>}
                <ul>{installed.map(version => (
                  <li key={version}>
                    <strong>{version}</strong>
                    <NodeVersionAction node={node} version={version} />
                  </li>
                ))}</ul>
              </>
            ) : <p className="workrail-muted">{noInventory}</p>}
            <p className="workrail-note">{node.environment?.kind === 'wsl2'
              ? '선택한 WSL 기본 사용자의 Node 버전을 바꿉니다. 프로젝트 .node-version과 열린 셸의 환경 설정은 유지됩니다.'
              : nodeDefaultVersion(node)
                ? 'Windows의 사용자 기본 버전을 바꿉니다. 프로젝트에서 정한 버전은 그대로 적용될 수 있습니다.'
                : '버전을 바꾸면 Windows PATH에서 nvm-windows 경로를 사용하는 이후 Node 실행에 적용됩니다. 설치 후 PATH가 변경되면 터미널을 다시 열어 주세요.'}</p>
          </section>
        </div>
      )}
    </main>
  )
}
