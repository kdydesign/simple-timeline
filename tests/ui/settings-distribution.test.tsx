import {fireEvent,render,screen,within} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {UpdateDistribution} from '../../src/renderer/components/UpdateDistribution'
import type {UpdatesView} from '../../src/renderer/state/useUpdates'
const state={revision:1,role:'host',phase:'idle',version:null,totalBytes:0,receivedBytes:0,connected:false,editingBlocked:false,requiresExplicitInstall:false,canDownload:false,canCancel:false,canRetry:false,canInstall:false,error:null,host:{importing:false,currentVersion:'1.0.0',candidateVersion:'1.0.1',candidateBytes:1024,publishing:false,canPublish:true}} as const
it('identifies the WorkRail LAN artifact as the ZIP to import',()=>{
 const updates:UpdatesView={state,error:null,busy:false,run:vi.fn(),acknowledgeOpen:vi.fn()}
 render(<UpdateDistribution updates={updates}/>)
 expect(screen.getByText(/WorkRail-LAN-UPDATE ZIP/)).toBeInTheDocument()
})
it('summarizes active, retained and candidate releases without hiding errors or enabling offline publication',()=>{
 const updates:UpdatesView={state,error:null,busy:false,run:vi.fn(),acknowledgeOpen:vi.fn()}
 const {rerender}=render(<UpdateDistribution updates={updates}/>)
 const summary=screen.getByLabelText('업데이트 배포 현황')
 expect(within(summary).getByText('현재 배포').nextElementSibling).toHaveTextContent('없음')
 expect(within(summary).getByText('보관 파일').nextElementSibling).toHaveTextContent('1.0.0')
 expect(within(summary).getByText('배포 후보').nextElementSibling).toHaveTextContent('1.0.1')
 expect(screen.getByRole('button',{name:'배포 시작'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'업데이트 ZIP 가져오기'}))
 expect(updates.run).toHaveBeenCalledWith('importBundle')
 rerender(<UpdateDistribution updates={{...updates,state:{...state,connected:true,error:'invalid-bundle'}}} disabled/>)
 expect(screen.getByRole('alert')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'업데이트 ZIP 가져오기'})).toBeDisabled()
 expect(screen.getByRole('button',{name:'배포 시작'})).toBeDisabled()
})
