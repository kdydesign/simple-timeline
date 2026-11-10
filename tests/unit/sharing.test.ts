import { describe, expect, it } from 'vitest'
import { sharedId, parseSharedId, normalizeIPv4, validateWireSnapshot } from '../../src/domain/sharing'
import { compareIds } from '../../src/domain/sort'
const host='11111111-1111-4111-8111-111111111111', dataset='22222222-2222-4222-8222-222222222222'
describe('sharing boundaries',()=>{
 it('keeps local and remote IDs distinct with deterministic source-aware ordering',()=>{
  const id=sharedId(host,dataset,'1')
  expect(id).not.toBe('1');expect(parseSharedId(id)).toEqual({hostId:host,datasetId:dataset,remoteId:'1'})
  expect(compareIds('1',id)).toBe(-1);expect(compareIds(sharedId(host,dataset,'2'),sharedId(host,dataset,'10'))).toBe(-1)
  for(const bad of ['1','shared:a:b:1',`${id}:extra`])expect(()=>parseSharedId(bad)).toThrow()
  expect(()=>sharedId(host,dataset,'01')).toThrow()
 })
 it('normalizes unambiguous IPv4 and rejects alternate or malformed address spellings',()=>{
  expect(normalizeIPv4(' 192.168.1.23 ')).toBe('192.168.1.23')
  for(const bad of ['192.168.001.23','256.1.1.1','127.1','0x7f000001','::1','1.2.3.4:80','localhost',null])expect(()=>normalizeIPv4(bad)).toThrow()
 })
 it('rejects unknown wire fields, duplicate IDs, orphan schedules and invalid business dates',()=>{
  const snapshot={protocolVersion:1,hostId:host,datasetId:dataset,projects:[{id:'1',name:'P',color:'#2563EB',participants:['A'],createdAt:'t',updatedAt:'t'}],schedules:[{id:'1',projectId:'1',name:'S',startDate:'0001-01-01',endDate:'9999-12-31',createdAt:'t',updatedAt:'t'}]}
  expect(validateWireSnapshot(snapshot)).toEqual(snapshot)
  for(const bad of [{...snapshot,credential:'secret'},{...snapshot,projects:[...snapshot.projects,...snapshot.projects]},{...snapshot,schedules:[{...snapshot.schedules[0],projectId:'2'}]},{...snapshot,schedules:[{...snapshot.schedules[0],startDate:'2026-02-30'}]},{...snapshot,schedules:[{...snapshot.schedules[0],reminder:{}}]}])expect(()=>validateWireSnapshot(bad)).toThrow()
 })
})
