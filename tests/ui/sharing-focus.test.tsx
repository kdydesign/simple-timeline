import {it,expect} from 'vitest'
import {render,screen,waitFor,act,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {sharingFixture} from './sharing-fixture'
import {hotfix} from '../fixtures/timeline'
it.each([false,true])('focuses a usable setting and restores the previous target on close (editor=%s)',async(withEditor)=>{
 const u=userEvent.setup(),f=sharingFixture();render(<App api={memoryApi(hotfix).api}/>);const toolbar=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(toolbar).toBeEnabled());
 if(withEditor){await u.click(toolbar);await u.type(screen.getByLabelText('프로젝트 이름'),'보존할 개인 초안')}const target=withEditor?screen.getByLabelText('프로젝트 이름'):toolbar;target.focus();await act(async()=>f.emit({settingsRequestToken:'focus-settings'}));
 const dialog=await screen.findByRole('dialog',{name:'공유 설정'});await waitFor(()=>expect(within(dialog).getByRole('button',{name:'호스트로 공유'})).toHaveFocus());await u.click(within(dialog).getByRole('button',{name:'공유 설정 닫기'}));await waitFor(()=>expect(target).toHaveFocus());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300))});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();if(withEditor)expect(screen.getByLabelText('프로젝트 이름')).toHaveValue('보존할 개인 초안');
});
it('returns a nested confirmation cancel to its actual setting initiator',async()=>{
 const u=userEvent.setup(),f=sharingFixture({role:'member'});render(<App api={memoryApi().api}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled());await act(async()=>f.emit({settingsRequestToken:'nested-settings'}));const dialog=await screen.findByRole('dialog',{name:'공유 설정'}),disconnect=within(dialog).getByRole('button',{name:'연결 해제'});await u.click(disconnect);const confirmation=screen.getByRole('alertdialog');await u.click(within(confirmation).getByRole('button',{name:'취소'}));await waitFor(()=>expect(disconnect).toHaveFocus());expect(dialog).toBeVisible();
});

it('returns from initial tray settings to the toolbar when there was no previous focusable target',async()=>{
 const u=userEvent.setup(),f=sharingFixture();render(<App api={memoryApi().api}/>);const toolbar=await screen.findByRole('button',{name:'프로젝트 추가'});await waitFor(()=>expect(toolbar).toBeEnabled());(document.activeElement as HTMLElement).blur();expect(document.activeElement).toBe(document.body);await act(async()=>f.emit({settingsRequestToken:'initial-settings'}));const dialog=await screen.findByRole('dialog',{name:'공유 설정'});await u.click(within(dialog).getByRole('button',{name:'공유 설정 닫기'}));await waitFor(()=>expect(toolbar).toHaveFocus());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,300))});expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('returns dirty-settings confirmation cancel to the close control and preserves its input',async()=>{
 const u=userEvent.setup(),f=sharingFixture();render(<App api={memoryApi().api}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled());await act(async()=>f.emit({settingsRequestToken:'dirty-settings'}));const dialog=await screen.findByRole('dialog',{name:'공유 설정'}),port=within(dialog).getByLabelText('포트');await u.clear(port);await u.type(port,'47832');const close=within(dialog).getByRole('button',{name:'공유 설정 닫기'});await u.click(close);await u.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'취소'}));await waitFor(()=>expect(close).toHaveFocus());expect(port).toHaveValue(47832);
});
