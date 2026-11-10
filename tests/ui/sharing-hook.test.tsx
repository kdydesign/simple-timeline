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

it('clears a manual connection error only after a successful automatic local apply',async()=>{
 const f=sharingFixture({role:'member',status:'disconnected',address:'192.168.0.10',message:'연결 실패'}),apply=vi.fn(async()=>true),h=renderHook(()=>useSharing(apply,true));
 await waitFor(()=>expect(h.result.current.state?.status).toBe('disconnected'));
 await act(async()=>{expect(await h.result.current.sync()).toBe(false)});expect(h.result.current.error?.message).toBe('연결 실패');
 let finish!:(v:boolean)=>void;apply.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
 await act(async()=>f.emit({status:'connected',message:''}));await waitFor(()=>expect(finish).toBeTypeOf('function'));expect(h.result.current.error?.message).toBe('연결 실패');
 await act(async()=>finish(false));expect(h.result.current.error?.message).toBe('연결 실패');
 await act(async()=>f.emit({status:'connected'}));await waitFor(()=>expect(h.result.current.error).toBeNull());
});
it('clears a failed manual application after automatic recovery at the same revision',async()=>{
 const f=sharingFixture({role:'member',status:'connected',address:'192.168.0.10'}),apply=vi.fn(async()=>true),h=renderHook(()=>useSharing(apply,true));
 await waitFor(()=>expect(h.result.current.state?.status).toBe('connected'));await waitFor(()=>expect(apply).toHaveBeenCalled());
 apply.mockResolvedValueOnce(false);await act(async()=>{expect(await h.result.current.sync()).toBe(false)});expect(h.result.current.error?.message).toContain('화면에 반영');
 await act(async()=>f.emit({status:'connected'}));await waitFor(()=>expect(h.result.current.error).toBeNull());
});
it.each(['VALIDATION_ERROR','IPC_UNAVAILABLE'] as const)('automatic success preserves an unrelated settings command error (%s)',async(code)=>{
 const f=sharingFixture({role:'member',status:'connected',address:'192.168.0.10'}),apply=vi.fn(async()=>true),h=renderHook(()=>useSharing(apply,true));await waitFor(()=>expect(h.result.current.state?.status).toBe('connected'));
 await act(async()=>{await h.result.current.run(async()=>({ok:false,error:{code,message:'설정 결과를 확인하세요'}}))});
 await act(async()=>f.emit({status:'connected',snapshotRevision:1}));await waitFor(()=>expect(apply).toHaveBeenCalledTimes(2));expect(h.result.current.error?.message).toBe('설정 결과를 확인하세요');
});
