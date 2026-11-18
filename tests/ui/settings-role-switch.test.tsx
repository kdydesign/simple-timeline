import {act,fireEvent,render,screen,within} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {SharingSettings} from '../../src/renderer/components/SharingSettings'
import {personalState,sharingFixture} from './sharing-fixture'
import type {SharingState} from '../../src/shared/sharing'
import {hotfix} from '../fixtures/timeline'

function setup(overrides:Partial<SharingState>={},externalDirty=false){
 const state:SharingState={...personalState,role:'host',roleHistory:'host',address:'192.168.0.10',...overrides}
 const fixture=sharingFixture(state)
 const api={...fixture.api,switchRole:vi.fn().mockResolvedValue({ok:true,data:{...state,role:state.role==='host'?'member':'host',address:null,hostingEnabled:false}}),getDormantData:vi.fn().mockResolvedValue({ok:true,data:{...hotfix,holidays:{weekdays:[0,6],dates:[{date:'2026-11-18',name:'보관 공통 휴일'}]}}})}
 const props={state,api,busy:false,error:null,projects:[],run:async(fn:any)=>fn(),onClose:vi.fn(),onGuard:vi.fn(),initialTab:'sharing' as const,externalDirty}
 return {...render(<SharingSettings {...props}/>),props,api}
}
it.each(['host','member'] as const)('confirms and cancels %s role switching before invoking the API',async role=>{
 const {api}=setup({role,roleHistory:role});const target=role==='host'?'멤버':'호스트'
 fireEvent.click(screen.getByRole('button',{name:'역할 변경'}))
 fireEvent.click(screen.getByRole('button',{name:`${target}로 전환`}))
 expect(api.switchRole).not.toHaveBeenCalled()
 const confirmation=screen.getByRole('alertdialog',{name:`${target}로 전환할까요?`})
 expect(within(confirmation).getByText(/개인/)).toBeInTheDocument()
 fireEvent.click(within(confirmation).getByRole('button',{name:'취소'}))
 expect(api.switchRole).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:`${target}로 전환`}))
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'전환 확인'})))
 expect(api.switchRole).toHaveBeenCalledWith({role:role==='host'?'member':'host',confirmed:true})
 expect(api.connect).not.toHaveBeenCalled();expect(api.setHosting).not.toHaveBeenCalled()
})
it('keeps unsaved address and blocks role switch and sharing start until saved',()=>{
 const {api}=setup()
 fireEvent.change(screen.getByLabelText('포트'),{target:{value:'47832'}})
 expect(screen.getByRole('button',{name:'공유 시작'})).toBeDisabled()
 expect(screen.getByText(/먼저 호스트 주소를 저장/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'역할 변경'}))
 expect(screen.getByText(/미저장 변경.*저장하거나 취소/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'멤버로 전환'})).not.toBeInTheDocument()
 expect(screen.getByLabelText('포트')).toHaveValue(47832)
 expect(api.switchRole).not.toHaveBeenCalled()
})
it('blocks role switch for an unsaved holiday on the hidden basic tab and external editor drafts',()=>{
 const {rerender,props,api}=setup({},true)
 fireEvent.click(screen.getByRole('button',{name:'역할 변경'}))
 expect(screen.getByText(/미저장 변경.*저장하거나 취소/)).toBeInTheDocument()
 rerender(<SharingSettings {...props} externalDirty={false}/>)
 fireEvent.click(screen.getByRole('tab',{name:'기본 설정'}))
 fireEvent.change(screen.getByLabelText('휴일 이름'),{target:{value:'보호할 휴일'}})
 fireEvent.click(screen.getByRole('tab',{name:'공유 설정'}))
 fireEvent.click(screen.getByRole('button',{name:'역할 변경'}))
 expect(screen.queryByRole('button',{name:'멤버로 전환'})).not.toBeInTheDocument()
 expect(api.switchRole).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('tab',{name:'기본 설정'}))
 expect(screen.getByLabelText('휴일 이름')).toHaveValue('보호할 휴일')
})
it('blocks duplicate switching while pending and shows cleanup recovery without connection controls',async()=>{
 const {api,props,rerender}=setup()
 let resolve!:(value:unknown)=>void
 api.switchRole.mockImplementation(()=>new Promise(r=>{resolve=r}))
 fireEvent.click(screen.getByRole('button',{name:'역할 변경'}));fireEvent.click(screen.getByRole('button',{name:'멤버로 전환'}))
 fireEvent.click(screen.getByRole('button',{name:'전환 확인'}))
 expect(screen.getByRole('button',{name:'역할 변경'})).toBeDisabled()
 expect(screen.getByRole('button',{name:'공유 시작'})).toBeDisabled()
 await act(async()=>resolve({ok:false,error:{code:'STORAGE_IO',message:'자격 정리 실패'}}))
 rerender(<SharingSettings {...props} state={{...props.state,role:'personal',cleanupPending:true,roleTransition:{target:'member',phase:'failed'}}}/>)
 expect(screen.getByText(/역할 전환이 완료되지 않았습니다/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'연결'})).not.toBeInTheDocument()
 api.switchRole.mockResolvedValue({ok:true,data:{...props.state,role:'member'}})
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'전환 다시 시도'})))
 expect(api.switchRole).toHaveBeenLastCalledWith({role:'member',confirmed:true})
})
it('shows dormant projects, schedules and common holidays as a separate read-only view',async()=>{
 const {api}=setup({role:'member',roleHistory:'member',dormantAvailable:true})
 fireEvent.click(screen.getByRole('button',{name:'중지된 공유 자료 조회'}))
 const view=await screen.findByRole('region',{name:'중지된 공유 자료'})
 expect(await within(view).findByText('보관 공통 휴일')).toBeInTheDocument()
 expect(within(view).getByText(hotfix.projects[0].name)).toBeInTheDocument()
 expect(within(view).getByText(hotfix.schedules[0].name)).toBeInTheDocument()
 expect(within(view).queryByRole('textbox')).not.toBeInTheDocument()
 expect(within(view).queryByRole('button',{name:/추가|수정|삭제|알림|공유 시작/})).not.toBeInTheDocument()
 expect(api.getDormantData).toHaveBeenCalledOnce()
 fireEvent.click(screen.getByRole('button',{name:'공유 설정으로 돌아가기'}))
 expect(screen.getByRole('button',{name:'역할 변경'})).toBeInTheDocument()
})
it('refreshes the address only after a role change and retains drafts during ordinary state polling',()=>{
 const {props,rerender}=setup()
 fireEvent.change(screen.getByLabelText('포트'),{target:{value:'47832'}})
 rerender(<SharingSettings {...props} state={{...props.state,lastCheckedAt:'2026-11-18T13:00:00Z'}}/>)
 expect(screen.getByLabelText('포트')).toHaveValue(47832)
 rerender(<SharingSettings {...props} state={{...props.state,role:'member',address:null,port:47831}}/>)
 expect(screen.getByLabelText('호스트 IP')).toHaveValue('')
 expect(screen.getByLabelText('포트')).toHaveValue(47831)
})
it('keeps an unavailable dormant read separate and lets the user retry it without exposing edit actions',async()=>{
 const {api}=setup({role:'member',dormantAvailable:true})
 api.getDormantData.mockResolvedValueOnce({ok:false,error:{code:'STORAGE_IO',message:'보관 자료 조회 실패'}})
 fireEvent.click(screen.getByRole('button',{name:'중지된 공유 자료 조회'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('보관 자료 조회 실패')
 fireEvent.click(screen.getByRole('button',{name:'조회 다시 시도'}))
 expect(await screen.findByText('보관 공통 휴일')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'공유 시작'})).not.toBeInTheDocument()
})
it('requires confirmed role switching for a disconnected member instead of bypassing cleanup through initial setup',async()=>{
 const {api}=setup({role:'personal',roleHistory:'member'})
 expect(screen.getByRole('button',{name:'호스트로 공유'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'역할 변경'}))
 fireEvent.click(screen.getByRole('button',{name:'호스트로 전환'}))
 expect(api.configureHost).not.toHaveBeenCalled()
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'전환 확인'})))
 expect(api.switchRole).toHaveBeenCalledWith({role:'host',confirmed:true})
})
it('explains why a role change is unavailable during another save',()=>{
 const {props,rerender}=setup()
 rerender(<SharingSettings {...props} busy/>)
 expect(screen.getByRole('button',{name:'역할 변경'})).toBeDisabled()
 expect(screen.getByText(/진행 중인 저장.*끝난 뒤/)).toBeInTheDocument()
})
it('opens the recovery controls when settings starts on basic with an unfinished role transition',()=>{
 const {props,unmount}=setup();unmount()
 render(<SharingSettings {...props} initialTab="basic" state={{...props.state,role:'personal',roleTransition:{target:'host',phase:'failed'}}}/>)
 expect(screen.getByRole('tab',{name:'공유 설정'})).toHaveAttribute('aria-selected','true')
 expect(screen.getByRole('button',{name:'전환 다시 시도'})).toBeInTheDocument()
})
