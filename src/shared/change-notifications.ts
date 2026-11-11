import type { WireSnapshot } from './sharing'
export type ChangeTarget = {kind:'schedule';id:string;projectId:string}|{kind:'project';id:string}|{kind:'list'}
export interface ChangeNotice { id:string; projectId:string|null; title:string; body:string; target:ChangeTarget }
export interface ChangeEnvelope { version:1; snapshot:WireSnapshot; cursor:string; mode:'initial'|'delta'|'reset'; notices:ChangeNotice[] }
