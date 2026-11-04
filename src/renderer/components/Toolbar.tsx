import {useState,useEffect,useRef,type ReactNode} from 'react';
import type {YearMonth} from '../../shared/types';
import {shiftMonth,validateYearMonth} from '../../domain/date';
import {IconButton} from './Icon';
import {Popover} from './Popover';
import {Select} from './Select';
const label=(v:YearMonth)=>`${String(v.year).padStart(4,'0')}-${String(v.month).padStart(2,'0')}`;
export function Toolbar({month,onMonth,onInvalid,canEdit,hasProjects,onProject,onSchedule,onProjects,projectsOpen,mode,onMode,onToday,theme,onTheme,projectList}: {
 month:YearMonth;onMonth:(m:YearMonth)=>void;onInvalid:()=>void;canEdit:boolean;hasProjects:boolean;onProject:()=>void;onSchedule:()=>void;onProjects:(open:boolean)=>void;projectsOpen:boolean;mode:'gantt'|'calendar';onMode:(mode:'gantt'|'calendar')=>void;onToday?:()=>void;theme?:'light'|'dark';onTheme?:()=>void;projectList?:ReactNode;
}) {
 const [text,setText]=useState(label(month)),[monthOpen,setMonthOpen]=useState(false),[year,setYear]=useState(String(month.year));
 const folder=useRef<HTMLSpanElement>(null),monthAnchor=useRef<HTMLSpanElement>(null);
 useEffect(()=>{setText(label(month));setYear(String(month.year))},[month]);
 useEffect(()=>{if(projectsOpen)folder.current?.querySelector<HTMLElement>('.project-popup button')?.focus()},[projectsOpen]);
 useEffect(()=>{if(monthOpen)monthAnchor.current?.querySelector<HTMLInputElement>('[aria-label="조회 연도"]')?.focus()},[monthOpen]);
 const apply=()=>{try{if(!/^\d{4}-\d{2}$/.test(text))throw Error();const [year,month]=text.split('-').map(Number);const m={year,month};validateYearMonth(m);onMonth(m)}catch{setText(label(month));onInvalid()}};
 const closeProjects=(restore:boolean)=>{onProjects(false);if(restore)folder.current?.querySelector<HTMLElement>('[data-project-trigger]')?.focus()};
 const closeMonth=(restore:boolean)=>{setMonthOpen(false);if(restore)monthAnchor.current?.querySelector<HTMLElement>('[data-month-trigger]')?.focus()};
 const commitYear=()=>{const y=Number(year);if(Number.isInteger(y)&&y>=1&&y<=9999)onMonth({...month,year:y});else{setYear(String(month.year));onInvalid()}};
 return <header className="toolbar">
 <span ref={folder} className="project-anchor"><IconButton icon="folder" label="프로젝트 목록" data-project-trigger aria-expanded={projectsOpen} aria-controls="project-popup" onClick={()=>onProjects(!projectsOpen)}/>
 {projectsOpen&&<Popover id="project-popup" anchor={folder} onClose={closeProjects} label="프로젝트 목록" role="region" className="project-popup" width={290} height={442}>
 <div className="project-popup-heading"><h2>프로젝트 목록</h2><IconButton icon="close" label="목록 닫기" onClick={()=>closeProjects(true)}/></div>
 {projectList}
 <div className="project-popup-footer"><button type="button" disabled={!canEdit} onClick={()=>{onProjects(false);onProject()}}>프로젝트 추가</button></div>
 </Popover>}</span>
 <span className="toolbar-view-title">{mode==='gantt'?'전체 일정':'월간 달력'}</span>
 <nav aria-label="조회 모드" className="mode-switch"><IconButton icon="gantt" label="간트" aria-pressed={mode==='gantt'} onClick={()=>onMode('gantt')}/><IconButton icon="calendar" label="달력" aria-pressed={mode==='calendar'} onClick={()=>onMode('calendar')}/></nav>
 <nav aria-label="조회 연월" className="month-controls"><IconButton icon="left" label="이전 달" disabled={!shiftMonth(month,-1)} onClick={()=>onMonth(shiftMonth(month,-1)!)}/>
 <span ref={monthAnchor} className="month-input"><input aria-label="선택 연월" value={text} placeholder="YYYY-MM" onChange={e=>setText(e.target.value)} onBlur={apply} onKeyDown={e=>{if(e.key==='Enter')apply()}}/><IconButton icon="down" label="조회 연월 선택" data-month-trigger aria-expanded={monthOpen} onClick={()=>setMonthOpen(v=>!v)}/>
 {monthOpen&&<Popover anchor={monthAnchor} onClose={closeMonth} label="조회 연월 선택" width={250}><div className="month-popover"><input aria-label="조회 연도" type="number" min="1" max="9999" value={year} onChange={e=>setYear(e.target.value)} onBlur={commitYear} onKeyDown={e=>{if(e.key==='Enter')commitYear()}}/><Select label="조회 월" value={String(month.month)} options={Array.from({length:12},(_,i)=>({value:String(i+1),label:`${i+1}월`}))} onChange={v=>onMonth({...month,month:Number(v)})}/></div></Popover>}</span>
 <IconButton icon="right" label="다음 달" disabled={!shiftMonth(month,1)} onClick={()=>onMonth(shiftMonth(month,1)!)}/><IconButton icon="today" label="오늘" onClick={onToday??(()=>{const d=new Date();onMonth({year:d.getFullYear(),month:d.getMonth()+1})})}/></nav>
 <div className="header-actions"><IconButton icon={theme==='dark'?'sun':'moon'} label={theme==='dark'?'라이트 모드':'다크 모드'} onClick={onTheme}/><IconButton icon="project" label="프로젝트 추가" data-focus="project-add" disabled={!canEdit} onClick={onProject}/><IconButton icon="plus" label="일정 추가" className="primary" data-focus="schedule-add" disabled={!canEdit||!hasProjects} onClick={onSchedule}/></div>
 </header>
}
