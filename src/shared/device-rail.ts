// DeviceRail persists only explicitly registered equipment and its named macros.
export type DeviceCheck = {kind:'none'} | {kind:'tcp'; port:number} | {kind:'http'; url:string}
export interface DeviceMacro {id:string; name:string; commands:string}
export interface RailDevice {
  id:string; name:string; host:string; port:number; location:string; description:string
  favorite:boolean; service:DeviceCheck; macros:DeviceMacro[]
}
export interface DeviceObservation {
  state:'unknown'|'ok'|'failed'|'unconfigured'
  checking:boolean; checkedAt:number|null; lastSuccessAt:number|null; message:string
}
export interface DeviceHealth {ssh:DeviceObservation; service:DeviceObservation}
export interface DeviceMacroRun {
  id:string; deviceId:string; macroId:string; deviceName:string; host:string; port:number; macroName:string
  startedAt:number; finishedAt?:number; phase:'connecting'|'host-key'|'login'|'running'|'succeeded'|'failed'|'uncertain'|'cancelled'
  fingerprint?:string; previousFingerprint?:string; account?:string; message?:string; exitCode?:number
  stdout:string; stderr:string; truncated:boolean
}
export interface DeviceMacroState {account?:string; runs:DeviceMacroRun[]}
export interface DeviceSnapshot {
  devices:RailDevice[]; health:Record<string,DeviceHealth>; macroState:Record<string,DeviceMacroState>
}
export interface DeviceRailApi {
  snapshot():Promise<DeviceSnapshot>
  save(device:RailDevice):Promise<void>
  remove(deviceId:string):Promise<void>
  refresh(deviceId?:string):Promise<void>
  runMacro(deviceId:string,macroId:string):Promise<void>
  trust(deviceId:string,runId:string,fingerprint:string):Promise<void>
  login(deviceId:string,runId:string,username:string,password:string):Promise<void>
  disconnect(deviceId:string):Promise<void>
  onChange(listener:()=>void):()=>void
}

export const deviceRailChannel = 'devicerail:command'
export const deviceRailChanged = 'devicerail:changed'
