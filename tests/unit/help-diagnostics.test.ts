import {it,expect,vi} from 'vitest'
import {EventEmitter} from 'node:events'
import {observeHelpRequests} from '../../src/main/help-diagnostics'
it('observes only the help contents and releases session listeners when the window closes',()=>{
 const hooks:Record<string,Function|null>={},webRequest=Object.fromEntries(['onBeforeRequest','onCompleted','onErrorOccurred'].map(key=>[key,(fn:Function|null)=>{hooks[key]=fn}]));
 const window=Object.assign(new EventEmitter(),{webContents:{id:15,session:{webRequest}}});const recorder={requestStarted:vi.fn(),requestFinished:vi.fn()};const stop=observeHelpRequests(window as never,recorder as never);
 const callback=vi.fn();hooks.onBeforeRequest!({webContentsId:99,id:1,resourceType:'script',url:'private'},callback);expect(callback).toHaveBeenCalledWith({});expect(recorder.requestStarted).not.toHaveBeenCalled();
 hooks.onBeforeRequest!({webContentsId:15,id:2,resourceType:'mainFrame',url:'private'},callback);hooks.onCompleted!({webContentsId:15,id:2});expect(recorder.requestStarted).toHaveBeenCalledWith(2,'document');expect(recorder.requestFinished).toHaveBeenCalledWith(2,false);
 window.emit('closed');expect(Object.values(hooks)).toEqual([null,null,null]);stop();expect(window.listenerCount('closed')).toBe(0);
})
