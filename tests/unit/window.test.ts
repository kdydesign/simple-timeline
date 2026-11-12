import {it,expect,vi} from 'vitest'
import {EventEmitter} from 'node:events'
const mock=vi.hoisted(()=>({windows:[] as any[]}))
vi.mock('electron',()=>({screen:{getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1920,height:1080}}),getCursorScreenPoint:()=>({x:0,y:0})},BrowserWindow:class extends EventEmitter{
 webContents=Object.assign(new EventEmitter(),{setWindowOpenHandler:vi.fn(),session:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn()}})
 isDestroyed=vi.fn(()=>false);show=vi.fn();setMenu=vi.fn();loadURL=vi.fn(async()=>{});constructor(){super();mock.windows.push(this)}
}}))
import {createWindow} from '../../src/main/window'
it('login startup suppresses the initial window and exposes renderer/preload/crash failures',()=>{
 for(const event of ['did-fail-load','preload-error','render-process-gone']){
  const window=createWindow('preload','file:///renderer.html',undefined,undefined,{mark:()=>{},observeRequests:()=>{},hidden:true})
  expect(window.show).not.toHaveBeenCalled()
  window.webContents.emit(event,{},-6,'missing','file:///renderer.html',true)
  expect(window.show).toHaveBeenCalledOnce()
 }
})
it('direct startup is immediately visible',()=>{expect(createWindow('preload','file:///renderer.html').show).toHaveBeenCalledOnce()})
