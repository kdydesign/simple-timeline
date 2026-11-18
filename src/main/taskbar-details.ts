import type {BrowserWindow} from 'electron'
/** Keep the established AppID; use the real EXE's icon resource outside ASAR. */
export function configureTaskbarDetails(window:Pick<BrowserWindow,'setAppDetails'>,options:{platform:string;packaged:boolean;exePath:string}){
 if(options.platform!=='win32'||!options.packaged)return
 window.setAppDetails({appId:'com.kdydesign.simpletimeline',appIconPath:options.exePath,appIconIndex:0,relaunchCommand:`"${options.exePath}"`,relaunchDisplayName:'WorkRail'})
}
