import { randomUUID } from 'node:crypto'
import type { DatabaseHandle } from '../repository'
import { dateCheck } from '../schema'
export function addSharing(db: DatabaseHandle): void {
  db.exec(`
  CREATE TABLE sharing_config (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    host_id TEXT NOT NULL CHECK(length(host_id)=36), dataset_id TEXT NOT NULL CHECK(length(dataset_id)=36),
    role TEXT NOT NULL DEFAULT 'personal' CHECK(role IN ('personal','host','member')),
    role_history TEXT CHECK(role_history IN ('host','member')),
    address TEXT, port INTEGER NOT NULL DEFAULT 47831 CHECK(port BETWEEN 1 AND 65535),
    hosting_enabled INTEGER NOT NULL DEFAULT 0 CHECK(hosting_enabled IN (0,1)),
    remote_host_id TEXT, remote_dataset_id TEXT, certificate_pin TEXT, credential_ref TEXT,
    certificate_ref TEXT, private_key_ref TEXT, pending_credential_delete_ref TEXT,
    CHECK((role='personal') OR role=role_history),
    CHECK(hosting_enabled=0 OR role='host'),
    CHECK(pending_credential_delete_ref IS NULL OR (role='personal' AND credential_ref IS NULL))
  ) STRICT;
  CREATE TABLE sharing_devices (
    id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name))>0 AND name=trim(name)),
    ip TEXT NOT NULL, installation_id TEXT,
    revoked INTEGER NOT NULL DEFAULT 0 CHECK(revoked IN (0,1))
  ) STRICT;
  CREATE UNIQUE INDEX sharing_active_ip ON sharing_devices(ip) WHERE revoked=0;
  CREATE UNIQUE INDEX sharing_active_installation ON sharing_devices(installation_id) WHERE revoked=0 AND installation_id IS NOT NULL;
  CREATE TABLE sharing_credentials (
    hash TEXT PRIMARY KEY CHECK(length(hash)=64 AND hash NOT GLOB '*[^0-9a-f]*'),
    device_id TEXT NOT NULL REFERENCES sharing_devices(id),
    status TEXT NOT NULL CHECK(status IN ('pending','active','revoked'))
  ) STRICT;
  CREATE UNIQUE INDEX sharing_one_active_credential ON sharing_credentials(device_id) WHERE status='active';
  CREATE TABLE sharing_projects (project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE) STRICT;
  CREATE TABLE sharing_recipients (
    project_id INTEGER NOT NULL REFERENCES sharing_projects(project_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position>=0),
    device_id TEXT NOT NULL REFERENCES sharing_devices(id),
    PRIMARY KEY(project_id,position), UNIQUE(project_id,device_id),
    FOREIGN KEY(project_id,position) REFERENCES project_participants(project_id,position) ON DELETE CASCADE
  ) STRICT;
  CREATE TABLE sharing_cache_projects (
    id TEXT PRIMARY KEY, remote_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, color TEXT NOT NULL, participants TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  ) STRICT;
  CREATE TABLE sharing_cache_schedules (
    id TEXT PRIMARY KEY, remote_id TEXT NOT NULL UNIQUE,
    project_id TEXT NOT NULL REFERENCES sharing_cache_projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL CHECK(${dateCheck('start_date')}),
    end_date TEXT NOT NULL CHECK(${dateCheck('end_date')} AND end_date>=start_date),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    reminder_days INTEGER NOT NULL DEFAULT 2 CHECK(reminder_days BETWEEN 0 AND 365),
    reminder_time TEXT NOT NULL DEFAULT '09:00' CHECK(length(reminder_time)=5 AND reminder_time GLOB '[0-2][0-9]:[0-5][0-9]' AND substr(reminder_time,1,2)<='23'),
    reminder_start INTEGER NOT NULL DEFAULT 0 CHECK(reminder_start IN (0,1)),
    reminder_end INTEGER NOT NULL DEFAULT 0 CHECK(reminder_end IN (0,1))
  ) STRICT;
  CREATE TABLE sharing_reminder_deliveries (
    identity TEXT PRIMARY KEY, schedule_id TEXT NOT NULL REFERENCES sharing_cache_schedules(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('claimed','submitted','failed','unknown')),updated_at TEXT NOT NULL
  ) STRICT;
  CREATE INDEX sharing_deliveries_schedule ON sharing_reminder_deliveries(schedule_id);
  `)
  db.prepare('INSERT INTO sharing_config(singleton,host_id,dataset_id) VALUES(1,?,?)').run(randomUUID(),randomUUID())
}
