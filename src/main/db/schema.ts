import type { DatabaseHandle } from './repository'
const dateCheck = (col: string) =>
  `length(${col})=10 AND ${col} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(${col},1,4) BETWEEN '0001' AND '9999' AND CAST(substr(${col},6,2) AS INTEGER) BETWEEN 1 AND 12 AND CAST(substr(${col},9,2) AS INTEGER) BETWEEN 1 AND CASE CAST(substr(${col},6,2) AS INTEGER) WHEN 2 THEN CASE WHEN CAST(substr(${col},1,4) AS INTEGER)%4=0 AND (CAST(substr(${col},1,4) AS INTEGER)%100!=0 OR CAST(substr(${col},1,4) AS INTEGER)%400=0) THEN 29 ELSE 28 END WHEN 4 THEN 30 WHEN 6 THEN 30 WHEN 9 THEN 30 WHEN 11 THEN 30 ELSE 31 END`
export function createSchema(db: DatabaseHandle): void {
  db.exec(`
 CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK(length(trim(name))>0 AND name=trim(name)),
  color TEXT NOT NULL CHECK(color GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]' AND length(color)=7),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
 ) STRICT;
 CREATE TABLE project_participants (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK(position>=0),name TEXT NOT NULL CHECK(length(trim(name))>0 AND name=trim(name)),
  PRIMARY KEY(project_id,position), UNIQUE(project_id,name)
 ) STRICT;
 CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(trim(name))>0 AND name=trim(name)),
  start_date TEXT NOT NULL CHECK(${dateCheck('start_date')}),
  end_date TEXT NOT NULL CHECK(${dateCheck('end_date')} AND end_date>=start_date),
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 ) STRICT;
 CREATE INDEX schedules_project_dates ON schedules(project_id,start_date,end_date,id);
 `)
}
