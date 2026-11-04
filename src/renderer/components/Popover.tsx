import {useLayoutEffect,useRef,useState,type RefObject,type ReactNode} from 'react';
export function Popover({anchor,onClose,children,width=290,height,className='',label,id,role='group'}:{
 anchor:RefObject<HTMLElement|null>;onClose:(restoreFocus:boolean)=>void;children:ReactNode;width?:number;height?:number;className?:string;label:string;id?:string;role?:'group'|'region'
}) {
 const root=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
 const [position,setPosition]=useState({left:8,top:8,width,maxHeight:400});
 useLayoutEffect(()=>{
  const place=()=>{
   const a=anchor.current?.getBoundingClientRect(),el=root.current;if(!a||!el)return;
   const margin=8,gap=6,w=Math.max(0,Math.min(width,window.innerWidth-2*margin));
   const below=Math.max(0,window.innerHeight-a.bottom-gap-margin),above=Math.max(0,a.top-gap-margin);
   const desired=height??el.scrollHeight;
   const up=below<desired&&above>below,available=Math.min(up?above:below,Math.max(0,window.innerHeight-2*margin)),h=Math.min(desired,available);
   const next={left:Math.max(margin,Math.min(a.left,window.innerWidth-w-margin)),top:Math.max(margin,Math.min(up?a.top-gap-h:a.bottom+gap,window.innerHeight-h-margin)),width:w,maxHeight:available};
   setPosition(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);
  };
  place();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(place):null;
  if(root.current)observer?.observe(root.current);if(anchor.current)observer?.observe(anchor.current);
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!anchor.current?.contains(e.target as Node))close.current(false)};
  document.addEventListener('pointerdown',outside);
  return()=>{observer?.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);document.removeEventListener('pointerdown',outside)};
 },[anchor,width,height]);
 // Keep nested controls inside their editor DOM so its focus trap includes them.
 return <div ref={root} id={id} role={role} aria-label={label} className={`floating-popover ${className}`} style={{...position,height,position:'fixed'}}
 onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current(true)}}}
 onBlur={e=>{if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget as Node)&&!anchor.current?.contains(e.relatedTarget as Node))close.current(false)}}>{children}</div>
}
