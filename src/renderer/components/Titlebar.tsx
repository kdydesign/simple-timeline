import {useEffect,useState} from 'react';
import {Icon,IconButton} from './Icon';
import type {WindowCommand} from '../../shared/window-api';
export function Titlebar() {
 const [maximized,setMaximized]=useState(false);
 const command=async(action:WindowCommand)=>{const result=await window.timelineWindow?.command(action);if(result?.ok)setMaximized(!!result.maximized)};
 useEffect(()=>{const sync=()=>void command('state');sync();window.addEventListener('resize',sync);window.addEventListener('focus',sync);return()=>{window.removeEventListener('resize',sync);window.removeEventListener('focus',sync)}},[]);
 return <div className="titlebar"><div className="brand"><span className="brand-mark"><Icon name="gantt"/></span><h1>Planrail</h1></div><div className="window-controls"><IconButton icon="minimize" label="최소화" onClick={()=>void command('minimize')}/><IconButton icon={maximized?'restore':'maximize'} label={maximized?'이전 크기로 복원':'최대화'} onClick={()=>void command('toggle-maximize')}/><IconButton icon="close" label="창 닫기" className="window-close" onClick={()=>void command('close')}/></div></div>
}
