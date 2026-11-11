import {useRef,useState,useId} from 'react';
import {Select as Root,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select';
export interface SelectOption {value:string;label:string;color?:string}
export function Select({id,label,value,options,onChange,disabled=false,escapeClipping=false,...accessibility}:{id?:string;label:string;value:string;options:SelectOption[];onChange:(value:string)=>void;disabled?:boolean;escapeClipping?:boolean; "aria-invalid"?:boolean; "aria-describedby"?:string}) {
 const generatedId=useId(),triggerId=id??generatedId;
 const button=useRef<HTMLButtonElement>(null),nextFocus=useRef<HTMLElement|null>(null),opening=useRef(0);
 const [open,setOpen]=useState(false),[container,setContainer]=useState<HTMLSpanElement|null>(null);
 const tab=(reverse:boolean)=>{
  const scope=button.current?.closest('fieldset,.date-popover')??document.body;
  const items=Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type="hidden"]),[tabindex="0"]')).filter(e=>e.tabIndex>=0&&!e.closest('[data-slot="select-content"],[hidden]'));
  const i=items.indexOf(button.current!);nextFocus.current=items[i+(reverse?-1:1)]??button.current;setOpen(false);
 };
 const currentOpening=opening.current;
 return <div className="custom-select"><Root value={value} onValueChange={onChange} disabled={disabled} open={open} onOpenChange={value=>{if(value){opening.current++;nextFocus.current=null}setOpen(value)}}>
  <SelectTrigger {...accessibility} ref={button} id={triggerId} aria-label={label} className="select-trigger"><SelectValue/></SelectTrigger>
  <span ref={setContainer} data-overlay-container=""/>
  {container&&<SelectContent data-select-owner={triggerId} container={escapeClipping?(document.querySelector<HTMLElement>('.saving-content')??document.body):container} position="popper" align="start" sideOffset={6} collisionPadding={{top:48,bottom:9,left:9,right:9}} className="select-popover" aria-label={label}
   onEscapeKeyDown={e=>e.stopPropagation()}
   onKeyDown={e=>{if(e.key==='Escape')e.stopPropagation();if(e.key==='Tab'){e.preventDefault();e.stopPropagation();tab(e.shiftKey)}}}
   onCloseAutoFocus={e=>{
    // Radix defers unmount autofocus: an older popup may finish after a reopen.
    if(currentOpening!==opening.current){e.preventDefault();return}
    if(nextFocus.current){e.preventDefault();nextFocus.current.focus();nextFocus.current=null}
   }}>
   {options.map(o=><SelectItem key={o.value} value={o.value}>{o.color&&<span className="color-dot" style={{backgroundColor:o.color}}/>}<span>{o.label}</span></SelectItem>)}
  </SelectContent>}
 </Root></div>
}
