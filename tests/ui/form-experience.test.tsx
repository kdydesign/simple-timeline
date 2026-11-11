import {it,expect} from 'vitest'
import {render,screen,waitFor,act} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {sharingFixture} from './sharing-fixture'
it('shows all project errors locally and clears corrected errors before sharing confirmation',async()=>{
 sharingFixture({role:'host'});const u=userEvent.setup(),m=memoryApi();render(<App api={m.api}/>);
 const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);
 await u.clear(screen.getByLabelText('색상 코드'));await u.type(screen.getByLabelText('색상 코드'),'bad');
 await u.click(screen.getByRole('switch',{name:'공유 프로젝트로 저장'}));await u.click(screen.getByRole('button',{name:'참여자 이름 추가'}));await u.type(screen.getByLabelText('참여자 1'),'민수');
 await u.click(screen.getByRole('button',{name:'저장'}));
 expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();expect(m.creates).toBe(0);
 expect(screen.getByLabelText('프로젝트 이름')).toHaveAttribute('aria-invalid','true');expect(screen.getByLabelText('색상 코드')).toHaveAttribute('aria-invalid','true');expect(screen.getByRole('combobox',{name:'민수 PC'})).toHaveAttribute('aria-invalid','true');expect(screen.getByLabelText('프로젝트 이름')).toHaveFocus();
 await u.type(screen.getByLabelText('프로젝트 이름'),'정상');expect(screen.getByLabelText('프로젝트 이름')).not.toHaveAttribute('aria-invalid','true');expect(screen.getByLabelText('색상 코드')).toHaveAttribute('aria-invalid','true');
 expect(screen.queryByText('입력값을 확인해 주세요.')).not.toBeInTheDocument();
});
it('shields only content while a save is pending and releases failure without completion',async()=>{
 const u=userEvent.setup(),m=memoryApi();let finish!:(value:any)=>void;m.api.createProject=()=>new Promise(resolve=>finish=resolve);
 render(<App api={m.api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'입력 보존');await u.click(screen.getByRole('button',{name:'저장'}));
 expect(document.querySelector('.saving-shield')).toBeInTheDocument();expect(document.querySelector('.saving-content')).toHaveAttribute('inert');expect(document.querySelector('.titlebar')?.closest('[inert]')).toBeNull();
 await act(async()=>finish({ok:false,error:{code:'STORAGE_FULL',message:'저장 공간 부족'}}));
 await waitFor(()=>expect(document.querySelector('.saving-shield')).not.toBeInTheDocument());expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('입력 보존');expect(screen.getByRole('button',{name:'저장'})).toHaveFocus();
});
it('reports date order and both independent reminder errors, then corrects each locally',async()=>{
 const {hotfix}=await import('../fixtures/timeline');const u=userEvent.setup(),m=memoryApi(hotfix);render(<App api={m.api}/>);
 await u.click(await screen.findByRole('button',{name:'QA 편집'}));await u.clear(screen.getByLabelText('종료일'));await u.type(screen.getByLabelText('종료일'),'2026-01-01');await u.clear(screen.getByLabelText('알림 며칠 전'));await u.type(screen.getByLabelText('알림 며칠 전'),'366');await u.clear(screen.getByLabelText('알림 시각'));await u.type(screen.getByLabelText('알림 시각'),'99:99');await u.click(screen.getByRole('button',{name:'저장'}));
 for(const name of ['종료일','알림 며칠 전','알림 시각']){const input=screen.getByLabelText(name);expect(input).toHaveAttribute('aria-invalid','true');expect(document.getElementById(input.getAttribute('aria-describedby')!)).toHaveTextContent(/./)}
 expect(screen.getByLabelText('종료일')).toHaveFocus();await u.clear(screen.getByLabelText('알림 시각'));await u.type(screen.getByLabelText('알림 시각'),'09:00');expect(screen.getByLabelText('알림 시각')).toHaveAttribute('aria-invalid','false');expect(screen.getByLabelText('종료일')).toHaveAttribute('aria-invalid','true');
});
it('keeps manual sharing synchronization outside the saving shield',async()=>{
 const f=sharingFixture({role:'member',status:'connected',address:'192.168.0.1'});let finish!:(v:any)=>void;f.api.sync=()=>new Promise(resolve=>finish=resolve);
 const u=userEvent.setup(),m=memoryApi();render(<App api={m.api}/>);const sync=await screen.findByRole('button',{name:'수동 동기화'});await waitFor(()=>expect(sync).toBeEnabled());await u.click(sync);expect(document.querySelector('.saving-shield')).not.toBeInTheDocument();expect(sync).toHaveAttribute('aria-busy','true');await act(async()=>finish({ok:true,data:{}}));
});
it('focuses a server-rejected field after releasing the saving shield without a global duplicate',async()=>{
 sharingFixture({role:'host'});const u=userEvent.setup(),m=memoryApi();m.api.createProject=async()=>({ok:false,error:{code:'VALIDATION_ERROR',field:'participants',message:'참여자 그룹을 확인해 주세요.'}});render(<App api={m.api}/>);
 const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'검증');await u.click(screen.getByRole('button',{name:'저장'}));
 await waitFor(()=>expect(document.getElementById('editor-participants')).toHaveFocus());expect(screen.getAllByText('참여자 그룹을 확인해 주세요.')).toHaveLength(1);expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('검증');
 await u.type(screen.getByLabelText('프로젝트 이름'),' 변경');expect(screen.getByText('참여자 그룹을 확인해 주세요.')).toBeVisible();await u.click(screen.getByRole('button',{name:'참여자 이름 추가'}));expect(screen.queryByText('참여자 그룹을 확인해 주세요.')).not.toBeInTheDocument();
});
it('starts a replacement project draft without inheriting validation from the same kind and id',async()=>{
 Object.defineProperty(window,'innerWidth',{value:1280,writable:true,configurable:true});
 const u=userEvent.setup(),m=memoryApi();render(<App api={m.api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);
 await u.clear(screen.getByLabelText('색상 코드'));await u.type(screen.getByLabelText('색상 코드'),'bad');await u.click(screen.getByRole('button',{name:'저장'}));expect(screen.getByLabelText('색상 코드')).toHaveAttribute('aria-invalid','true');
 await u.click(add);await u.click(screen.getByRole('button',{name:'변경 버리기'}));expect(screen.getByLabelText('색상 코드')).toHaveValue('#2563EB');expect(screen.getByLabelText('색상 코드')).not.toHaveAttribute('aria-invalid','true');expect(screen.queryByText('색상은 #RRGGBB 형식으로 입력해 주세요.')).not.toBeInTheDocument();
 await u.type(screen.getByLabelText('프로젝트 이름'),'새 입력');expect(screen.getByLabelText('프로젝트 이름')).not.toHaveAttribute('aria-invalid','true');
});
it('retains a tray settings request until the timeline save shield has ended',async()=>{
 const f=sharingFixture(),u=userEvent.setup(),m=memoryApi(),original=m.api.createProject;let finish!:()=>Promise<void>;
 m.api.createProject=input=>new Promise(resolve=>{finish=async()=>resolve(await original(input))});
 render(<App api={m.api}/>);const add=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(add).toBeEnabled());await u.click(add);await u.type(screen.getByLabelText('프로젝트 이름'),'보존 저장');await u.click(screen.getByRole('button',{name:'저장'}));
 await act(async()=>f.emit({settingsRequestToken:'during-save'}));expect(screen.queryByRole('dialog',{name:'공유 설정'})).not.toBeInTheDocument();expect(document.querySelector('.saving-shield')).toHaveFocus();await u.keyboard('차단{Enter}');expect(f.api.configureHost).not.toHaveBeenCalled();
 await act(async()=>finish());const dialog=await screen.findByRole('dialog',{name:'공유 설정'});expect(dialog).toBeVisible();expect(document.querySelector('.saving-shield')).not.toBeInTheDocument();await u.click(screen.getByRole('button',{name:'공유 설정 닫기'}));await waitFor(()=>expect(screen.queryByRole('dialog',{name:'공유 설정'})).not.toBeInTheDocument());expect(screen.getByRole('button',{name:'보존 저장 편집'})).toBeEnabled();
});
