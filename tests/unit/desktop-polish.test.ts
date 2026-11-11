import {it,expect} from 'vitest'
import {initialWindowBounds} from '../../src/main/window-bounds'
it('centers 1707 by 890 DIP within a large work area',()=>{
 expect(initialWindowBounds({x:0,y:0,width:1920,height:1040})).toEqual({x:106,y:75,width:1707,height:890})
})
it('clamps both dimensions to small and offset work areas',()=>{
 expect(initialWindowBounds({x:-1280,y:50,width:1280,height:700})).toEqual({x:-1280,y:50,width:1280,height:700})
})
