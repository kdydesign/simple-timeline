/* The recovery UI has no Node integration, framework, development server or remote script. */
'use strict'
const api = window.nodeMaintenance
const element = id => document.getElementById(id)
let state = null, accepted = false, pending = false
function message(text) { element('error').textContent = text || ''; element('error').hidden = !text }
async function run(action) {
  if (pending) return
  pending = true; render()
  try {
    const result = await action()
    if (!result.ok) message(result.error.message)
    else if (result.data) { state = result.data; message(state.error?.message) }
  } catch { message('복구 창의 응답을 확인하지 못했습니다. 환경을 다시 검사해 주세요.') }
  finally { pending = false; render() }
}
function render() {
  const blocked = !accepted || pending || !state || Boolean(state.busy)
  element('refresh').disabled = pending
  element('catalog').disabled = pending || Boolean(state?.busy)
  element('remove').disabled = blocked || state.removal?.status !== 'available' || state.removal?.rebootRequired
  element('manager').disabled = blocked || state.manager.status !== 'missing' || state.conflicts.length > 0 || state.removal?.rebootRequired
  element('status').textContent = !accepted ? '복구 창의 준비와 작업 인계를 확인하고 있습니다…' : state?.busy ? ({downloading: '공식 배포 파일 다운로드 중', authenticating: '공식 ZIP 무결성 확인 중', extracting: '압축 해제 및 설치 중', verifying: '설치·전환 결과 확인 중', checking: '환경 검사 중', waiting: 'Windows 작업 완료 대기 중'}[state.busy.phase] || 'Windows 작업 진행 중') : pending ? '환경을 확인하고 있습니다…' : '각 단계의 버튼을 눌러 진행해 주세요.'
  if (!state) return
  element('environment').textContent = state.activeVersion ? `현재 Node ${state.activeVersion} · ${state.activeSource === 'nvm' ? 'nvm 관리' : '기존 설치'}` : state.checkedAt ? '현재 사용할 수 있는 Node를 확인하지 못했습니다.' : '환경을 검사하고 있습니다.'
  element('target').textContent = state.removal?.target ? `제거 대상: Node.js ${state.removal.target.version} · ${state.removal.target.path}` : ''
  element('reason').textContent = state.removal?.rebootRequired ? 'Windows 재부팅이 필요합니다. 재부팅한 뒤 복구 바로가기로 돌아와 환경을 다시 검사해 주세요.' : state.removal?.reason || ''
  element('conflicts').replaceChildren(...state.conflicts.map(conflict => { const item = document.createElement('li'); item.textContent = `${conflict.message}${conflict.path ? ` (${conflict.path})` : ''}`; return item }))
  element('manager').textContent = state.manager.status === 'ready' ? `nvm-windows ${state.manager.version || ''} 설치 확인` : 'nvm-windows 1.2.2 설치'
  element('catalog-state').textContent = state.catalog.error?.message || (state.catalog.status === 'loading' ? '공식 배포 목록을 읽고 있습니다…' : `${state.catalog.releases.length}개 공식 Windows x64 버전`)
  const query = element('search').value.trim()
  const releases = state.catalog.releases.filter(release => release.version.includes(query))
  // Installed versions remain selectable even when the network catalog is unavailable.
  const versions = [...new Set([...state.installedVersions.filter(version => version.includes(query)), ...releases.map(release => release.version)])]
  element('versions').replaceChildren(...versions.map(version => {
    const release = releases.find(item => item.version === version), installed = state.installedVersions.includes(version), active = state.activeSource === 'nvm' && state.activeVersion === version
    const row = document.createElement('tr')
    for (const text of [`${version}${release?.lts ? ' · LTS' : ''}`, release?.npm || '—', active ? '사용 중' : installed ? '설치됨' : '미설치']) { const cell = document.createElement('td'); cell.textContent = text; row.append(cell) }
    const cell = document.createElement('td'), button = document.createElement('button')
    button.textContent = active ? '사용 중' : installed ? '사용' : '설치'
    button.disabled = blocked || state.manager.status !== 'ready' || (state.capabilities ? !state.capabilities[installed ? 'use' : 'install'].available : state.conflicts.length > 0) || active || state.removal?.rebootRequired
    button.addEventListener('click', () => run(() => installed ? api.use(version) : api.install(version)))
    cell.append(button); row.append(cell); return row
  }))
}
element('refresh').addEventListener('click', () => run(() => api.recheck()))
element('catalog').addEventListener('click', () => run(() => api.refreshCatalog()))
element('remove').addEventListener('click', () => { const identity = state?.removal?.confirmationId; if (identity) void run(() => api.removeStandalone(identity)) })
element('manager').addEventListener('click', () => run(() => api.installManager()))
element('location').addEventListener('click', () => run(() => api.openRecoveryLocation()))
element('search').addEventListener('input', render)
api.onChange(next => { state = next; message(next.error?.message); render() })
async function initialize() {
  try {
    const info = await api.ready()
    if (!info.ok) throw Error('Not ready')
    element('shortcut').textContent = info.recoveryShortcut
    accepted = info.ready && info.accepted
    render()
    if (!accepted) { setTimeout(initialize, 300); return }
    await run(() => api.refreshCatalog())
  } catch { message('독립 복구 창의 준비를 확인하지 못했습니다. 기존 Node는 제거하지 않습니다.') }
}
void initialize()
