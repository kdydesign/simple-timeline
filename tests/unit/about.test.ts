import {it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({show:vi.fn(),version:vi.fn(()=> '0.4.0'),image:vi.fn(()=> 'icon')}))
vi.mock('electron',()=>({app:{getVersion:mocks.version},dialog:{showMessageBox:mocks.show},nativeImage:{createFromPath:mocks.image}}))
import {createAbout} from '../../src/main/about'
it('shows real version and agreed identity without duplicate dialogs',async()=>{
 let finish!:()=>void
 mocks.show.mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve}))
 const show=createAbout('icon.png')
 show();show()
 expect(mocks.show).toHaveBeenCalledTimes(1)
 expect(mocks.show.mock.calls[0][0]).toMatchObject({title:'About Planrail',message:'Planrail',detail:expect.stringContaining('0.4.0'),icon:'icon'})
 expect(mocks.show.mock.calls[0][0].detail).toContain('daeyong')
 expect(mocks.show.mock.calls[0][0].detail).toContain('Copyright © 2026 daeyong')
 finish();await Promise.resolve();await Promise.resolve();show()
 expect(mocks.show).toHaveBeenCalledTimes(2)
 finish()
})
