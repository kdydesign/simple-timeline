import {it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({menu:vi.fn(v=>v),bitmap:vi.fn((data)=>({data})),tray:class {setToolTip=vi.fn();setContextMenu=vi.fn();on=vi.fn();destroy=vi.fn();popUpContextMenu=vi.fn()}}))
vi.mock('electron',()=>({Menu:{buildFromTemplate:mocks.menu},Tray:mocks.tray,nativeImage:{createFromBitmap:mocks.bitmap}}))
import {createTray,updateSharingTray} from '../../src/main/tray'
import type {SharingState} from '../../src/shared/sharing'
it('keeps colored status informational while Open and Exit retain their callbacks',()=>{
 const show=vi.fn(),exit=vi.fn(),about=vi.fn(),settings=vi.fn(),tray=createTray('icon',show,exit,about,settings);
 let menu=mocks.menu.mock.calls.at(-1)![0];expect(menu.map((v:any)=>v.label??v.type)).toEqual(['연결 상태','separator','About','separator','Open','Exit']);expect(menu[0].enabled).toBe(false);expect(menu[0].click).toBeUndefined();menu[4].click();menu[5].click();expect(settings).not.toHaveBeenCalled();expect(show).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledOnce();
 updateSharingTray(tray,{role:'member',status:'connected',message:'연결됨'} as SharingState);const green=mocks.bitmap.mock.calls.at(-1)![0];updateSharingTray(tray,{role:'member',status:'disconnected',message:'연결 실패'} as SharingState);expect(mocks.bitmap.mock.calls.at(-1)![0]).not.toEqual(green);
})

it('refreshes Windows startup state when opening menu and explicit checkbox applies only that choice',async()=>{
 const changed:boolean[]=[],startup={read:async()=>({supported:true,enabled:false,selected:true,registered:true,disabled:true}),set:async(value:boolean)=>{changed.push(value);return {state:{supported:true,enabled:value,selected:value,registered:value,disabled:false}}}},tray=createTray('icon',()=>{},()=>{},()=>{},()=>{},undefined,startup)
 const rightClick=(tray.on as any).mock.calls.find((c:any[])=>c[0]==='right-click')[1]
 await rightClick();let menu=mocks.menu.mock.calls.at(-1)![0];expect(menu.map((v:any)=>v.label??v.type)).toEqual(['연결 상태','separator','About','Windows 시작 시 자동 실행','separator','Open','Exit']);expect(menu[3]).toMatchObject({type:'checkbox',checked:false,enabled:true})
 await menu[3].click({checked:true});expect(changed).toEqual([true]);menu=mocks.menu.mock.calls.at(-1)![0];expect(menu[3].checked).toBe(true)
})

it('waits for actual Windows startup state and opens menu only once',async()=>{
 let finish!:(value:any)=>void
 const startup={read:()=>new Promise<any>(r=>{finish=r}),set:async()=>{throw Error('not used')}},tray=createTray('icon',()=>{},()=>{},undefined,undefined,undefined,startup)
 const open=(tray.on as any).mock.calls.find((c:any[])=>c[0]==='right-click')[1]
 const pending=open();expect(tray.popUpContextMenu).not.toHaveBeenCalled()
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
 const menu=mocks.menu.mock.calls.at(-1)![0];expect(menu[3].enabled).toBe(false);expect(menu[5].label).toBe('Open');expect(menu[6].label).toBe('Exit')
 finish({supported:true,enabled:true,selected:true,registered:true,disabled:false});await pending;expect(tray.popUpContextMenu).toHaveBeenCalledOnce();expect(mocks.menu.mock.calls.at(-1)![0][3].checked).toBe(true)
})

it('coalesces pending right-clicks and drops the popup after a left click',async()=>{
 let finish!:(v:any)=>void;const show=vi.fn(),startup={read:()=>new Promise<any>(r=>{finish=r}),set:vi.fn()}
 const tray=createTray('icon',show,()=>{},undefined,undefined,undefined,startup)
 const handler=(name:string)=>(tray.on as any).mock.calls.find((c:any[])=>c[0]===name)[1]
 const a=handler('right-click')(),b=handler('right-click')();handler('click')()
 await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));finish({supported:true,enabled:true});await Promise.all([a,b])
 expect(show).toHaveBeenCalledOnce();expect(tray.popUpContextMenu).not.toHaveBeenCalled()
})
it('shows unreadable startup once after timeout while Open and Exit remain usable',async()=>{
 vi.useFakeTimers()
 try{
 const tray=createTray('icon',()=>{},()=>{},undefined,undefined,undefined,{read:()=>new Promise(()=>{}),set:vi.fn()})
 const open=(tray.on as any).mock.calls.find((c:any[])=>c[0]==='right-click')[1],pending=open()
 await vi.advanceTimersByTimeAsync(10000);await pending
 expect(tray.popUpContextMenu).toHaveBeenCalledOnce();const menu=mocks.menu.mock.calls.at(-1)![0]
 expect(menu[3]).toMatchObject({label:'자동 실행 상태 확인 불가',enabled:false});expect(menu.at(-2).label).toBe('Open');expect(menu.at(-1).label).toBe('Exit')
 }finally{vi.useRealTimers()}
})
it('keeps mute checkbox at persisted state on failed write and in the approved menu order',async()=>{
 const error=vi.fn(),tray=createTray('icon',()=>{},()=>{},undefined,undefined,undefined,{read:async()=>({supported:true,enabled:true,selected:true,registered:true,disabled:false}),set:vi.fn()},undefined,{read:()=>false,set:()=>{throw Error('disk')},error})
 await (tray.on as any).mock.calls.find((c:any[])=>c[0]==='right-click')[1]()
 let menu=mocks.menu.mock.calls.at(-1)![0];expect(menu.map((v:any)=>v.label??v.type)).toEqual(['연결 상태','separator','About','Windows 시작 시 자동 실행','전체 알림 끄기','separator','Open','Exit'])
 await menu[4].click({checked:true});menu=mocks.menu.mock.calls.at(-1)![0];expect(menu[4].checked).toBe(false);expect(error).toHaveBeenCalledOnce()
})
