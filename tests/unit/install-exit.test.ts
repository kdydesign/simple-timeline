import {it,expect} from 'vitest'
import {parseInstallExit,createInstallExit} from '../../src/main/install-exit'
import {createMutationBarrier} from '../../src/main/updates/installer'
const target='C:\\Users\\Member\\Apps\\Planrail.exe'
it('accepts only an explicit absolute canonical matching target; rejects missing, ambiguous, other paths',()=>{
 expect(parseInstallExit(['app'],target)).toBe('none')
 expect(parseInstallExit(['--planrail-install-exit','--planrail-install-target',target.toUpperCase()],target)).toBe('valid')
 for(const args of [['--planrail-install-exit'],['--planrail-install-exit','--planrail-install-target','D:\\other\\Planrail.exe'],['--planrail-install-exit','--planrail-install-target','Planrail.exe'],['--planrail-install-exit','--planrail-install-target',target,'--planrail-install-target',target]])expect(parseInstallExit(args,target)).toBe('invalid')
})
it('queues an early install request, drains accepted writes, and never reopens editing after shutdown fails',async()=>{
 const barrier=createMutationBarrier(),events:string[]=[];let finish!:()=>void
 const accepted=barrier.run(()=>new Promise<void>(r=>{finish=()=>{events.push('commit');r()}}));await Promise.resolve()
 const exit=createInstallExit(barrier);const requested=exit.request();expect(barrier.blocked()).toBe(true)
 await expect(barrier.run(()=>events.push('late'))).rejects.toThrow()
 exit.ready(async()=>{events.push('shutdown');throw Error('DB close failed')});finish();await accepted
 await expect(requested).rejects.toThrow('DB close failed');expect(events).toEqual(['commit','shutdown']);expect(barrier.blocked()).toBe(true)
})
it('deduplicates requests and waits until initialization provides a safe shutdown path',async()=>{
 const exit=createInstallExit(createMutationBarrier());let closed=0
 const first=exit.request(),second=exit.request();expect(first).toBe(second);await Promise.resolve();expect(closed).toBe(0)
 exit.ready(async()=>{closed++});await first;expect(closed).toBe(1)
})
it('allows a safe cleanup retry after failure while keeping the write barrier closed',async()=>{
 const barrier=createMutationBarrier(),exit=createInstallExit(barrier);let attempts=0
 exit.ready(async()=>{if(++attempts===1)throw Error('transient close failure')})
 await expect(exit.request()).rejects.toThrow('transient close failure');expect(barrier.blocked()).toBe(true)
 await expect(exit.request()).resolves.toBeUndefined();expect(attempts).toBe(2);expect(barrier.blocked()).toBe(true)
})
