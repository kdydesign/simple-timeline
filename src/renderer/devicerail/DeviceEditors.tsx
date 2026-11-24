import { useState } from 'react'
import type { DeviceCheck, DeviceMacro, RailDevice } from '../../shared/device-rail'
import { hostError, portError } from '../../shared/termrail-endpoint'
import { DeviceDialog } from './DeviceDialog'

const blank: RailDevice = { id:'', name:'', host:'', port:22, location:'', description:'', favorite:false, service:{kind:'none'}, macros:[] }

export function DeviceEditor({ device = blank, save, close }: {
  device?: RailDevice; save: (device: RailDevice) => Promise<void>; close: () => void
}) {
  const [draft, setDraft] = useState(device)
  const [sshPort, setSshPort] = useState(String(device.port))
  const [serviceKind, setServiceKind] = useState(device.service.kind)
  const [url, setUrl] = useState(device.service.kind === 'http' ? device.service.url : '')
  const [productPort, setProductPort] = useState(device.service.kind === 'tcp' ? String(device.service.port) : '')
  function update(patch: Partial<RailDevice>) { setDraft(current => ({...current, ...patch})) }
  async function submit() {
    const invalid = hostError(draft.host.trim()) || portError(sshPort) || (serviceKind === 'tcp' && portError(productPort))
    if (invalid) throw new Error(invalid)
    const service: DeviceCheck = serviceKind === 'http' ? {kind: 'http', url: url.trim()} :
      serviceKind === 'tcp' ? {kind: 'tcp', port: Number(productPort)} : {kind: 'none'}
    await save({...draft, name: draft.name.trim(), host: draft.host.trim(), port: Number(sshPort), macros: device.macros, service})
  }
  return <DeviceDialog title={device.id ? '장비 수정' : '장비 등록'} confirm="저장" onSubmit={submit} onClose={close}>
    <label>장비 이름<input required maxLength={256} value={draft.name} onChange={e => update({name:e.target.value})}/></label>
    <div className="device-input-pair">
      <label>SSH 주소<input required autoCapitalize="none" spellCheck={false} maxLength={253} value={draft.host} onChange={e => update({host:e.target.value})}/></label>
      <label>SSH 포트<input required type="number" min="1" max="65535" value={sshPort} onChange={e => setSshPort(e.target.value)}/></label>
    </div>
    <label>위치<input maxLength={512} value={draft.location} onChange={e => update({location:e.target.value})}/></label>
    <label>설명<textarea rows={2} maxLength={16384} value={draft.description} onChange={e => update({description:e.target.value})}/></label>
    <label>제품 서비스 검사<select value={serviceKind} onChange={e => setServiceKind(e.target.value as DeviceCheck['kind'])}>
      <option value="none">미설정</option><option value="http">HTTP(S) 상태 URL</option><option value="tcp">TCP 포트</option>
    </select></label>
    {serviceKind === 'http' && <div className="device-service-field"><label>상태 URL<input aria-describedby="device-service-hint" required type="url" autoCapitalize="none" spellCheck={false} maxLength={8192} value={url} onChange={e => setUrl(e.target.value)}/></label>
      <small id="device-service-hint">HTTP 상태 코드 200~299를 정상으로 표시합니다.</small></div>}
    {serviceKind === 'tcp' && <div className="device-service-field"><label>제품 포트<input aria-describedby="device-service-hint" required type="number" min="1" max="65535" value={productPort} onChange={e => setProductPort(e.target.value)}/></label>
      <small id="device-service-hint">이 포트에 TCP로 연결할 수 있는지 확인합니다.</small></div>}
    <label className="device-check"><input type="checkbox" checked={draft.favorite} onChange={e => update({favorite:e.target.checked})}/>Home 즐겨찾기</label>
  </DeviceDialog>
}

export function MacroEditor({ device, macro, save, close }: {
  device: RailDevice; macro?: DeviceMacro; save: (device: RailDevice) => Promise<void>; close: () => void
}) {
  const [name, setName] = useState(macro?.name ?? '')
  const [commands, setCommands] = useState(macro?.commands ?? '')
  async function submit() {
    const next: DeviceMacro = { id: macro?.id ?? crypto.randomUUID(), name: name.trim(), commands }
    const macros = macro ? device.macros.map(item => item.id === macro.id ? next : item) : [...device.macros, next]
    await save({...device, macros})
  }
  return <DeviceDialog title={macro ? '매크로 수정' : '매크로 추가'} confirm="저장" onSubmit={submit} onClose={close}>
    <p>{device.name} <span className="device-mono">{device.host}</span></p>
    <label>매크로 이름<input required maxLength={256} value={name} onChange={e => setName(e.target.value)}/></label>
    <label>셸 명령<textarea className="device-code-field" rows={7} spellCheck={false} autoCapitalize="none" required maxLength={65536}
      value={commands} onChange={e => setCommands(e.target.value)}/></label>
  </DeviceDialog>
}
