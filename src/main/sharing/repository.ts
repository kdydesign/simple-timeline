import type {Repository} from '../db/repository'
import type {SharingStore} from '../db/sharing/store'
import type {ProjectInput,TimelineSnapshot} from '../../shared/types'
import {sortSnapshot} from '../../domain/sort'
import {failure} from '../errors'
export type TimelineRepository={ [K in keyof Repository]: (...args:Parameters<Repository[K]>)=>ReturnType<Repository[K]> }
export function createSharingRepository(local:Repository,store:SharingStore):TimelineRepository {
  const same=(a:string[],b:string[])=>a.length===b.length&&a.every((name,i)=>name===b[i])
  return {...local,
    getSnapshot():TimelineSnapshot{
      const source=local.getSnapshot(),shared=new Set(store.listSharedProjects().map(p=>p.id))
      const member=store.getConfig().role==='member'?store.readCache():{projects:[],schedules:[]}
      return sortSnapshot({projects:[...source.projects.map(p=>shared.has(p.id)?{...p,sharing:'host' as const}:p),...member.projects],schedules:[...source.schedules.map(s=>shared.has(s.projectId)?{...s,sharing:'host' as const}:s),...member.schedules]})
    },
    createProject(input:ProjectInput){
      if(store.getConfig().role!=='host'&&input.participants.length)throw failure('FORBIDDEN')
      return local.createProject(input)
    },
    updateProject(input:ProjectInput&{id:string}){
      const current=local.getSnapshot().projects.find(p=>p.id===input.id)
      if(store.getConfig().role!=='host'&&current&&!same(input.participants,current.participants))throw failure('FORBIDDEN')
      const mapping=store.listSharedProjects().find(p=>p.id===input.id)
      if(mapping){
        if(!same(input.participants,mapping.participants.map(p=>p.name)))throw failure('FORBIDDEN')
        return store.saveProject({...input,participants:mapping.participants})
      }
      return local.updateProject(input)
    },
  }
}
