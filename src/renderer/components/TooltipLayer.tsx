import {useEffect,useId,useState} from 'react';
import {createPortal} from 'react-dom';
export function TooltipLayer() {
 const id=useId(),[tip,setTip]=useState<{text:string;x:number;y:number;above:boolean}|null>(null);
 useEffect(()=>{
  let target:HTMLButtonElement|null=null;
  const hide=()=>{if(target){const refs=(target.getAttribute('aria-describedby')??'').split(' ').filter(v=>v&&v!==id);if(refs.length)target.setAttribute('aria-describedby',refs.join(' '));else target.removeAttribute('aria-describedby')}target=null;setTip(null)};
  const show=(event:Event)=>{
   const b=(event.target as Element)?.closest<HTMLButtonElement>('button');
   if(!b||b.closest('[inert],[hidden]')){hide();return}if(b===target)return;
   hide();const text=b.getAttribute('data-tooltip')||b.getAttribute('title')||b.getAttribute('aria-label')||b.textContent?.trim();if(!text)return;
   target=b;const r=b.getBoundingClientRect();b.setAttribute('aria-describedby',`${b.getAttribute('aria-describedby')??''} ${id}`.trim());
   setTip({text,x:Math.max(8,Math.min(r.left,window.innerWidth-Math.min(360,window.innerWidth-16)-8)),y:r.bottom+8,above:r.bottom+80>window.innerHeight});
  };
  const leave=(e:Event)=>{if(!target?.contains((e as MouseEvent).relatedTarget as Node))hide()};
  document.addEventListener('pointerover',show);document.addEventListener('focusin',show);document.addEventListener('pointerout',leave);document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide);window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
  return()=>{hide();document.removeEventListener('pointerover',show);document.removeEventListener('focusin',show);document.removeEventListener('pointerout',leave);document.removeEventListener('focusout',hide);document.removeEventListener('pointerdown',hide);window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide)};
 },[id]);
 return tip?createPortal(<div id={id} role="tooltip" className="app-tooltip" style={{left:tip.x,top:tip.above?undefined:tip.y,bottom:tip.above?Math.max(8,window.innerHeight-tip.y+44):undefined}}>{tip.text}</div>,document.body):null;
}
