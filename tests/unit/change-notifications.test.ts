import { describe, expect, it } from 'vitest'
import { validateChangeEnvelope } from '../../src/domain/change-notifications'
const snapshot={protocolVersion:1,hostId:'11111111-1111-4111-8111-111111111111',datasetId:'22222222-2222-4222-8222-222222222222',projects:[{id:'1',name:'P',color:'#2563EB',participants:[],createdAt:'t',updatedAt:'t'}],schedules:[]}
const notice={id:'notice-1',projectId:'1',title:'P',body:'일정 삭제',target:{kind:'list'}}
const envelope=()=>({version:1,snapshot,cursor:'a'.repeat(64),mode:'delta',notices:[notice]})
describe('strict shared change envelope',()=>{
 it('accepts deletion with authorized project and list target',()=>{expect(validateChangeEnvelope(envelope()).notices).toHaveLength(1)})
 it.each([
  {...envelope(),extra:true}, {...envelope(),cursor:''}, {...envelope(),mode:'unknown'},
  {...envelope(),notices:[{...notice,projectId:'2'}]}, {...envelope(),notices:[{...notice,target:{kind:'project',id:'2'}}]},
  {...envelope(),notices:[{...notice,target:{kind:'schedule',id:'1',projectId:'1'}}]},
  {...envelope(),notices:[{...notice,target:{kind:'list',url:'https://example.com'}}]},
  {...envelope(),notices:[notice,notice]}, {...envelope(),notices:[notice,{...notice,id:'different-id'}]},
  {...envelope(),mode:'initial'}, {...envelope(),mode:'reset'}, {...envelope(),notices:Array.from({length:65},(_,i)=>({...notice,id:String(i)}))},
 ])('rejects invalid fields, unauthorized targets, duplicates and excess notices',value=>{expect(()=>validateChangeEnvelope(value)).toThrow()})
})
