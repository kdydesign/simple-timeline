import type {DatabaseHandle} from './repository'
import type {UpdateStatus} from '../../shared/updates'
import {compareStableVersions} from '../../shared/updates'
export function addNotificationControls(db:DatabaseHandle){
 db.exec(`CREATE TABLE notification_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)),generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),shared_resume INTEGER NOT NULL DEFAULT 0 CHECK(shared_resume IN (0,1)),changes_resume INTEGER NOT NULL DEFAULT 0 CHECK(changes_resume IN (0,1)),updates_resume INTEGER NOT NULL DEFAULT 0 CHECK(updates_resume IN (0,1))) STRICT;
 INSERT INTO notification_settings(singleton) VALUES(1);
 CREATE TABLE update_notification_deliveries(host_id TEXT NOT NULL,version TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('claimed','suppressed','submitted','failed','unknown')),updated_at TEXT NOT NULL,PRIMARY KEY(host_id,version)) STRICT;
 ALTER TABLE reminder_deliveries ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0 CHECK(suppressed IN (0,1));
 ALTER TABLE sharing_reminder_deliveries ADD COLUMN suppressed INTEGER NOT NULL DEFAULT 0 CHECK(suppressed IN (0,1));`)
}
export function createNotificationStore(db:DatabaseHandle){
 const state=()=>{
  const row=db.prepare('SELECT * FROM notification_settings WHERE singleton=1').get() as Record<string,bigint>|undefined
  if(!row||!['muted','shared_resume','changes_resume','updates_resume'].every(k=>row[k]===0n||row[k]===1n)||!Number.isSafeInteger(Number(row.generation))||row.generation<0n)throw Error('NOTIFICATION_METADATA_INVALID')
  return {muted:!!row.muted,generation:Number(row.generation),sharedResume:!!row.shared_resume,changesResume:!!row.changes_resume,updatesResume:!!row.updates_resume}
 }
 state()
 return {
  state,
  setMuted:db.transaction((muted:boolean,settle:()=>void)=>{
   if(typeof muted!=='boolean')throw Error('Invalid mute setting')
   const before=state();if(before.muted===muted)return before
   if(before.generation>=Number.MAX_SAFE_INTEGER)throw Error('Notification generation exhausted')
   db.prepare('UPDATE notification_settings SET muted=?,generation=generation+1,shared_resume=1,changes_resume=1,updates_resume=1 WHERE singleton=1').run(Number(muted))
   settle()
   db.prepare("UPDATE sharing_change_inbox SET state='cancelled' WHERE state IN ('pending','claimed','failed')").run()
   return state()
  }),
  resumeShared:db.transaction((generation:number,settle:()=>void)=>{
   const s=state()
   if(s.muted||s.sharedResume||s.generation!==generation)settle()
   if(!s.muted&&s.generation===generation)db.prepare('UPDATE notification_settings SET shared_resume=0 WHERE singleton=1').run()
  }),
  consumeChanges:db.transaction((generation=state().generation)=>{
   const s=state(),suppressed=s.muted||s.changesResume||s.generation!==generation
   if(!s.muted&&s.generation===generation)db.prepare('UPDATE notification_settings SET changes_resume=0 WHERE singleton=1').run()
   return suppressed
  }),
  observeUpdate:db.transaction((status:UpdateStatus,generation:number):{hostId:string;version:string}|null=>{
   const s=state(),suppressed=s.muted||s.updatesResume||s.generation!==generation
   if(!s.muted&&s.generation===generation)db.prepare('UPDATE notification_settings SET updates_resume=0 WHERE singleton=1').run()
   if(!status.publication)return null
   const hostId=status.hostId,version=status.publication.manifest.version
   if(!/^[a-f0-9-]{36}$/.test(hostId))throw Error('Invalid notification host')
   compareStableVersions(version,version)
   const added=db.prepare('INSERT OR IGNORE INTO update_notification_deliveries(host_id,version,state,updated_at) VALUES(?,?,?,?)').run(hostId,version,suppressed?'suppressed':'claimed',new Date().toISOString()).changes
   return added&&!suppressed?{hostId,version}:null
  }),
  finishUpdate(hostId:string,version:string,outcome:'submitted'|'failed'|'unknown'|'suppressed'){
   db.prepare("UPDATE update_notification_deliveries SET state=?,updated_at=? WHERE host_id=? AND version=? AND (state='claimed' OR (?='failed' AND state IN ('submitted','unknown')))").run(outcome,new Date().toISOString(),hostId,version,outcome)
  },
  recoverUpdates(){db.prepare("UPDATE update_notification_deliveries SET state='unknown' WHERE state='claimed'").run()},
 }
}
export type NotificationStore=ReturnType<typeof createNotificationStore>

export function checkNotificationSchema(db:DatabaseHandle){
 createNotificationStore(db).state()
 db.prepare('SELECT host_id,version,state,updated_at FROM update_notification_deliveries LIMIT 0').all()
 db.prepare('SELECT suppressed FROM reminder_deliveries LIMIT 0').all()
 db.prepare('SELECT suppressed FROM sharing_reminder_deliveries LIMIT 0').all()
}
