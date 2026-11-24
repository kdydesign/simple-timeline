import { Pencil, Plus, RefreshCw, Star, Terminal, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { DeviceMacro, DeviceObservation, RailDevice } from '../../shared/device-rail'
import { DeviceDialog } from './DeviceDialog'
import { DeviceEditor, MacroEditor } from './DeviceEditors'
import { DeviceMacros, endpoint } from './DeviceMacros'
import { DeviceStatus, DeviceTime, useObservationClock } from './DeviceStatus'
import { deviceError, type DeviceRailController } from './useDeviceRail'
import './devicerail.css'

type DetailAction = {kind:'edit'|'delete'} | {kind:'editMacro'; macro?:DeviceMacro} | {kind:'deleteMacro'; macro:DeviceMacro}

function Observation({ label, target, observation, configured = true, now }: {
  label: string; target: string; observation?: DeviceObservation; configured?: boolean; now: number
}) {
  return <section className="device-observation" aria-label={label + ' 검사 결과'}>
    <div className="device-observation-top"><h4>{label}</h4><DeviceStatus observation={observation} configured={configured} now={now}/></div>
    {target && <p className="device-endpoint device-mono">{target}</p>}
    {configured && <>
      {observation?.message && <p>{observation.message}</p>}
      <div className="device-times">
        <span>마지막 검사 <DeviceTime at={observation?.checkedAt ?? null}/></span>
        <span>마지막 성공 <DeviceTime at={observation?.lastSuccessAt ?? null}/></span>
        {observation?.checking && <span>검사 중…</span>}
      </div>
    </>}
  </section>
}

function DeviceDetail({ device, rail, now, onOpenSsh }: {
  device: RailDevice; rail: DeviceRailController; now: number; onOpenSsh: (device: RailDevice) => void | Promise<void>
}) {
  const [action, setAction] = useState<DetailAction | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<'favorite'|'ssh'|null>(null)
  const health = rail.snapshot.health[device.id]
  async function invoke(kind: 'favorite' | 'ssh') {
    if (busy) return
    setBusy(kind)
    setError('')
    try {
      if (kind === 'favorite') await rail.save({...device, favorite: !device.favorite})
      else await onOpenSsh(device)
    } catch (cause) { setError(deviceError(cause)) }
    finally { setBusy(null) }
  }
  const close = () => setAction(null)
  const serviceTarget = device.service.kind === 'http' ? device.service.url :
    device.service.kind === 'tcp' ? 'TCP ' + endpoint(device.host, device.service.port) : ''
  return <section className="workrail-surface device-detail" aria-label="장비 상세">
    <header className="device-detail-head">
      <h3>{device.name}</h3>
      {device.location && <span className="device-sub">{device.location}</span>}
      <button type="button" aria-label="Home 즐겨찾기" aria-pressed={device.favorite} disabled={!!busy}
        title={device.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'} className="device-icon-button" onClick={() => void invoke('favorite')}>
        <Star size={16} fill={device.favorite ? 'currentColor' : 'none'} aria-hidden="true"/>
      </button>
      <button type="button" className="device-icon-button" aria-label="장비 수정" title="장비 수정" onClick={() => setAction({kind:'edit'})}><Pencil size={15}/></button>
      <button type="button" className="device-icon-button" aria-label="장비 삭제" title="장비 삭제" onClick={() => setAction({kind:'delete'})}><Trash2 size={15}/></button>
    </header>
    <p className="device-address">{endpoint(device.host, device.port)}</p>
    {device.description && <p className="device-metadata" aria-label="장비 설명">{device.description}</p>}
    <Observation label="SSH" target={'포트 ' + device.port} now={now} observation={health?.ssh}/>
    <Observation label="제품 서비스" target={serviceTarget} now={now} observation={health?.service} configured={device.service.kind !== 'none'}/>
    <div className="device-action-bar">
      <button type="button" className="workrail-control" disabled={!!busy} onClick={() => void invoke('ssh')}><Terminal size={15} aria-hidden="true"/>SSH 열기</button>
    </div>
    {error && <p className="device-error" role="alert">{error}</p>}
    <DeviceMacros device={device} rail={rail} edit={macro => setAction({kind:'editMacro', macro})} remove={macro => setAction({kind:'deleteMacro', macro})}/>
    {action?.kind === 'edit' && <DeviceEditor device={device} save={rail.save} close={close}/>}
    {action?.kind === 'editMacro' && <MacroEditor device={device} macro={action.macro} save={rail.save} close={close}/>}
    {action?.kind === 'delete' && <DeviceDialog title="장비 삭제" confirm="삭제" danger onClose={close}
      onSubmit={async () => { await rail.perform(api => api.remove(device.id)) }}>
      <p>‘{device.name}’ 장비와 이 장비에 저장한 매크로를 삭제할까요?</p>
    </DeviceDialog>}
    {action?.kind === 'deleteMacro' && <DeviceDialog title="매크로 삭제" confirm="삭제" danger onClose={close}
      onSubmit={() => rail.save({...device, macros: device.macros.filter(item => item.id !== action.macro.id)})}>
      <p>‘{device.name}’의 ‘{action.macro.name}’ 매크로를 삭제할까요?</p>
    </DeviceDialog>}
  </section>
}

export function DeviceRail({ rail, onOpenSsh }: { rail: DeviceRailController; onOpenSsh: (device: RailDevice) => void | Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const now = useObservationClock()
  const devices = rail.snapshot.devices
  const times = Object.values(rail.snapshot.health).flatMap(health => [health.ssh.checkedAt ?? 0, health.service.checkedAt ?? 0])
  const lastCheck = times.reduce((latest, time) => Math.max(latest, time), 0)
  async function refresh() {
    setRefreshing(true)
    setError('')
    try { await rail.perform(api => api.refresh()) }
    catch (cause) { setError(deviceError(cause)) }
    finally { setRefreshing(false) }
  }
  return <main className="workrail-screen device-screen" aria-label="DeviceRail">
    <header className="device-toolbar"><h2>장비 상태</h2>
      <button type="button" className="workrail-control" disabled={(!devices.length && !rail.error) || refreshing}
        onClick={() => { if (rail.error && !rail.ready) void rail.reload(); else void refresh() }}>
        <RefreshCw size={14} aria-hidden="true"/>{refreshing ? '검사 중…' : '다시 검사'}</button>
      <button type="button" className="workrail-control workrail-primary" disabled={!rail.ready} onClick={() => setCreating(true)}>
        <Plus size={15} aria-hidden="true"/>장비 등록</button>
    </header>
    {(error || rail.error) && <p role="alert" className="device-error">{error || rail.error}</p>}
    {rail.ready && devices.length > 0 ? <div className="device-panels">
      <div className="workrail-surface device-list">
        <div className="device-table-scroll">
          <table className="device-table" aria-label="등록 장비">
            <thead><tr><th scope="col">장비</th><th scope="col">SSH</th><th scope="col">제품 서비스</th></tr></thead>
            <tbody>{devices.map(device => {
              const selected = rail.selected?.id === device.id
              const health = rail.snapshot.health[device.id]
              return <tr key={device.id} data-selected={selected} onClick={() => rail.selectDevice(device.id)}>
                <td><button type="button" className="device-name" aria-pressed={selected}>{device.name}</button>
                  {device.location && <span className="device-sub">{device.location}</span>}</td>
                <td><DeviceStatus observation={health?.ssh} now={now}/></td>
                <td><DeviceStatus observation={health?.service} now={now} configured={device.service.kind !== 'none'}/></td>
              </tr>
            })}</tbody>
          </table>
        </div>
        <footer className="device-table-footer"><span>등록 장비 {devices.length}대 · 점검 필요 {rail.needsAttention}대</span><span>마지막 검사 <DeviceTime at={lastCheck || null}/></span></footer>
      </div>
      {rail.selected && <DeviceDetail key={rail.selected.id} device={rail.selected} rail={rail} now={now} onOpenSsh={onOpenSsh}/>}
    </div> : !rail.error && <p className="workrail-surface device-empty">
      {rail.ready ? <>등록한 장비가 없습니다. 장비 등록에서 SSH 주소와 제품 서비스 검사 대상을 입력하세요.<span className="device-sub">점검 필요 {rail.needsAttention}대</span></> :
        rail.available ? '장비를 불러오는 중…' : '장비 도구를 사용할 수 없습니다.'}
    </p>}
    {creating && <DeviceEditor save={rail.save} close={() => setCreating(false)}/>}
  </main>
}
