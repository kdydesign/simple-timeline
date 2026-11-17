import {beforeEach, expect, it, vi} from 'vitest'
import {EventEmitter} from 'node:events'
const mocks=vi.hoisted(()=>({windows:[] as any[], handlers:new Map<string,Function>()}))
vi.mock('electron',()=>({
 ipcMain:{handle:(key:string,fn:Function)=>mocks.handlers.set(key,fn),removeHandler:(key:string)=>mocks.handlers.delete(key)},
 screen:{getDisplayMatching:()=>({workArea:{x:20,y:30,width:900,height:650}})},
 BrowserWindow:class extends EventEmitter{
  options:any;dead=false;visible=false;minimized=false;maximized=false
  webContents=Object.assign(new EventEmitter(),{mainFrame:{url:'file:///app/release-notes.html'},send:vi.fn(),setWindowOpenHandler:vi.fn(),session:{setPermissionRequestHandler:vi.fn(),setPermissionCheckHandler:vi.fn()}})
  constructor(options:any){super();this.options=options;mocks.windows.push(this)}
  isDestroyed(){return this.dead}isVisible(){return this.visible}isMinimized(){return this.minimized}isMaximized(){return this.maximized}
  show=vi.fn(()=>{this.visible=true});hide=vi.fn(()=>{this.visible=false});focus=vi.fn();restore=vi.fn(()=>{this.minimized=false})
  showInactive=vi.fn(()=>{this.visible=true;this.minimized=false})
  minimize(){this.minimized=true}maximize(){this.maximized=true}unmaximize(){this.maximized=false}
  destroy(){this.dead=true;this.emit('closed')}close(){const e={preventDefault:vi.fn()};this.emit('close',e);if(!e.preventDefault.mock.calls.length)this.destroy()}setMenu=vi.fn();loadURL=vi.fn(async()=>{})
 }
}))
import {createReleaseWindow} from '../../src/main/release-window'
const url='file:///app/release-notes.html'
beforeEach(()=>{mocks.windows=[];mocks.handlers.clear()})
function setup(role:'host'|'member'|'personal'='host'){
 const onError=vi.fn();const manager=createReleaseWindow({mainWindow:{getBounds:()=>({x:0,y:0,width:1200,height:800})} as any,url,preload:'/help.cjs',version:'0.8.5',onError})
 return {manager,onError}
}
function invoke(w:any,command:string,...args:unknown[]){return mocks.handlers.get('release-notes:command')!({sender:w.webContents,senderFrame:w.webContents.mainFrame},command,...args)}
it('keeps one constrained sandboxed window and restores reading state after closing',()=>{
 const {manager}=setup();expect(mocks.windows).toHaveLength(0);manager.open();manager.open();expect(mocks.windows).toHaveLength(1)
 const w=mocks.windows[0];expect(w.options).toMatchObject({width:900,height:650,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:'/help.cjs'}})
 w.emit('ready-to-show');expect(w.visible).toBe(true)
 expect(invoke(w,'state')).toMatchObject({ok:true,reading:{version:'0.8.5',scrollTop:0},version:'0.8.5'})
 expect(invoke(w,'remember',{version:'0.8.3',scrollTop:140})).toMatchObject({ok:true})
 w.close();manager.open();const next=mocks.windows[0];expect(invoke(next,'state')).toMatchObject({reading:{version:'0.8.3',scrollTop:140}})
 manager.dispose();expect(next.dead).toBe(true);expect(mocks.handlers.has('release-notes:command')).toBe(false);manager.open();expect(mocks.windows).toHaveLength(1)
})
it('does not reveal a loading window after tray hiding and restores only an existing help',()=>{
 const {manager}=setup();manager.restoreWithMain();expect(mocks.windows).toHaveLength(0)
 manager.open();const w=mocks.windows[0];manager.hideWithMain();w.emit('ready-to-show');expect(w.visible).toBe(false)
 manager.restoreWithMain();expect(w.visible).toBe(true);expect(w.focus).not.toHaveBeenCalled()
 w.close();manager.hideWithMain();manager.restoreWithMain();expect(mocks.windows).toHaveLength(1)
})
it('rejects foreign frames, dev paths, arbitrary commands and invalid reading state',()=>{
 const {manager}=setup();manager.open();const w=mocks.windows[0],fn=mocks.handlers.get('release-notes:command')!
 expect(fn({sender:{},senderFrame:w.webContents.mainFrame},'state')).toEqual({ok:false})
 expect(fn({sender:w.webContents,senderFrame:{url}},'state')).toEqual({ok:false})
 w.webContents.mainFrame.url='http://127.0.0.1:5173/';expect(invoke(w,'state')).toEqual({ok:false});w.webContents.mainFrame.url=url
 for(const args of [['remember',{version:'../../private',scrollTop:0}],['remember',{version:'0.8.5',scrollTop:NaN}],['state','extra'],['deleteProject','1']])expect(invoke(w,args[0] as string,...args.slice(1))).toEqual({ok:false})
 expect(w.webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({action:'deny'})
 const e={preventDefault:vi.fn()};w.webContents.emit('will-navigate',e,'https://example.com');expect(e.preventDefault).toHaveBeenCalled()
})
it('recovers from load or renderer failure without leaving the singleton stuck',()=>{
 const {manager,onError}=setup('member');manager.open();const w=mocks.windows[0]
 expect(invoke(w,'state')).toMatchObject({reading:{version:'0.8.5'}})
 w.webContents.emit('did-fail-load',{},-6,'missing',url,true);w.webContents.emit('render-process-gone');expect(onError).toHaveBeenCalledOnce();expect(w.dead).toBe(true)
 manager.open();expect(mocks.windows).toHaveLength(2)
})
it('late loading after tray restore uses an inactive show, then consumes the restore request',()=>{
 const {manager}=setup();manager.open();const w=mocks.windows[0]
 manager.hideWithMain();manager.restoreWithMain();w.emit('ready-to-show')
 expect(w.show).not.toHaveBeenCalled();expect(w.showInactive).toHaveBeenCalledOnce();expect(w.focus).not.toHaveBeenCalled()
 w.minimize();manager.restoreWithMain();expect(w.minimized).toBe(true);expect(w.showInactive).toHaveBeenCalledOnce()
 manager.open();expect(w.restore).toHaveBeenCalledOnce();expect(w.focus).toHaveBeenCalledOnce()
})
it('hidden help failures wait for explicit reopening instead of surfacing from the tray',()=>{
 const {manager,onError}=setup();manager.open();const w=mocks.windows[0];manager.hideWithMain()
 w.webContents.emit('did-fail-load',{},-6,'missing',url,true)
 expect(w.dead).toBe(true);expect(onError).not.toHaveBeenCalled()
 manager.restoreWithMain();expect(onError).not.toHaveBeenCalled();manager.restoreWithMain();expect(onError).not.toHaveBeenCalled()
 manager.open();expect(mocks.windows).toHaveLength(2)
})
