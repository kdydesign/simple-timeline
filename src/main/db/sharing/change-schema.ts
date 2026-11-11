import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '../repository'
export function addChangeNotifications(db:DatabaseHandle):void {
 db.exec(`
 CREATE TABLE sharing_change_grants(device_id TEXT NOT NULL,project_id TEXT NOT NULL,generation TEXT NOT NULL,PRIMARY KEY(device_id,project_id)) STRICT;
 CREATE TABLE sharing_change_streams(device_id TEXT PRIMARY KEY,last_seq INTEGER NOT NULL DEFAULT 0,floor_seq INTEGER NOT NULL DEFAULT 0) STRICT;
 CREATE TABLE sharing_change_events(seq INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL,project_id TEXT NOT NULL,generation TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('grant','revoke','project','schedule')),entity_id TEXT NOT NULL,before_value TEXT,after_value TEXT,occurred_at TEXT NOT NULL) STRICT;
 CREATE INDEX sharing_change_recipient_events ON sharing_change_events(device_id,seq);
 CREATE TABLE sharing_change_cursors(token TEXT PRIMARY KEY,device_id TEXT NOT NULL,binding TEXT NOT NULL,seq INTEGER NOT NULL,UNIQUE(device_id,binding,seq)) STRICT;
 CREATE TABLE sharing_change_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),baselining INTEGER NOT NULL DEFAULT 0 CHECK(baselining IN (0,1)),cursor TEXT,revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))) STRICT;
 INSERT INTO sharing_change_settings(singleton) VALUES(1);
 CREATE TABLE sharing_change_inbox(id TEXT PRIMARY KEY,project_id TEXT,payload TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('pending','claimed','submitted','failed','unknown','cancelled')),baseline TEXT,window_cursor TEXT NOT NULL,updated_at TEXT NOT NULL) STRICT;
 `)
 // Existing v4 ACL starts at this generation. Upgraded members use their initial summary.
 const put=db.prepare('INSERT INTO sharing_change_grants(device_id,project_id,generation) VALUES(?,?,?)')
 for(const r of db.prepare('SELECT device_id,project_id FROM sharing_recipients').all() as {device_id:string;project_id:bigint}[])put.run(r.device_id,String(r.project_id),randomUUID())
}
/** Missing metadata is corruption, never an instruction to recreate a baseline. */
export function checkChangeSchema(db:DatabaseHandle):void {
 const row=db.prepare('SELECT enabled,baselining,cursor,revoked FROM sharing_change_settings WHERE singleton=1').get() as {enabled:bigint;baselining:bigint;cursor:string|null;revoked:bigint}|undefined
 if(!row||![0n,1n].includes(row.enabled)||![0n,1n].includes(row.baselining)||![0n,1n].includes(row.revoked))throw new Error('CHANGE_METADATA_MISSING')
 for(const [table,columns] of Object.entries({sharing_change_grants:'device_id,project_id,generation',sharing_change_streams:'device_id,last_seq,floor_seq',sharing_change_events:'seq,device_id,project_id,generation,kind,entity_id,before_value,after_value,occurred_at',sharing_change_cursors:'token,device_id,binding,seq',sharing_change_inbox:'id,project_id,payload,state,baseline,window_cursor,updated_at'}))db.prepare(`SELECT ${columns} FROM ${table} LIMIT 1`).get()
 if(db.prepare(`SELECT 1 FROM sharing_recipients r JOIN sharing_devices d ON d.id=r.device_id LEFT JOIN sharing_change_grants g ON g.device_id=r.device_id AND g.project_id=CAST(r.project_id AS TEXT) WHERE d.revoked=0 AND g.generation IS NULL LIMIT 1`).get())throw new Error('CHANGE_GRANT_MISSING')
 if(db.prepare(`SELECT 1 FROM sharing_change_events e LEFT JOIN sharing_change_streams s ON s.device_id=e.device_id WHERE s.device_id IS NULL OR s.last_seq<e.seq OR s.floor_seq>s.last_seq LIMIT 1`).get())throw new Error('CHANGE_STREAM_MISSING')
}
