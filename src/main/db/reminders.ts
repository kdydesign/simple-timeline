import type {DatabaseHandle} from './repository'
import type {ReminderOccurrence} from '../../domain/reminder'
export type DeliveryState='claimed'|'submitted'|'failed'|'unknown'|'suppressed'
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
 const hasRoles=!!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sharing_role_state'").get()
 const insert=db.prepare("INSERT OR IGNORE INTO reminder_deliveries(identity,schedule_id,state,updated_at) VALUES(?,?,'claimed',?)")
 const retry=db.prepare("UPDATE reminder_deliveries SET state='claimed',updated_at=? WHERE identity=? AND state='failed' AND suppressed=0")
 return {
  claim:db.transaction((items:ReminderOccurrence[],allowRetry:boolean):ReminderOccurrence[]=>items.filter(o=>{
   const active=!hasRoles||db.prepare("SELECT 1 FROM schedules s WHERE s.id=? AND (NOT EXISTS(SELECT 1 FROM sharing_projects p WHERE p.project_id=s.project_id) OR ((SELECT role FROM sharing_config)='host' AND (SELECT target FROM sharing_role_state) IS NULL))").get(BigInt(o.scheduleId))
   if(!active)return false
   const now=new Date().toISOString()
   if(insert.run(o.key,BigInt(o.scheduleId),now).changes)return true
   return allowRetry && !!retry.run(now,o.key).changes
  })),
  finish:db.transaction((keys:string[],state:Exclude<DeliveryState,'claimed'|'suppressed'>)=>{
   const q=db.prepare("UPDATE reminder_deliveries SET state=?,updated_at=? WHERE identity=? AND suppressed=0 AND (state='claimed' OR (?='failed' AND state IN ('submitted','unknown')))")
   for(const key of keys)q.run(state,new Date().toISOString(),key,state)
  }),
  recover:()=>{db.prepare("UPDATE reminder_deliveries SET state='unknown' WHERE state='claimed' AND suppressed=0").run()},
  state:(key:string)=>{const row=db.prepare('SELECT state,suppressed FROM reminder_deliveries WHERE identity=?').get(key) as {state:DeliveryState;suppressed:bigint}|undefined;return row?.suppressed?'suppressed':row?.state},
  suppress:db.transaction((items:ReminderOccurrence[])=>{for(const o of items){insert.run(o.key,BigInt(o.scheduleId),new Date().toISOString());db.prepare("UPDATE reminder_deliveries SET suppressed=1 WHERE identity=? AND state IN ('claimed','failed')").run(o.key)}}),
  issues:()=>{
   const counts={failed:0,unknown:0}
   for(const row of db.prepare("SELECT state,count(*) AS n FROM reminder_deliveries WHERE suppressed=0 AND state IN ('failed','unknown') GROUP BY state").all() as {state:'failed'|'unknown';n:bigint}[])counts[row.state]=Number(row.n)
   return counts
  },
 }
}
export interface ReminderStore {
 suppress(items:ReminderOccurrence[]):void
 claim(items:ReminderOccurrence[],retry:boolean):ReminderOccurrence[]
 finish(keys:string[],state:Exclude<DeliveryState,'claimed'|'suppressed'>):void
 recover():void
 state(key:string):DeliveryState|undefined
 issues():{failed:number;unknown:number}
}
