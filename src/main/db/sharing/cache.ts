import type { DatabaseHandle } from '../repository'
import { RepositoryError } from '../repository'
import type { ReminderStore, DeliveryState } from '../reminders'
import type { ReminderOccurrence } from '../../../domain/reminder'
import { normalizeReminder } from '../../../domain/reminder'
import { parseSharedId, sharedId, validateWireSnapshot } from '../../../domain/sharing'
import type { TimelineSnapshot, ReminderSettings, Schedule } from '../../../shared/types'
import { sortSnapshot } from '../../../domain/sort'
type Row = Record<string, string | bigint>
function schedule(r: Row): Schedule {
  return {id:String(r.id),projectId:String(r.project_id),name:String(r.name),startDate:String(r.start_date),endDate:String(r.end_date),createdAt:String(r.created_at),updatedAt:String(r.updated_at),sharing:'member',reminder:{daysBefore:Number(r.reminder_days),time:String(r.reminder_time),start:!!r.reminder_start,end:!!r.reminder_end}}
}
export function createMemberCache(db: DatabaseHandle) {
  const clear = db.transaction(() => {db.prepare('DELETE FROM sharing_cache_projects').run()})
  const read = db.transaction((): TimelineSnapshot => sortSnapshot({
    projects:(db.prepare('SELECT * FROM sharing_cache_projects').all() as Row[]).map(r=>({id:String(r.id),name:String(r.name),color:String(r.color),participants:JSON.parse(String(r.participants)) as string[],createdAt:String(r.created_at),updatedAt:String(r.updated_at),sharing:'member'})),
    schedules:(db.prepare('SELECT * FROM sharing_cache_schedules').all() as Row[]).map(schedule),
  }))
  const apply = db.transaction((input: unknown) => {
    const data=validateWireSnapshot(input)
    const config=db.prepare('SELECT role,remote_host_id,remote_dataset_id FROM sharing_config WHERE singleton=1').get() as Row | undefined
    if(!config || config.role!=='member' || data.hostId!==config.remote_host_id || data.datasetId!==config.remote_dataset_id)throw new Error('SHARING_IDENTITY_MISMATCH')
    const projectIds=new Set<string>(), scheduleIds=new Set<string>()
    const putProject=db.prepare(`INSERT INTO sharing_cache_projects(id,remote_id,name,color,participants,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,participants=excluded.participants,created_at=excluded.created_at,updated_at=excluded.updated_at`)
    for(const p of data.projects){const id=sharedId(data.hostId,data.datasetId,p.id);projectIds.add(id);putProject.run(id,p.id,p.name,p.color,JSON.stringify(p.participants),p.createdAt,p.updatedAt)}
    const putSchedule=db.prepare(`INSERT INTO sharing_cache_schedules(id,remote_id,project_id,name,start_date,end_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,name=excluded.name,start_date=excluded.start_date,end_date=excluded.end_date,created_at=excluded.created_at,updated_at=excluded.updated_at`)
    for(const s of data.schedules){const id=sharedId(data.hostId,data.datasetId,s.id);scheduleIds.add(id);putSchedule.run(id,s.id,sharedId(data.hostId,data.datasetId,s.projectId),s.name,s.startDate,s.endDate,s.createdAt,s.updatedAt)}
    // Delete individually: no SQL variable/count limit and no replacement of surviving alarm rows.
    for(const r of db.prepare('SELECT id FROM sharing_cache_schedules').all() as Row[])if(!scheduleIds.has(String(r.id)))db.prepare('DELETE FROM sharing_cache_schedules WHERE id=?').run(String(r.id))
    for(const r of db.prepare('SELECT id FROM sharing_cache_projects').all() as Row[])if(!projectIds.has(String(r.id)))db.prepare('DELETE FROM sharing_cache_projects WHERE id=?').run(String(r.id))
    return read()
  })
  const saveReminder = db.transaction(({id,reminder}:{id:string;reminder:ReminderSettings}):Schedule => {
    parseSharedId(id)
    const config=db.prepare('SELECT role FROM sharing_config WHERE singleton=1').get() as Row | undefined
    if(config?.role!=='member')throw new Error('SHARING_ROLE_FORBIDDEN')
    const row=db.prepare('SELECT * FROM sharing_cache_schedules WHERE id=?').get(id) as Row | undefined
    if(!row)throw new RepositoryError()
    const r=normalizeReminder(reminder,String(row.start_date),String(row.end_date))
    db.prepare('UPDATE sharing_cache_schedules SET reminder_days=?,reminder_time=?,reminder_start=?,reminder_end=? WHERE id=?').run(r.daysBefore,r.time,Number(r.start),Number(r.end),id)
    return schedule(db.prepare('SELECT * FROM sharing_cache_schedules WHERE id=?').get(id) as Row)
  })
  return {apply,read,clear,saveReminder}
}
export function createSharedReminderStore(db: DatabaseHandle): ReminderStore {
  const insert=db.prepare("INSERT OR IGNORE INTO sharing_reminder_deliveries(identity,schedule_id,state,updated_at) SELECT ?,id,'claimed',? FROM sharing_cache_schedules WHERE id=?")
  const retry=db.prepare("UPDATE sharing_reminder_deliveries SET state='claimed',updated_at=? WHERE identity=? AND schedule_id=? AND state='failed'")
  return {
    claim:db.transaction((items:ReminderOccurrence[],allowRetry:boolean)=>items.filter(o=>{
      parseSharedId(o.scheduleId)
      const now=new Date().toISOString()
      if(insert.run(o.key,now,o.scheduleId).changes)return true
      return allowRetry && !!retry.run(now,o.key,o.scheduleId).changes
    })),
    finish:db.transaction((keys:string[],state:Exclude<DeliveryState,'claimed'>)=>{
      const q=db.prepare("UPDATE sharing_reminder_deliveries SET state=?,updated_at=? WHERE identity=? AND (state='claimed' OR (?='failed' AND state IN ('submitted','unknown')))")
      for(const key of keys)q.run(state,new Date().toISOString(),key,state)
    }),
    recover:()=>{db.prepare("UPDATE sharing_reminder_deliveries SET state='unknown' WHERE state='claimed'").run()},
    state:(key:string)=>(db.prepare('SELECT state FROM sharing_reminder_deliveries WHERE identity=?').get(key) as {state:DeliveryState}|undefined)?.state,
    issues:()=>{const counts={failed:0,unknown:0};for(const r of db.prepare("SELECT state,count(*) AS n FROM sharing_reminder_deliveries WHERE state IN ('failed','unknown') GROUP BY state").all() as {state:'failed'|'unknown';n:bigint}[])counts[r.state]=Number(r.n);return counts},
  }
}
