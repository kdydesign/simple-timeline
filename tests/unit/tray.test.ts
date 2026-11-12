import {it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({menu:vi.fn(v=>v),bitmap:vi.fn((data)=>({data})),tray:class {setToolTip=vi.fn();setContextMenu=vi.fn();on=vi.fn();destroy=vi.fn();popUpContextMenu=vi.fn()}}))
vi.mock('electron',()=>({Menu:{buildFromTemplate:mocks.menu},Tray:mocks.tray,nativeImage:{createFromBitmap:mocks.bitmap}}))
import {createTray,updateSharingTray} from '../../src/main/tray'
import type {SharingState} from '../../src/shared/sharing'
it('uses selectable native colored status and exact menu order; settings, Open, Exit retain independent callbacks',()=>{
 const show=vi.fn(),exit=vi.fn(),about=vi.fn(),settings=vi.fn(),tray=createTray('icon',show,exit,about,settings);
 let menu=mocks.menu.mock.calls.at(-1)![0];expect(menu.map((v:any)=>v.label??v.type)).toEqual(['연결 상태','separator','About','separator','Open','Exit']);expect(menu[0].enabled).not.toBe(false);menu[0].click();menu[4].click();menu[5].click();expect(settings).toHaveBeenCalledOnce();expect(show).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledOnce();
 updateSharingTray(tray,{role:'member',status:'connected',message:'연결됨'} as SharingState);const green=mocks.bitmap.mock.calls.at(-1)![0];updateSharingTray(tray,{role:'member',status:'disconnected',message:'연결 실패'} as SharingState);expect(mocks.bitmap.mock.calls.at(-1)![0]).not.toEqual(green);
})

it('refreshes Windows startup state when opening menu and explicit checkbox applies only that choice',async()=>{
 const changed:boolean[]=[],startup={read:async()=>({supported:true,enabled:false,selected:true,registered:true,disabled:true}),set:async(value:boolean)=>{changed.push(value);return {state:{supported:true,enabled:value,selected:value,registered:value,disabled:false}}}},tray=createTray('icon',()=>{},()=>{},()=>{},()=>{},undefined,startup)
 const rightClick=(tray.on as any).mock.calls.find((c:any[])=>c[0]==='right-click')[1]
 await rightClick();let menu=mocks.menu.mock.calls.at(-1)![0];expect(menu.map((v:any)=>v.label??v.type)).toEqual(['연결 상태','separator','About','Windows 시작 시 자동 실행','separator','Open','Exit']);expect(menu[3]).toMatchObject({type:'checkbox',checked:false,enabled:true})
 await menu[3].click({checked:true});expect(changed).toEqual([true]);menu=mocks.menu.mock.calls.at(-1)![0];expect(menu[3].checked).toBe(true)
})

it('opens Open and Exit immediately while Windows startup status is still pending',async()=>{
 let finish!:(value:any)=>void
 const startup={read:()=>new Promise<any>(r=>{finish=r}),set:async()=>{throw Error('not used')}},tray=createTray('icon',()=>{},()=>{},undefined,undefined,undefined,startup)
 const open=(tray.on as any).mock.calls.find((c:any[])=>c[0]==='right-click')[1]
 const pending=open();expect(tray.popUpContextMenu).toHaveBeenCalledOnce()
 const menu=mocks.menu.mock.calls.at(-1)![0];expect(menu[3].enabled).toBe(false);expect(menu[5].label).toBe('Open');expect(menu[6].label).toBe('Exit')
 finish({supported:true,enabled:false,selected:true,registered:true,disabled:true});await pending
})
