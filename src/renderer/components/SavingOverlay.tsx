import {useLayoutEffect,useRef,useState} from 'react'
import {restoreFocus} from '../state/restoreFocus'
export function SavingOverlay({state,onBlockingChange}:{state:'idle'|'pending'|'confirmed'|'failed';onBlockingChange:(value:boolean)=>void}) {
 const [visible,setVisible]=useState(false),caller=useRef<HTMLElement|null>(null),shield=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  if(state==='pending'){
   if(!visible)caller.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
   setVisible(true);
  }else if(state==='confirmed'){
   const timer=window.setTimeout(()=>setVisible(false),180);return()=>window.clearTimeout(timer);
  }else setVisible(false);
 },[state]);
 useLayoutEffect(()=>{
  const content=document.querySelector<HTMLElement>('.saving-content');
  onBlockingChange(visible);
  if(!content)return;
  if(visible){content.setAttribute('inert','');shield.current?.focus();return()=>{if(document.documentElement.dataset.updateFrozen!=='true')content.removeAttribute('inert')}}
  const target=caller.current;caller.current=null;
  if(target?.isConnected&&!target.closest('[inert],[hidden]')&&!target.matches(':disabled'))restoreFocus(target);
 },[visible]);
 if(!visible)return null;
 return <div ref={shield} tabIndex={-1} className={`saving-shield${state==='confirmed'?' is-complete':''}`} onKeyDown={e=>{if(e.key!=='Tab'&&!e.altKey&&!e.metaKey){e.preventDefault();e.stopPropagation()}}}><div className="saving-progress" aria-hidden="true"/><span className="sr-only" aria-live="polite">{state==='confirmed'?'저장을 완료했습니다.':'저장 중…'}</span></div>
}
