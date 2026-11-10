import {it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({menu:vi.fn(v=>v),bitmap:vi.fn((data)=>({data})),tray:class {setToolTip=vi.fn();setContextMenu=vi.fn();on=vi.fn();destroy=vi.fn()}}))
vi.mock('electron',()=>({Menu:{buildFromTemplate:mocks.menu},Tray:mocks.tray,nativeImage:{createFromBitmap:mocks.bitmap}}))
import {createTray,updateSharingTray} from '../../src/main/tray'
import type {SharingState} from '../../src/shared/sharing'
it('uses selectable native colored status and exact menu order; settings, Open, Exit retain independent callbacks',()=>{
 const show=vi.fn(),exit=vi.fn(),about=vi.fn(),settings=vi.fn(),tray=createTray('icon',show,exit,about,settings);
 let menu=mocks.menu.mock.calls.at(-1)![0];expect(menu.map((v:any)=>v.label??v.type)).toEqual(['● 연결 상태','separator','About','separator','Open','Exit']);expect(menu[0].enabled).not.toBe(false);menu[0].click();menu[4].click();menu[5].click();expect(settings).toHaveBeenCalledOnce();expect(show).toHaveBeenCalledOnce();expect(exit).toHaveBeenCalledOnce();
 updateSharingTray(tray,{role:'member',status:'connected',message:'연결됨'} as SharingState);const green=mocks.bitmap.mock.calls.at(-1)![0];updateSharingTray(tray,{role:'member',status:'disconnected',message:'연결 실패'} as SharingState);expect(mocks.bitmap.mock.calls.at(-1)![0]).not.toEqual(green);
})
