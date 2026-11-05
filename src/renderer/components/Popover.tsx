import {useState,type RefObject,type ReactNode} from 'react';
import {Popover as Root,PopoverAnchor,PopoverContent} from './ui/popover';
// Portals belong to the local editor/date tree, so containment and its Tab trap agree.
export function Popover({anchor,onClose,children,width=290,height,className='',label,id,role='group'}:{
 anchor:RefObject<HTMLElement|null>;onClose:(restoreFocus:boolean)=>void;children:ReactNode;width?:number;height?:number;className?:string;label:string;id?:string;role?:'group'|'region'
}) {
 const [container,setContainer]=useState<HTMLSpanElement|null>(null);
 return <Root open onOpenChange={open=>{if(!open)onClose(false)}}>
  <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>}/>
  <span ref={setContainer} data-overlay-container=""/>
  {container&&<PopoverContent container={container} id={id} role={role} aria-label={label} className={`floating-popover ${className}`}
   align="start" sideOffset={6} collisionPadding={{top:48,bottom:9,left:9,right:9}} style={{width:`min(${width}px, calc(100vw - 16px))`,height,maxHeight:'var(--radix-popover-content-available-height)'}}
   onOpenAutoFocus={e=>{e.preventDefault();if(role==='region')container.querySelector<HTMLElement>('button')?.focus()}}
   onCloseAutoFocus={e=>e.preventDefault()}
   onInteractOutside={e=>{if(anchor.current?.contains(e.target as Node))e.preventDefault()}}
   onEscapeKeyDown={e=>{e.preventDefault();e.stopPropagation();onClose(true)}}
   onKeyDown={e=>{if(e.key==='Escape')e.stopPropagation()}}
   onBlur={e=>{if(e.relatedTarget&&!container.contains(e.relatedTarget as Node)&&!anchor.current?.contains(e.relatedTarget as Node))onClose(false)}}>{children}</PopoverContent>}
 </Root>
}
