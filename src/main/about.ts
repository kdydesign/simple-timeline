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
          type:'info',title:'About Planrail',message:'Planrail',
          detail:`버전 ${app.getVersion()}\n오프라인 프로젝트 일정 관리 프로그램\n개발자: daeyong\nCopyright © 2026 daeyong`,
          icon:nativeImage.createFromPath(icon),buttons:['닫기'],defaultId:0,cancelId:0,noLink:true,
        })
      } catch { /* Keep the running editor intact if the OS cannot show the dialog. */ }
      finally {open=false}
    })()
  }
}
