import {expect,it,vi} from 'vitest'
import {render,screen,waitFor,fireEvent} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {HelpApp} from '../../src/renderer/help/HelpApp'
import type {HelpApi} from '../../src/shared/help'
function api(topicId='host-start'){
 const command=vi.fn(async(command:string)=>command==='state'?{ok:true,version:'0.8.1',reading:{topicId,query:'',scrollTop:0}}:{ok:true})
 return {command} as unknown as HelpApi&{command:ReturnType<typeof vi.fn>}
}
it('opens role topic, searches body and keeps session reading state without app capabilities',async()=>{
 const bridge=api(),u=userEvent.setup();render(<HelpApp api={bridge}/>);
 expect(await screen.findByRole('heading',{name:'공유 시작하기'})).toBeVisible()
 await u.type(screen.getByRole('searchbox'),'지문');expect(screen.getByRole('button',{name:/호스트 연결하기/})).toBeVisible()
 await u.click(screen.getByRole('button',{name:/호스트 연결하기/}));expect(screen.getByRole('heading',{name:'호스트 연결하기'})).toBeVisible()
 await waitFor(()=>expect(bridge.command).toHaveBeenCalledWith('remember',expect.objectContaining({topicId:'member-connect',query:'지문'})))
 await u.clear(screen.getByRole('searchbox'));await u.type(screen.getByRole('searchbox'),'없는검색어123');expect(screen.getByText('검색 결과가 없습니다. 다른 검색어를 입력하세요.')).toBeVisible()
 await u.click(screen.getByRole('button',{name:'검색 지우기'}));expect(screen.getByRole('searchbox')).toHaveValue('')
})
it('opens image viewer, clamps zoom and restores image button focus on Escape',async()=>{
 const u=userEvent.setup();render(<HelpApp api={api('host-participants')}/>);
 const button=await screen.findByRole('button',{name:/화면 확대:/});await u.click(button)
 expect(screen.getByRole('dialog',{name:'이미지 확대'})).toBeVisible()
 for(let i=0;i<12;i++)await u.click(screen.getByRole('button',{name:'확대'}))
 expect(screen.getByText('300%')).toBeVisible()
 await u.keyboard('{Escape}');expect(screen.queryByRole('dialog',{name:'이미지 확대'})).toBeNull();await waitFor(()=>expect(button).toHaveFocus())
 fireEvent.error(screen.getByRole('img',{name:/참여자/}));expect(screen.getByText(/이미지를 불러오지 못했습니다/)).toBeVisible()
})
it('reports bridge failure with retry and supports compact table of contents',async()=>{
 const bridge=api();bridge.command.mockResolvedValueOnce({ok:false});const u=userEvent.setup();render(<HelpApp api={bridge}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('도움말을 준비하지 못했습니다')
 await u.click(screen.getByRole('button',{name:'다시 시도'}));await screen.findByRole('heading',{name:'공유 시작하기'})
 await u.click(screen.getByRole('button',{name:'목차 접기'}));expect(screen.queryByRole('navigation',{name:'도움말 목차'})).toBeNull()
 await u.click(screen.getByRole('button',{name:'목차 펼치기'}));expect(screen.getByRole('navigation',{name:'도움말 목차'})).toBeVisible()
})
it('keeps visible and remembered scroll consistent when selecting the current article again',async()=>{
 const bridge=api(),u=userEvent.setup();render(<HelpApp api={bridge}/>);await screen.findByRole('heading',{name:'공유 시작하기'})
 const main=screen.getByRole('main');main.scrollTop=140;fireEvent.scroll(main)
 await u.click(screen.getByRole('navigation').querySelector('button[aria-current]')!)
 expect(main.scrollTop).toBe(0)
 expect(bridge.command).toHaveBeenLastCalledWith('remember',expect.objectContaining({topicId:'host-start',scrollTop:0}))
})
it('ignores a failed prewarm response after a newer explicit open succeeds',async()=>{
 let rejectOld!:(reason:Error)=>void,opened!:()=>void;
 const bridge:HelpApi={onOpen:fn=>{opened=fn;return()=>{}},command:vi.fn().mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectOld=reject})).mockResolvedValue({ok:true,openId:2,version:'0.8.4',reading:{topicId:'gantt-navigation',query:'',scrollTop:0}})};
 render(<HelpApp api={bridge}/>);await waitFor(()=>expect(opened).toBeDefined());opened();await screen.findByRole('heading',{name:'간트 이동과 확대·축소'});
 rejectOld(Error('late prewarm failure'));await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
 await new Promise(resolve=>setTimeout(resolve,50));expect(screen.getByRole('heading',{name:'간트 이동과 확대·축소'})).toBeVisible();
});
