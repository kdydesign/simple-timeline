import type {DatabaseHandle} from './repository'
import type {ReminderOccurrence} from '../../domain/reminder'
export type DeliveryState='claimed'|'submitted'|'failed'|'unknown'
export function addReminders(db:DatabaseHandle) {
 db.exec(`ALTER TABLE schedules ADD COLUMN reminder_days INTEGER NOT NULL DEFAULT 2 CHECK(reminder_days BETWEEN 0 AND 365);
 ALTER TABLE schedules ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '09:00' CHECK(length(reminder_time)=5 AND reminder_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(reminder_time,1,2)<='23');
 ALTER TABLE schedules ADD COLUMN reminder_start INTEGER NOT NULL DEFAULT 0 CHECK(reminder_start IN (0,1));
 ALTER TABLE schedules ADD COLUMN reminder_end INTEGER NOT NULL DEFAULT 0 CHECK(reminder_end IN (0,1));
 CREATE TABLE reminder_deliveries (
  identity TEXT PRIMARY KEY, schedule_id INTEGER NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK(state IN ('claimed','submitted','failed','unknown')),
  updated_at TEXT NOT NULL
 ) STRICT;
 CREATE INDEX reminder_deliveries_schedule ON reminder_deliveries(schedule_id);`)
}
export function createReminderStore(db:DatabaseHandle):ReminderStore {
 const insert=db.prepare("INSERT OR IGNORE INTO reminder_deliveries(identity,schedule_id,state,updated_at) VALUES(?,?,'claimed',?)")
 const retry=db.prepare("UPDATE reminder_deliveries SET state='claimed',updated_at=? WHERE identity=? AND state='failed'")
 return {
  claim:db.transaction((items:ReminderOccurrence[],allowRetry:boolean):ReminderOccurrence[]=>items.filter(o=>{
   const now=new Date().toISOString()
   if(insert.run(o.key,BigInt(o.scheduleId),now).changes)return true
   return allowRetry && !!retry.run(now,o.key).changes
  })),
  finish:db.transaction((keys:string[],state:Exclude<DeliveryState,'claimed'>)=>{
   const q=db.prepare("UPDATE reminder_deliveries SET state=?,updated_at=? WHERE identity=? AND state='claimed'")
   for(const key of keys)q.run(state,new Date().toISOString(),key)
  }),
  recover:()=>{db.prepare("UPDATE reminder_deliveries SET state='unknown' WHERE state='claimed'").run()},
  state:(key:string)=>(db.prepare('SELECT state FROM reminder_deliveries WHERE identity=?').get(key) as {state:DeliveryState}|undefined)?.state,
  issues:()=>{
   const counts={failed:0,unknown:0}
   for(const row of db.prepare("SELECT state,count(*) AS n FROM reminder_deliveries WHERE state IN ('failed','unknown') GROUP BY state").all() as {state:'failed'|'unknown';n:bigint}[])counts[row.state]=Number(row.n)
   return counts
  },
 }
}
export interface ReminderStore {
 claim(items:ReminderOccurrence[],retry:boolean):ReminderOccurrence[]
 finish(keys:string[],state:Exclude<DeliveryState,'claimed'>):void
 recover():void
 state(key:string):DeliveryState|undefined
 issues():{failed:number;unknown:number}
}
