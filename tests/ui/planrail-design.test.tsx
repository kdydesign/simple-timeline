import {it,expect,vi} from 'vitest';
import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {App} from '../../src/renderer/App';
import {memoryApi} from './fake-api';
import {hotfix} from '../fixtures/timeline';
import {ConfirmDialog} from '../../src/renderer/components/ConfirmDialog';
it('opts in exactly six header tooltip triggers and removes native titles',async()=>{
 render(<App api={memoryApi(hotfix).api}/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled());
 const triggers=Array.from(document.querySelectorAll('[data-slot="tooltip-trigger"]'));
 expect(triggers.map(e=>e.getAttribute('aria-label')).sort()).toEqual(['프로젝트 목록','간트','달력','오늘','프로젝트 추가','일정 추가'].sort());
 expect(document.querySelectorAll('[title]')).toHaveLength(0);
});
it('uses the source based input and button in the actual editor',async()=>{
 const u=userEvent.setup();render(<App api={memoryApi(hotfix).api}/>);
 await u.click(await screen.findByRole('button',{name:'프로젝트 추가'}));
 expect(screen.getByLabelText('프로젝트 이름')).toHaveAttribute('data-slot','input');
 expect(screen.getByRole('button',{name:'저장'})).toHaveAttribute('data-slot','button');
});

it('accepting a confirmation invokes acceptance once without cancelling it',async()=>{
 const u=userEvent.setup(),accept=vi.fn(),cancel=vi.fn();
 render(<ConfirmDialog title="변경 내용을 버릴까요?" message="입력이 사라집니다." confirmLabel="변경 버리기" onConfirm={accept} onCancel={cancel}/>);
 await u.click(screen.getByRole('button',{name:'변경 버리기'}));
 expect(accept).toHaveBeenCalledTimes(1);expect(cancel).not.toHaveBeenCalled();
});
it('cancelling a confirmation invokes cancellation exactly once',async()=>{
 const u=userEvent.setup(),accept=vi.fn(),cancel=vi.fn();
 render(<ConfirmDialog title="변경 내용을 버릴까요?" message="입력이 사라집니다." confirmLabel="변경 버리기" onConfirm={accept} onCancel={cancel}/>);
 await u.click(screen.getByRole('button',{name:'취소'}));
 expect(cancel).toHaveBeenCalledTimes(1);expect(accept).not.toHaveBeenCalled();
});
