import {app,dialog,nativeImage} from 'electron'
// An unparented native dialog is visible even when the main window is in the tray.
export function createAbout(icon: string): () => void {
  let open=false
  return () => {
    if(open)return
    open=true
    void (async()=>{
      try {
        await dialog.showMessageBox({
          type:'info',title:'About WorkRail',message:'WorkRail',
          detail:`버전 ${app.getVersion()}\n일정과 개발 환경을 관리하는 팀 도구\n개발자: daeyong\nCopyright © 2026 daeyong`,
          icon:nativeImage.createFromPath(icon),buttons:['닫기'],defaultId:0,cancelId:0,noLink:true,
        })
      } catch { /* Keep the running editor intact if the OS cannot show the dialog. */ }
      finally {open=false}
    })()
  }
}
