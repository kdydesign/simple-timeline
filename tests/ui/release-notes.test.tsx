import {expect,it,vi} from 'vitest'
import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {ReleaseNotesApp} from '../../src/renderer/release-notes/ReleaseNotesApp'
it('opens the installed version and switches conventional release sections while remembering selection',async()=>{
 const command=vi.fn(async()=>({ok:true,version:'0.8.5',reading:{version:'0.8.5',scrollTop:0}})),u=userEvent.setup()
 render(<ReleaseNotesApp api={{command}}/>);await screen.findByRole('heading',{name:'Planrail 0.8.5'})
 await u.click(screen.getByRole('button',{name:'0.8.3'}));expect(screen.getByRole('heading',{name:'Feat · 기능 추가'})).toBeVisible();expect(screen.getByRole('heading',{name:'Fix · 오류 수정'})).toBeVisible();expect(screen.queryByRole('heading',{name:'Perf · 성능 개선'})).toBeNull()
 await waitFor(()=>expect(command).toHaveBeenCalledWith('remember',{version:'0.8.3',scrollTop:0}))
})
it('shows retry on failed state and closes only the release notes window',async()=>{
 const command=vi.fn().mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,version:'0.8.5',reading:{version:'0.8.5',scrollTop:0}}),u=userEvent.setup()
 render(<ReleaseNotesApp api={{command}}/>);expect(await screen.findByRole('alert')).toHaveTextContent('릴리즈노트');await u.click(screen.getByRole('button',{name:'다시 시도'}));await screen.findByRole('heading',{name:'Planrail 0.8.5'});await u.click(screen.getByRole('button',{name:'릴리즈노트 닫기'}));expect(command).toHaveBeenCalledWith('close')
})
