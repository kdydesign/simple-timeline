import {randomUUID} from 'node:crypto'
import type {DatabaseHandle} from '../repository'
import {DEFAULT_HOLIDAYS,type HolidayEnvelope} from '../../../shared/holidays'
import {validateHolidayCalendar,validateHolidayEnvelope,reportedVersion} from '../../../domain/holidays'
import {createNotificationStore} from '../notifications'
type Row=Record<string,string|bigint|null>
export interface DeviceVersion {version:string|null;checkedAt:string}
export function addSharingExtras(db:DatabaseHandle){
 db.exec(`ALTER TABLE sharing_credentials ADD COLUMN installation_id TEXT;
 UPDATE sharing_credentials SET installation_id=(SELECT installation_id FROM sharing_devices WHERE id=sharing_credentials.device_id);
 CREATE TABLE sharing_holidays(singleton INTEGER PRIMARY KEY CHECK(singleton=1),revision TEXT NOT NULL,calendar TEXT NOT NULL) STRICT;
 CREATE TABLE sharing_holiday_cache(singleton INTEGER PRIMARY KEY CHECK(singleton=1),envelope TEXT NOT NULL,received_at TEXT NOT NULL) STRICT;
 CREATE TABLE sharing_device_versions(device_id TEXT PRIMARY KEY REFERENCES sharing_devices(id),installation_id TEXT NOT NULL,version TEXT,checked_at TEXT NOT NULL) STRICT;
 CREATE TABLE pairing_notification_deliveries(device_id TEXT NOT NULL REFERENCES sharing_devices(id),pair_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('claimed','suppressed','submitted','failed','unknown')),observed_ms INTEGER NOT NULL,attempted_ms INTEGER,PRIMARY KEY(device_id,pair_id)) STRICT;
 CREATE TRIGGER sharing_clear_holidays AFTER UPDATE OF role ON sharing_config WHEN NEW.role='personal' BEGIN DELETE FROM sharing_holiday_cache; END;
 CREATE TRIGGER sharing_clear_device_extras AFTER UPDATE OF installation_id,deleted ON sharing_devices WHEN NEW.deleted=1 OR NEW.installation_id IS NOT OLD.installation_id BEGIN DELETE FROM sharing_device_versions WHERE device_id=NEW.id; END;
 CREATE TRIGGER sharing_clear_device_notices AFTER UPDATE OF deleted ON sharing_devices WHEN NEW.deleted=1 BEGIN DELETE FROM pairing_notification_deliveries WHERE device_id=NEW.id; END;`)
 db.prepare('INSERT INTO sharing_holidays VALUES(1,?,?)').run(randomUUID(),JSON.stringify(DEFAULT_HOLIDAYS))
}
export function createSharingExtras(db:DatabaseHandle){
 const config=()=>db.prepare('SELECT * FROM sharing_config WHERE singleton=1').get() as Row
 const hostCalendar=():HolidayEnvelope=>{
  const c=config(),r=db.prepare('SELECT * FROM sharing_holidays WHERE singleton=1').get() as Row|undefined
  if(!r)throw Error('HOLIDAY_METADATA_MISSING')
  return validateHolidayEnvelope({schemaVersion:1,hostId:c.host_id,datasetId:c.dataset_id,revision:r.revision,calendar:JSON.parse(String(r.calendar))})
 }
 const cachedCalendar=():{envelope:HolidayEnvelope;receivedAt:string}|null=>{
  const r=db.prepare('SELECT * FROM sharing_holiday_cache WHERE singleton=1').get() as Row|undefined
  if(!r)return null
  const envelope=validateHolidayEnvelope(JSON.parse(String(r.envelope))),c=config()
  if(c.role!=='member'||envelope.hostId!==c.remote_host_id||envelope.datasetId!==c.remote_dataset_id)throw Error('HOLIDAY_CACHE_IDENTITY')
  if(!Number.isFinite(Date.parse(String(r.received_at))))throw Error('HOLIDAY_CACHE_TIME')
  return {envelope,receivedAt:String(r.received_at)}
 }
 return {
  hostCalendar,cachedCalendar,
  saveCalendar:db.transaction((value:unknown)=>{
   if(config().role!=='host')throw Error('SHARING_ROLE_FORBIDDEN')
   const calendar=validateHolidayCalendar(value),before=hostCalendar()
   if(JSON.stringify(before.calendar)!==JSON.stringify(calendar))db.prepare('UPDATE sharing_holidays SET revision=?,calendar=? WHERE singleton=1').run(randomUUID(),JSON.stringify(calendar))
   return hostCalendar()
  }),
  applyCalendar:db.transaction((value:unknown)=>{
   const envelope=validateHolidayEnvelope(value),c=config()
   if(c.role!=='member'||c.remote_host_id!==envelope.hostId||c.remote_dataset_id!==envelope.datasetId)throw Error('HOLIDAY_CACHE_IDENTITY')
   db.prepare('INSERT INTO sharing_holiday_cache VALUES(1,?,?) ON CONFLICT(singleton) DO UPDATE SET envelope=excluded.envelope,received_at=excluded.received_at').run(JSON.stringify(envelope),new Date().toISOString())
  }),
  clearCalendar(){db.prepare('DELETE FROM sharing_holiday_cache').run()},
  recordVersion(deviceId:string,value:unknown,now=Date.now()){
   const d=db.prepare('SELECT installation_id FROM sharing_devices WHERE id=? AND revoked=0 AND deleted=0').get(deviceId) as Row|undefined
   if(!d?.installation_id)return
   const version=reportedVersion(value),r=db.prepare('SELECT * FROM sharing_device_versions WHERE device_id=?').get(deviceId) as Row|undefined
   if(r&&r.version===version&&r.installation_id===d.installation_id&&now-Date.parse(String(r.checked_at))<60000)return
   db.prepare('INSERT INTO sharing_device_versions VALUES(?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET installation_id=excluded.installation_id,version=excluded.version,checked_at=excluded.checked_at').run(deviceId,d.installation_id,version,new Date(now).toISOString())
  },
  versions():Record<string,DeviceVersion>{
   return Object.fromEntries((db.prepare('SELECT v.* FROM sharing_device_versions v JOIN sharing_devices d ON d.id=v.device_id AND d.installation_id=v.installation_id WHERE d.deleted=0').all() as Row[]).map(r=>[String(r.device_id),{version:reportedVersion(r.version),checkedAt:String(r.checked_at)}]))
  },
  claimPair:db.transaction((deviceId:string,pairId:string,now=Date.now())=>{
   const d=db.prepare('SELECT id FROM sharing_devices WHERE id=? AND revoked=0 AND deleted=0').get(deviceId)
   if(!d||config().role!=='host')return false
   db.prepare('DELETE FROM pairing_notification_deliveries WHERE observed_ms<?').run(now-7*86400000)
   const last=db.prepare('SELECT MAX(attempted_ms) AS last FROM pairing_notification_deliveries WHERE device_id=?').get(deviceId) as Row
   const suppressed=createNotificationStore(db).state().muted||(last.last!==null&&now-Number(last.last)<60000)
   const added=db.prepare('INSERT OR IGNORE INTO pairing_notification_deliveries VALUES(?,?,?,?,?)').run(deviceId,pairId,suppressed?'suppressed':'claimed',now,suppressed?null:now).changes
   return !!added&&!suppressed
  }),
  finishPair(deviceId:string,pairId:string,outcome:'submitted'|'failed'|'unknown'|'suppressed'){
   db.prepare("UPDATE pairing_notification_deliveries SET state=? WHERE device_id=? AND pair_id=? AND (state='claimed' OR (?='failed' AND state IN ('submitted','unknown')))").run(outcome,deviceId,pairId,outcome)
  },
  recoverPairs(){db.prepare("UPDATE pairing_notification_deliveries SET state='unknown' WHERE state='claimed'").run()},
 }
}
export function checkSharingExtras(db:DatabaseHandle){
 const s=createSharingExtras(db);s.hostCalendar();s.cachedCalendar();s.versions()
 db.prepare('SELECT installation_id FROM sharing_credentials LIMIT 0').all()
 db.prepare('SELECT device_id,pair_id,state,observed_ms,attempted_ms FROM pairing_notification_deliveries LIMIT 0').all()
}
