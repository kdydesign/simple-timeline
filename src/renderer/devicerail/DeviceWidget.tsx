import { ToolIcon } from '../workrail/ToolIcon'
import { DeviceStatus, useObservationClock } from './DeviceStatus'
import type { DeviceRailController } from './useDeviceRail'
import './devicerail.css'

export function DeviceWidget({ rail, onOpen }: { rail: DeviceRailController; onOpen: () => void }) {
  const favorites = rail.snapshot.devices.filter(item => item.favorite)
  const now = useObservationClock()
  return <section className="workrail-surface workrail-widget device-widget" aria-labelledby="device-home-heading">
    <header className="workrail-widget-heading workrail-favorites-heading">
      <h3 id="device-home-heading">서버 상태 즐겨찾기</h3><ToolIcon tool="devicerail" size={17}/>
    </header>
    {rail.ready && favorites.length > 0 &&
      <ul className="device-favorites-list" aria-labelledby="device-home-heading">{favorites.slice(0, 5).map(device => {
        const health = rail.snapshot.health[device.id]
        return <li key={device.id}>
          <button type="button" className="device-widget-name" onClick={() => { rail.selectDevice(device.id); onOpen() }}>{device.name}</button>
          <span className="device-widget-states">
            <DeviceStatus observation={health?.ssh} prefix="SSH" now={now}/>
            <DeviceStatus observation={health?.service} configured={device.service.kind !== 'none'} prefix="서비스" now={now}/>
          </span>
        </li>
      })}</ul>}
    {rail.error && <p role="alert" className="device-error">{rail.error}</p>}
    {rail.ready && !favorites.length && <p className="workrail-muted">장비 상세에서 별표를 누르면 두 접속 상태가 여기에 표시됩니다.</p>}
    {rail.ready && <p className="device-widget-total">전체 장비 중 점검 필요 {rail.needsAttention}대</p>}
    {!rail.ready && !rail.error && <p className="workrail-muted">{rail.available ? '장비를 불러오는 중…' : '장비 도구를 사용할 수 없습니다.'}</p>}
    <div className="workrail-widget-meta">
      <span>{rail.ready && '즐겨찾기 ' + favorites.length + '대'}</span>
      <button type="button" className="workrail-link" onClick={onOpen}>DeviceRail 열기</button>
    </div>
  </section>
}
