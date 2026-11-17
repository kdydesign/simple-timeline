import {it,expect,vi} from 'vitest'
import {configureTaskbarDetails} from '../../src/main/taskbar-details'
it('binds the taskbar app entry to the installed executable icon and quoted relaunch path',()=>{
 const window={setAppDetails:vi.fn()};configureTaskbarDetails(window,{platform:'win32',packaged:true,exePath:'C:\\Users\\A B\\Planrail\\Planrail.exe'});
 expect(window.setAppDetails).toHaveBeenCalledWith({appId:'com.kdydesign.simpletimeline',appIconPath:'C:\\Users\\A B\\Planrail\\Planrail.exe',appIconIndex:0,relaunchCommand:'"C:\\Users\\A B\\Planrail\\Planrail.exe"',relaunchDisplayName:'Planrail'});
})
it('does not change taskbar identity for Electron development or non-Windows platforms',()=>{
 const window={setAppDetails:vi.fn()};for(const options of [{platform:'win32',packaged:false},{platform:'linux',packaged:true}])configureTaskbarDetails(window,{...options,exePath:'/electron'});expect(window.setAppDetails).not.toHaveBeenCalled();
})
