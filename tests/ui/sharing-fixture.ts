import {vi,afterEach} from 'vitest'
import type {SharingApi,SharingState} from '../../src/shared/sharing'
export const personalState:SharingState={role:'personal',roleHistory:null,address:null,port:47831,hostingEnabled:false,status:'personal',message:'개인 전용',lastCheckedAt:null,pendingPair:null,pendingPairs:[],devices:[],projects:[],settingsRequestToken:null,availableAddresses:['192.168.0.10'],snapshotRevision:0,cleanupPending:false}
export function sharingFixture(initial:Partial<SharingState>={}) {
 let state={...personalState,...initial};const listeners=new Set<(s:SharingState)=>void>();
 const emit=(update:Partial<SharingState>)=>{state={...state,...update};listeners.forEach(fn=>fn(state))};
 const result=async()=>({ok:true as const,data:state});
 const api:SharingApi={getState:vi.fn(result),configureHost:vi.fn(result),setHosting:vi.fn(result),connect:vi.fn(result),confirmHost:vi.fn(result),approve:vi.fn(result),saveDevice:vi.fn(),revokeDevice:vi.fn(result),deleteDevice:vi.fn(result),saveProject:vi.fn(),saveReminder:vi.fn(),sync:vi.fn(result),disconnect:vi.fn(result),acknowledgeSettings:vi.fn(result),onChange:fn=>{listeners.add(fn);return()=>{listeners.delete(fn)}}};
 window.timelineSharing=api;return{api,emit};
}
afterEach(()=>{delete window.timelineSharing})
