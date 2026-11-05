import {it,expect} from 'vitest'
import {normalizeReminder,dueReminders,DEFAULT_REMINDER} from '../../src/domain/reminder'
import {schedule} from '../fixtures/timeline'
it('defaults off and validates integer days and HH:mm even when disabled',()=>{
 expect(normalizeReminder(undefined,'0001-01-01','0001-01-01')).toEqual({daysBefore:2,time:'09:00',start:false,end:false})
 for(const daysBefore of [-1,366,1.5,'2',NaN])expect(()=>normalizeReminder({...DEFAULT_REMINDER,daysBefore},'2026-01-01','2026-01-02')).toThrow()
 for(const time of ['9:00','24:00','09:60',''])expect(()=>normalizeReminder({...DEFAULT_REMINDER,time},'2026-01-01','2026-01-02')).toThrow()
 expect(()=>normalizeReminder({...DEFAULT_REMINDER,start:true},'0001-01-01','0001-01-03')).toThrow()
})
it('evaluates calendar days and today only, not elapsed UTC hours',()=>{
 const s={...schedule('1','1','2024-03-01','2024-03-01'),reminder:{daysBefore:2,time:'09:00',start:true,end:true}}
 expect(dueReminders(s,new Date(2024,1,28,8,59))).toEqual([])
 expect(dueReminders(s,new Date(2024,1,28,9,0)).map(x=>x.kind)).toEqual(['start','end'])
 expect(dueReminders(s,new Date(2024,1,29,9))).toEqual([])
 expect(dueReminders({...s,reminder:{...s.reminder,daysBefore:0}},new Date(2024,2,1,13))).toHaveLength(2)
})
it('identity survives names and toggles but changes with target, days or time',()=>{
 const s={...schedule(),reminder:{daysBefore:0,time:'09:00',start:true,end:false}}, now=new Date(2026,10,11,12)
 const key=dueReminders(s,now)[0].key
 expect(dueReminders({...s,name:'new'},now)[0].key).toBe(key)
 expect(dueReminders({...s,reminder:{...s.reminder,time:'10:00'}},now)[0].key).not.toBe(key)
})
it('supports 365 calendar days and year boundaries without changing date limits',()=>{
 const s={...schedule('1','1','2025-01-01','2025-01-01'),reminder:{daysBefore:365,time:'00:00',start:true,end:false}}
 expect(dueReminders(s,new Date(2024,0,2,0))).toHaveLength(1)
 expect(normalizeReminder({...s.reminder,daysBefore:0},'9999-12-31','9999-12-31').daysBefore).toBe(0)
})
