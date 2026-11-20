import {releaseNotes} from './release-content'
export const releaseChannel='release-notes:command',releaseOpened='release-notes:opened',releaseUnload='release-notes:unload'
export interface ReleaseReading {version:string;scrollTop:number}
export type ReleaseCommand='state'|'remember'|'minimize'|'toggle-maximize'|'close'
export interface ReleaseReply {ok:boolean;reading?:ReleaseReading;version?:string;maximized?:boolean}
export interface ReleaseApi {command(command:ReleaseCommand,reading?:ReleaseReading):Promise<ReleaseReply>;onOpen?(listener:()=>void):()=>void}
export function validReleaseReading(value:unknown):value is ReleaseReading {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const r=value as ReleaseReading
 return Object.keys(r).length===2&&releaseNotes.some(n=>n.version===r.version)&&Number.isFinite(r.scrollTop)&&r.scrollTop>=0&&r.scrollTop<=1e7
}
