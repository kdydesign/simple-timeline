import {afterEach,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({instances:[] as any[]}))
vi.mock('electron',async()=>{
 const {EventEmitter}=await import('node:events')
 return {Notification:class extends EventEmitter {
  static isSupported(){return true}
  constructor(public options:unknown){super();mocks.instances.push(this)}
  show(){}
 }}
})
import {createNativeReminderSender} from '../../src/main/reminders/native'
afterEach(()=>{mocks.instances=[];vi.useRealTimers()})
it('keeps action-center click activation after the Windows banner times out',async()=>{
 const native=createNativeReminderSender('icon'),click=vi.fn()
 const sent=native.send({title:'P / S',body:'오늘 시작'},click),n=mocks.instances[0]
 n.emit('show');expect(await sent).toBe('submitted')
 n.emit('close',{reason:'timedOut'});n.emit('click');expect(click).toHaveBeenCalledTimes(1);native.dispose()
})
it('reports an asynchronous Windows failure even after Show succeeded',async()=>{
 const native=createNativeReminderSender('icon'),failure=vi.fn()
 const sent=native.send({title:'P / S',body:'오늘 시작'},()=>{},failure),n=mocks.instances[0]
 n.emit('show');expect(await sent).toBe('submitted');n.emit('failed',{},'notification platform error');expect(failure).toHaveBeenCalledTimes(1);native.dispose()
})
it('unknown timeout retains activation until click or app shutdown',async()=>{
 vi.useFakeTimers();const native=createNativeReminderSender('icon'),click=vi.fn()
 const sent=native.send({title:'P / S',body:'오늘 시작'},click),n=mocks.instances[0]
 await vi.advanceTimersByTimeAsync(5000);expect(await sent).toBe('unknown');n.emit('click');expect(click).toHaveBeenCalledTimes(1);native.dispose()
})
