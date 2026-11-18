import {it,expect,vi} from 'vitest'
import {render,screen,waitFor,act,within,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {sharingFixture} from './sharing-fixture'
import {hotfix} from '../fixtures/timeline'
it.each([false,true])('focuses a usable setting and restores the previous target on close (editor=%s)',async(withEditor)=>{
 const u=userEvent.setup(),f=sharingFixture();await act(async()=>{render(<App api={memoryApi(hotfix).api}/>)});const toolbar=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(toolbar).toBeEnabled());
 if(withEditor){await act(async()=>{fireEvent.click(toolbar)});await act(async()=>{fireEvent.change(screen.getByLabelText('프로젝트 이름'),{target:{value:'보존할 개인 초안'}})})}const target=withEditor?screen.getByLabelText('프로젝트 이름'):toolbar;await act(async()=>target.focus());await act(async()=>f.emit({settingsRequestToken:'focus-settings'}));
 const dialog=await screen.findByRole('dialog',{name:'설정'});await waitFor(()=>expect(within(dialog).getByRole('tab',{name:'공유 설정'})).toHaveFocus());await u.click(within(dialog).getByRole('button',{name:'설정 닫기'}));await waitFor(()=>expect(target).toHaveFocus());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300))});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();if(withEditor)expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존할 개인 초안');
});
it('returns a nested confirmation cancel to its actual setting initiator',async()=>{
 const u=userEvent.setup(),f=sharingFixture({role:'member'});render(<App api={memoryApi().api}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled());await act(async()=>f.emit({settingsRequestToken:'nested-settings'}));const dialog=await screen.findByRole('dialog',{name:'설정'}),disconnect=within(dialog).getByRole('button',{name:'연결 해제'});await u.click(disconnect);const confirmation=screen.getByRole('alertdialog');await u.click(within(confirmation).getByRole('button',{name:'취소'}));await waitFor(()=>expect(disconnect).toHaveFocus());expect(dialog).toBeVisible();
});

it.each([
 {order:'parent-first',dirty:false},{order:'child-first',dirty:false},
 {order:'parent-first',dirty:true},{order:'child-first',dirty:true},
])('Escape cancels only the inner confirmation during a $order capture-listener handoff (dirty=$dirty)',async({order,dirty})=>{
 const u=userEvent.setup(),f=sharingFixture({role:'member'});
 const add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);
 const listeners=new Set<EventListenerOrEventListenerObject>();
 const adding=vi.spyOn(document,'addEventListener').mockImplementation((type,listener,options)=>{
  if(type==='keydown'&&typeof options==='object'&&options.capture)listeners.add(listener);
  add(type,listener,options);
 });
 let retain=false;const parents=new Set<EventListenerOrEventListenerObject>();
 const removing=vi.spyOn(document,'removeEventListener').mockImplementation((type,listener,options)=>{
  if(retain&&type==='keydown'&&parents.has(listener))return;
  remove(type,listener,options);
 });
 try{
  render(<App api={memoryApi().api}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled());
  await act(async()=>f.emit({settingsRequestToken:'escape-handoff'}));
  const dialog=await screen.findByRole('dialog',{name:'설정'}),disconnect=within(dialog).getByRole('button',{name:'연결 해제'});
  if(dirty){await u.clear(within(dialog).getByLabelText('포트'));await u.type(within(dialog).getByLabelText('포트'),'47832')}
  // Keep the already registered parent listener for this dispatch, as can happen
  // before Radix's passive effect removes it after the child becomes visible.
  for(const listener of listeners)parents.add(listener);retain=true;
  await u.click(disconnect);expect(screen.getByRole('alertdialog')).toBeVisible();
  if(order==='child-first')for(const listener of parents){remove('keydown',listener,{capture:true});add('keydown',listener,{capture:true})}
  await u.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(dialog).toBeVisible();await waitFor(()=>expect(disconnect).toHaveFocus());
  expect(f.api.disconnect).not.toHaveBeenCalled();
  retain=false;await u.keyboard('{Escape}');
  expect(screen.queryByRole('alertdialog')).toBeNull();expect(dialog).not.toBeInTheDocument();
 }finally{
  retain=false;adding.mockRestore();removing.mockRestore();
  for(const listener of listeners)remove('keydown',listener,{capture:true});
 }
});

it('returns from initial tray settings to the toolbar when there was no previous focusable target',async()=>{
 const u=userEvent.setup(),f=sharingFixture();render(<App api={memoryApi().api}/>);const toolbar=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(toolbar).toBeEnabled());(document.activeElement as HTMLElement).blur();expect(document.activeElement).toBe(document.body);await act(async()=>f.emit({settingsRequestToken:'initial-settings'}));const dialog=await screen.findByRole('dialog',{name:'설정'});await u.click(within(dialog).getByRole('button',{name:'설정 닫기'}));await waitFor(()=>expect(toolbar).toHaveFocus());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300))});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('closes dirty settings without confirmation and returns focus to the toolbar',async()=>{
 const u=userEvent.setup(),f=sharingFixture();render(<App api={memoryApi().api}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled());await act(async()=>f.emit({settingsRequestToken:'dirty-settings'}));const dialog=await screen.findByRole('dialog',{name:'설정'}),port=within(dialog).getByLabelText('포트');await u.clear(port);await u.type(port,'47832');const close=within(dialog).getByRole('button',{name:'설정 닫기'});await u.click(close);expect(screen.queryByRole('alertdialog')).toBeNull();expect(screen.queryByRole('dialog',{name:'설정'})).toBeNull();await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toHaveFocus());
});

it('defers approval settings behind a schedule confirmation and preserves its draft',async()=>{
 const u=userEvent.setup(),f=sharingFixture();render(<App api={memoryApi(hotfix).api}/>);
 await u.click(await screen.findByRole('button',{name:'개발 편집'}));await u.clear(screen.getByLabelText('일정 이름'));await u.type(screen.getByLabelText('일정 이름'),'보존할 수정');await u.click(screen.getByRole('button',{name:'저장'}));
 const confirm=screen.getByRole('alertdialog');await act(async()=>f.emit({settingsRequestToken:'approval-notice',approvalRequestToken:'approval-notice'}));
 expect(confirm).toBeVisible();expect(screen.queryByRole('dialog',{name:'설정'})).not.toBeInTheDocument();
 await u.click(within(confirm).getByRole('button',{name:'취소'}));const settings=await screen.findByRole('dialog',{name:'설정'});await u.click(within(settings).getByRole('button',{name:'설정 닫기'}));expect(screen.getByLabelText('일정 이름')).toHaveValue('보존할 수정');
})
