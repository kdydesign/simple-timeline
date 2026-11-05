import {useState,useEffect,useRef,type ReactNode} from 'react';
import {parseBusinessDate} from '../../domain/date';
import {shiftSelectedDate} from '../state/dateNavigation';
import {DatePicker} from './DatePicker';
import {IconButton} from './Icon';
import {Popover} from './Popover';
export function Toolbar({selectedDate,onDate,onInvalid,canEdit,hasProjects,onProject,onSchedule,onProjects,projectsOpen,mode,onMode,onToday,theme,onTheme,projectList}: {
 selectedDate:string;onDate:(date:string)=>void;onInvalid:()=>void;canEdit:boolean;hasProjects:boolean;onProject:()=>void;onSchedule:()=>void;onProjects:(open:boolean)=>void;projectsOpen:boolean;mode:'gantt'|'calendar';onMode:(mode:'gantt'|'calendar')=>void;onToday?:()=>void;theme?:'light'|'dark';onTheme?:()=>void;projectList?:ReactNode;
}) {
 const [text,setText]=useState(selectedDate);
 const folder=useRef<HTMLSpanElement>(null);
 useEffect(()=>{setText(selectedDate)},[selectedDate]);
 useEffect(()=>{if(projectsOpen)folder.current?.querySelector<HTMLElement>('.project-popup button')?.focus()},[projectsOpen]);
 const apply=(value:string,origin?:"blur")=>{if(origin==="blur" && value===selectedDate)return;try{onDate(parseBusinessDate(value))}catch{setText(selectedDate);onInvalid()}};
 const closeProjects=(restore:boolean)=>{onProjects(false);if(restore)folder.current?.querySelector<HTMLElement>('[data-project-trigger]')?.focus()};
 return <header className="toolbar">
 <span ref={folder} className="project-anchor"><IconButton icon="folder" label="프로젝트 목록" data-project-trigger aria-expanded={projectsOpen} aria-controls="project-popup" onClick={()=>onProjects(!projectsOpen)}/>
 {projectsOpen&&<Popover id="project-popup" anchor={folder} onClose={closeProjects} label="프로젝트 목록" role="region" className="project-popup" width={290} height={442}>
 <div className="project-popup-heading"><h2>프로젝트 목록</h2><IconButton icon="close" label="목록 닫기" onClick={()=>closeProjects(true)}/></div>
 {projectList}
 <div className="project-popup-footer"><button type="button" disabled={!canEdit} onClick={()=>{onProjects(false);onProject()}}>프로젝트 추가</button></div>
 </Popover>}</span>
 <span className="toolbar-view-title">{mode==='gantt'?'전체 일정':'월간 달력'}</span>
 <nav aria-label="조회 모드" className="mode-switch"><IconButton icon="gantt" label="간트" aria-pressed={mode==='gantt'} onClick={()=>onMode('gantt')}/><IconButton icon="calendar" label="달력" aria-pressed={mode==='calendar'} onClick={()=>onMode('calendar')}/></nav>
 <nav aria-label="조회 날짜" className="month-controls"><IconButton icon="left" label="이전 달" disabled={!shiftSelectedDate(selectedDate,-1)} onClick={()=>onDate(shiftSelectedDate(selectedDate,-1)!)}/>
 <span className="month-input"><DatePicker id="selected-date" label="선택 날짜" value={text} onChange={setText} onCommit={apply} noIcon/></span>
 <IconButton icon="right" label="다음 달" disabled={!shiftSelectedDate(selectedDate,1)} onClick={()=>onDate(shiftSelectedDate(selectedDate,1)!)}/><IconButton icon="today" label="오늘" onClick={onToday}/></nav>
 <div className="header-actions"><IconButton icon={theme==='dark'?'sun':'moon'} label={theme==='dark'?'라이트 모드':'다크 모드'} onClick={onTheme}/><IconButton icon="project" label="프로젝트 추가" data-focus="project-add" disabled={!canEdit} onClick={onProject}/><IconButton icon="plus" label="일정 추가" className="primary" data-focus="schedule-add" disabled={!canEdit||!hasProjects} onClick={onSchedule}/></div>
 </header>
}
