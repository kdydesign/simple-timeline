import {useMemo} from 'react';
import type {Project,TimelineSnapshot} from '../../shared/types';
import {indexSnapshot} from '../../visualization/presentation';
import {IconButton} from './Icon';
export function ProjectList({snapshot,disabled,onProject,onAdd}:{snapshot:TimelineSnapshot;disabled:boolean;onProject:(p:Project)=>void;onAdd:(p:Project)=>void}) {
 const index=useMemo(()=>indexSnapshot(snapshot),[snapshot]);
 return <div className="project-scroll" tabIndex={0} aria-label="프로젝트 목록 스크롤">
 {!index.projects.length&&<p className="empty-projects">프로젝트를 추가해 일정을 관리하세요</p>}
 {index.projects.map(p=><div className="project-list-row" key={p.id}>
  <span className="color-dot" style={{backgroundColor:p.color}}/>
  <button className="project-list-name" data-focus={`project:${p.id}`} aria-label={`${index.projectLabel(p)} 편집`} disabled={disabled} onClick={()=>onProject(p)}><strong>{index.projectLabel(p)}</strong><small>{p.participants.join(' · ')||'참여자 없음'} · 일정 {index.byProject.get(p.id)?.length??0}개</small></button>
  <IconButton icon="plus" label={`${index.projectLabel(p)}에 일정 추가`} data-focus={`add:${p.id}`} disabled={disabled} onClick={()=>onAdd(p)}/>
 </div>)}
 </div>
}
