import {expect,it,vi} from 'vitest'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {Select} from '../../src/renderer/components/Select'

function Form(){
 const [project,setProject]=useState('1')
 return <fieldset><input aria-label="이름"/><Select label="소속 프로젝트" value={project} onChange={setProject} options={[{value:'1',label:'첫 프로젝트'},{value:'2',label:'둘째 프로젝트'}]}/><input aria-label="시작일"/></fieldset>
}
it.each([
 {order:'previous-first',reverse:false,lastClose:'Tab'},{order:'current-first',reverse:false,lastClose:'Tab'},
 {order:'previous-first',reverse:true,lastClose:'Tab'},{order:'current-first',reverse:true,lastClose:'Tab'},
 {order:'previous-first',reverse:false,lastClose:'Enter'},{order:'current-first',reverse:false,lastClose:'Enter'},
])('keeps the latest close destination when two select autofocus callbacks overlap ($order, $lastClose, reverse=$reverse)',async({order,reverse,lastClose})=>{
 const u=userEvent.setup();render(<Form/>);
 const trigger=screen.getByRole('combobox',{name:'소속 프로젝트'});
 await u.click(trigger);await u.click(screen.getByRole('option',{name:'둘째 프로젝트'}));
 await waitFor(()=>expect(trigger).toHaveFocus());
 await u.keyboard('{ArrowDown}');await waitFor(()=>expect(screen.getByRole('option',{name:'둘째 프로젝트'})).toHaveFocus());
 // FocusScope defers close autofocus with setTimeout(0). Hold the old close
 // callback while a new keyboard-opened popup receives Tab, then release both.
 const pending:(()=>void)[]=[];
 const close=(key:string,shiftKey=false)=>{
  const schedule=globalThis.setTimeout;
  const timers=vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback:TimerHandler,delay?:number,...args:unknown[])=>{
   if(delay===0&&typeof callback==='function'){pending.push(()=>callback(...args));return 0 as unknown as ReturnType<typeof setTimeout>}
   return schedule(callback,delay,...args);
  }) as typeof setTimeout);
  try{act(()=>{fireEvent.keyDown(screen.getByRole('option',{name:'둘째 프로젝트'}),{key,shiftKey})})}
  finally{timers.mockRestore()}
 };
 close(lastClose==='Tab'?'Enter':'Tab');expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
 act(()=>{trigger.focus();fireEvent.keyDown(trigger,{key:'ArrowDown'})});
 await waitFor(()=>expect(screen.getByRole('option',{name:'둘째 프로젝트'})).toHaveFocus());
 close(lastClose,reverse);expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
 expect(pending).toHaveLength(2);
 const callbacks=order==='previous-first'?pending:[...pending].reverse();
 await act(async()=>{for(const callback of callbacks)callback()});
 expect(lastClose==='Tab'?screen.getByLabelText(reverse?'이름':'시작일'):trigger).toHaveFocus();
 expect(trigger).toHaveTextContent('둘째 프로젝트');
});
