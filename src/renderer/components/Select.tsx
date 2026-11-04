import {useEffect,useId,useRef,useState} from 'react';
import {Popover} from './Popover';
import {Icon} from './Icon';
export interface SelectOption {value:string;label:string;color?:string}
export function Select({id,label,value,options,onChange,disabled=false}:{id?:string;label:string;value:string;options:SelectOption[];onChange:(value:string)=>void;disabled?:boolean}) {
 const button=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null),uid=useId();
 const [open,setOpen]=useState(false),[active,setActive]=useState(0);
 const selected=options.find(o=>o.value===value);
 const close=(restore:boolean)=>{setOpen(false);if(restore)button.current?.focus()};
 const show=()=>{setActive(Math.max(0,options.findIndex(o=>o.value===value)));setOpen(true)};
 useEffect(()=>{if(open){list.current?.focus();list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({block:'nearest'})}},[open,active]);
 return <div className="custom-select"><button ref={button} type="button" id={id} role="combobox" aria-label={label} aria-expanded={open} aria-controls={`${uid}-list`} aria-haspopup="listbox" className="select-trigger" disabled={disabled} onClick={()=>open?close(false):show()} onKeyDown={e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();show();if(e.key==='End')setActive(options.length-1)}}}>
 {selected?.color&&<span className="color-dot" style={{backgroundColor:selected.color}}/>}<span>{selected?.label??''}</span><Icon name="down"/></button>
 {open&&<Popover anchor={button} onClose={close} width={Math.max(180,button.current?.getBoundingClientRect().width??0)} label={`${label} 선택`} className="select-popover"><div ref={list} role="listbox" id={`${uid}-list`} aria-label={label} tabIndex={0} aria-activedescendant={`${uid}-${active}`} onKeyDown={e=>{
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setActive(i=>e.key==='Home'?0:e.key==='End'?options.length-1:Math.max(0,Math.min(options.length-1,i+(e.key==='ArrowDown'?1:-1))))}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(options[active])onChange(options[active].value);close(true)}
  else if(e.key==='Tab'){close(true)}
  else if(e.key.length===1&&!e.ctrlKey&&!e.metaKey){const i=options.findIndex(o=>o.label.toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase()));if(i>=0)setActive(i)}
 }}>{options.map((o,i)=><div key={o.value} id={`${uid}-${i}`} role="option" aria-selected={o.value===value} data-active={i===active} onMouseMove={()=>setActive(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(o.value);close(true)}}>{o.color&&<span className="color-dot" style={{backgroundColor:o.color}}/>}<span>{o.label}</span>{o.value===value&&<Icon name="check"/>}</div>)}</div></Popover>}
 </div>
}
