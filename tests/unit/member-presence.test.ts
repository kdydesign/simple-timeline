import {afterEach,expect,it,vi} from 'vitest'
import {createMemberPresence} from '../../src/main/sharing/presence'
afterEach(()=>vi.useRealTimers())
it('uses monotonic 10 seconds, expires within one second and clears identity on invalidation',()=>{
 vi.useFakeTimers();let now=0,wall=new Date('2026-11-16T00:00:00Z');const changed=vi.fn()
 const p=createMemberPresence({now:()=>now,wallClock:()=>wall,changed})
 expect(p.snapshot(['a']).a).toEqual({connected:false,lastSeenAt:null})
 p.record('a');expect(p.snapshot(['a']).a.connected).toBe(true)
 wall=new Date('2020-01-01');now=10000;expect(p.snapshot(['a']).a.connected).toBe(true)
 now=10001;changed.mockClear();vi.advanceTimersByTime(1000);expect(changed).toHaveBeenCalledOnce()
 expect(p.snapshot(['a']).a).toEqual({connected:false,lastSeenAt:'2026-11-16T00:00:00.000Z'})
 p.record('a');p.invalidate('a');expect(p.snapshot(['a']).a.lastSeenAt).toBeNull()
 p.record('b');p.invalidate();expect(p.snapshot(['b']).b.connected).toBe(false)
 p.dispose();changed.mockClear();vi.advanceTimersByTime(2000);expect(changed).not.toHaveBeenCalled()
})
