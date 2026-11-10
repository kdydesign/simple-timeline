import {it,expect,vi} from 'vitest'
import {renderHook,act,waitFor} from '@testing-library/react'
import {useSharing} from '../../src/renderer/state/useSharing'
import {sharingFixture,personalState} from './sharing-fixture'
import type {SharingApi} from '../../src/shared/sharing'
it('ignores a delayed initial DTO after a newer settings/role event',async()=>{
 const f=sharingFixture();let finish!:(v:Awaited<ReturnType<SharingApi['getState']>>)=>void;f.api.getState=()=>new Promise(resolve=>{finish=resolve});const h=renderHook(()=>useSharing(async()=>true,true));act(()=>f.emit({role:'member',status:'disconnected',settingsRequestToken:'new'}));await act(async()=>finish({ok:true,data:{...personalState,role:'host'}}));expect(h.result.current.state?.role).toBe('member');expect(h.result.current.settingsOpen).toBe(true);
});
it('does not turn green or report manual success when disconnection arrives while applying data',async()=>{
 const f=sharingFixture({role:'member',status:'connected',address:'192.168.0.10'});const apply=vi.fn(async()=>true);const h=renderHook(()=>useSharing(apply,true));await waitFor(()=>expect(h.result.current.state?.status).toBe('connected'));
 let release!:(value:boolean)=>void;apply.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve}));let pending!:Promise<boolean>;act(()=>{pending=h.result.current.sync()});await waitFor(()=>expect(release).toBeTypeOf('function'));act(()=>f.emit({status:'disconnected',message:'연결 실패'}));await act(async()=>{release(true);expect(await pending).toBe(false)});expect(h.result.current.state?.status).toBe('disconnected');expect(h.result.current.error?.message).toContain('연결 실패');
});
