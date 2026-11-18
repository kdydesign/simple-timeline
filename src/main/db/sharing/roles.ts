import type {DatabaseHandle} from '../repository'

/** Keep the active compatibility config separate from each role's durable identity. */
export function addSharingRoles(db:DatabaseHandle){
 db.exec(`CREATE TABLE sharing_role_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 host_address TEXT,host_port INTEGER NOT NULL DEFAULT 47831,
 host_pin TEXT,host_certificate_ref TEXT,host_private_key_ref TEXT,
 member_address TEXT,member_port INTEGER NOT NULL DEFAULT 47831,member_pin TEXT,
 target TEXT CHECK(target IN ('host','member')),
 phase TEXT CHECK(phase IN ('stopping','cleanup','failed')),
 generation INTEGER NOT NULL DEFAULT 0 CHECK(generation>=0),
 CHECK((target IS NULL)=(phase IS NULL))
 ) STRICT;
 INSERT INTO sharing_role_state(singleton,host_address,host_port,host_pin,host_certificate_ref,host_private_key_ref,member_address,member_port,member_pin)
 SELECT 1,CASE WHEN role_history='host' THEN address END,CASE WHEN role_history='host' THEN port ELSE 47831 END,
 CASE WHEN role_history='host' THEN certificate_pin END,certificate_ref,private_key_ref,
 CASE WHEN role_history='member' THEN address END,CASE WHEN role_history='member' THEN port ELSE 47831 END,
 CASE WHEN role_history='member' THEN certificate_pin END FROM sharing_config;
 CREATE TRIGGER dormant_project_update BEFORE UPDATE ON projects WHEN EXISTS(SELECT 1 FROM sharing_projects WHERE project_id=OLD.id) AND ((SELECT role FROM sharing_config)<>'host' OR (SELECT target FROM sharing_role_state) IS NOT NULL) BEGIN SELECT RAISE(ABORT,'SHARING_DORMANT_READONLY'); END;
 CREATE TRIGGER dormant_project_delete BEFORE DELETE ON projects WHEN EXISTS(SELECT 1 FROM sharing_projects WHERE project_id=OLD.id) AND ((SELECT role FROM sharing_config)<>'host' OR (SELECT target FROM sharing_role_state) IS NOT NULL) BEGIN SELECT RAISE(ABORT,'SHARING_DORMANT_READONLY'); END;
 CREATE TRIGGER dormant_schedule_insert BEFORE INSERT ON schedules WHEN EXISTS(SELECT 1 FROM sharing_projects WHERE project_id=NEW.project_id) AND ((SELECT role FROM sharing_config)<>'host' OR (SELECT target FROM sharing_role_state) IS NOT NULL) BEGIN SELECT RAISE(ABORT,'SHARING_DORMANT_READONLY'); END;
 CREATE TRIGGER dormant_schedule_update BEFORE UPDATE ON schedules WHEN EXISTS(SELECT 1 FROM sharing_projects WHERE project_id IN (OLD.project_id,NEW.project_id)) AND ((SELECT role FROM sharing_config)<>'host' OR (SELECT target FROM sharing_role_state) IS NOT NULL) BEGIN SELECT RAISE(ABORT,'SHARING_DORMANT_READONLY'); END;
 CREATE TRIGGER dormant_schedule_delete BEFORE DELETE ON schedules WHEN EXISTS(SELECT 1 FROM sharing_projects WHERE project_id=OLD.project_id) AND ((SELECT role FROM sharing_config)<>'host' OR (SELECT target FROM sharing_role_state) IS NOT NULL) BEGIN SELECT RAISE(ABORT,'SHARING_DORMANT_READONLY'); END;`)
}

export function checkSharingRoles(db:DatabaseHandle){
 const row=db.prepare('SELECT singleton,target,phase,generation,host_address,host_port,host_pin,host_certificate_ref,host_private_key_ref,member_address,member_port,member_pin FROM sharing_role_state WHERE singleton=1').get()
 if(!row)throw Error('SHARING_ROLE_METADATA_MISSING')
}
