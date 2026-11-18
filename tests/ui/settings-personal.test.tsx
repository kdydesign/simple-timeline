import {it,expect,vi} from 'vitest'
import {render,screen,fireEvent,within,act} from '@testing-library/react'
import {App} from '../../src/renderer/App'
import {memoryApi} from './fake-api'
import {hotfix} from '../fixtures/timeline'
import {SharingSettings} from '../../src/renderer/components/SharingSettings'
import {TooltipProvider} from '../../src/renderer/components/ui/tooltip'
import {Titlebar} from '../../src/renderer/components/Titlebar'
import {personalState,sharingFixture} from './sharing-fixture'
const calendar={weekdays:[0,6],dates:[{date:'2026-11-26',name:'연차'}]}
it('recomputes working days after holiday updates without changing schedule input',async()=>{
 const f=sharingFixture({role:'host',personalHolidays:calendar,holidays:{calendar:{weekdays:[0,6],dates:[{date:'2026-11-25',name:'창립기념일'}]},status:'host',lastReceivedAt:null,message:''}})
 render(<App api={memoryApi(hotfix).api}/>);
 fireEvent.click(await screen.findByRole('button',{name:'일정 추가'}))
 fireEvent.change(screen.getByLabelText('시작일'),{target:{value:'2026-11-23'}})
 fireEvent.change(screen.getByLabelText('종료일'),{target:{value:'2026-11-29'}})
 expect(screen.getByText('워킹데이: 3일')).toBeInTheDocument()
 act(()=>f.emit({personalHolidays:{weekdays:[0,6],dates:[]}}))
 expect(screen.getByText('워킹데이: 4일')).toBeInTheDocument()
 expect(screen.getByLabelText('시작일')).toHaveValue('2026-11-23')
})
it('opens basic settings and preserves separate common/personal drafts across tabs and polls',()=>{
 const state={...personalState,role:'host' as const,personalHolidays:calendar,holidays:{calendar:{weekdays:[0,6],dates:[]},status:'host' as const,lastReceivedAt:null,message:''}}
 const {api}=sharingFixture(state);const props={state,api,busy:false,error:null,projects:[],run:async(fn:any)=>fn(),onClose:vi.fn(),onGuard:vi.fn()}
 const v=render(<SharingSettings {...props}/>);
 expect(screen.getByRole('tab',{name:'기본 설정'})).toHaveAttribute('aria-selected','true')
 const personal=screen.getByRole('region',{name:'휴일 관리 (개인)'}),common=screen.getByRole('region',{name:'휴일 관리 (공통)'})
 expect(within(personal).getByRole('heading',{name:'날짜별 휴일 (개인)'})).toBeInTheDocument()
 expect(within(personal).getByRole('button',{name:'연차 휴일 삭제'})).toHaveTextContent('삭제')
 fireEvent.change(within(personal).getByLabelText('휴일 이름'),{target:{value:'개인 초안'}})
 fireEvent.change(within(common).getByLabelText('휴일 이름'),{target:{value:'공통 초안'}})
 fireEvent.click(screen.getByRole('tab',{name:'공유 설정'}));fireEvent.click(screen.getByRole('tab',{name:'기본 설정'}))
 v.rerender(<SharingSettings {...props} state={{...state,personalHolidays:{...calendar}}}/>);
 expect(within(personal).getByLabelText('휴일 이름')).toHaveValue('개인 초안')
 expect(within(common).getByLabelText('휴일 이름')).toHaveValue('공통 초안')
})
it('titlebar opens settings without executing a window lifecycle command',()=>{
 const open=vi.fn();render(<TooltipProvider><Titlebar {...{onSettings:open}}/></TooltipProvider>);
 fireEvent.click(screen.getByRole('button',{name:'설정'}));expect(open).toHaveBeenCalledOnce()
})
it('does not lock the workspace when settings state cannot be read',async()=>{
 const f=sharingFixture();f.api.getState=vi.fn().mockResolvedValue({ok:false,error:{code:'STORAGE_IO',message:'설정 읽기 실패'}})
 render(<App api={memoryApi(hotfix).api}/>);
 await screen.findByText('설정 읽기 실패');fireEvent.click(screen.getByRole('button',{name:'설정'}))
 expect(document.querySelector('.toolbar')?.closest('[inert]')).toBeNull()
 expect(screen.getByRole('button',{name:'프로젝트 추가'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'프로젝트 추가'}));expect(screen.getByLabelText('프로젝트 이름')).toBeInTheDocument()
})
it('consumes approval navigation once and reopens the titlebar settings on basic',async()=>{
 const f=sharingFixture({role:'host'});render(<App api={memoryApi(hotfix).api}/>);
 await screen.findByRole('button',{name:'프로젝트 추가'});act(()=>f.emit({settingsRequestToken:'approval-once',approvalRequestToken:'approval-once'}))
 const dialog=await screen.findByRole('dialog',{name:'설정'});expect(within(dialog).getByRole('tab',{name:'공유 설정'})).toHaveAttribute('aria-selected','true')
 act(()=>f.emit({settingsRequestToken:null}));fireEvent.click(within(dialog).getByRole('button',{name:'설정 닫기'}));fireEvent.click(screen.getByRole('button',{name:'설정'}))
 expect(screen.getByRole('tab',{name:'기본 설정'})).toHaveAttribute('aria-selected','true')
 const personal=screen.getByRole('region',{name:'휴일 관리 (개인)'});fireEvent.change(within(personal).getByLabelText('휴일 이름'),{target:{value:'승인 알림 사이 보존'}})
 act(()=>f.emit({settingsRequestToken:'approval-twice',approvalRequestToken:'approval-twice'}));expect(screen.getByRole('tab',{name:'공유 설정'})).toHaveAttribute('aria-selected','true')
 fireEvent.click(screen.getByRole('tab',{name:'기본 설정'}));expect(within(personal).getByLabelText('휴일 이름')).toHaveValue('승인 알림 사이 보존')
})
it('separates repeat and dated holidays into named regions and hides member common editing',()=>{
 const state={...personalState,role:'member' as const,personalHolidays:calendar,holidays:{calendar,status:'current' as const,lastReceivedAt:null,message:''}}
 const {api}=sharingFixture(state)
 render(<SharingSettings state={state} api={api} busy={false} error={null} projects={[]} run={async fn=>fn()} onClose={()=>{}} onGuard={()=>{}}/>);
 for(const scope of ['공통','개인']){
  const region=screen.getByRole('region',{name:`휴일 관리 (${scope})`})
  expect(within(region).getByRole('group',{name:'반복 휴일'})).toBeInTheDocument()
  expect(within(region).getByRole('group',{name:`날짜별 휴일 (${scope})`})).toBeInTheDocument()
  expect(within(region).getByText('매주 반복되는 휴무 요일')).toBeInTheDocument()
  expect(within(region).getByText('특정 날짜 또는 기간에만 적용')).toBeInTheDocument()
 }
 const common=screen.getByRole('region',{name:'휴일 관리 (공통)'})
 expect(within(common).getByText('호스트 제공 · 조회 전용')).toBeInTheDocument()
 expect(within(common).queryByRole('button')).not.toBeInTheDocument()
})
