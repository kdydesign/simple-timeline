import type {Repository} from '../db/repository'
import type {SharingStore} from '../db/sharing/store'
import type {ProjectInput,TimelineSnapshot} from '../../shared/types'
import {sortSnapshot} from '../../domain/sort'
import {failure} from '../errors'
export type TimelineRepository={ [K in keyof Repository]: (...args:Parameters<Repository[K]>)=>ReturnType<Repository[K]> }
export function createSharingRepository(local:Repository,store:SharingStore):TimelineRepository {
  const idle=()=>{if(store.getRoleTransition())throw failure('FORBIDDEN')}
  const projectWritable=(id:string)=>{idle();if(store.getConfig().role!=='host'&&store.listSharedProjects().some(p=>p.id===id))throw failure('FORBIDDEN')}
  const scheduleWritable=(id:string)=>{idle();if(store.dormantSnapshot().schedules.some(s=>s.id===id))throw failure('FORBIDDEN')}
  const same=(a:string[],b:string[])=>a.length===b.length&&a.every((name,i)=>name===b[i])
  return {...local,
    deleteProject(input){projectWritable(input.id);return local.deleteProject(input)},
    createSchedule(input){projectWritable(input.projectId);return local.createSchedule(input)},
    updateSchedule(input){scheduleWritable(input.id);return local.updateSchedule(input)},
    updateScheduleReminder(input){scheduleWritable(input.id);return local.updateScheduleReminder(input)},
    deleteSchedule(input){scheduleWritable(input.id);return local.deleteSchedule(input)},
    getSnapshot():TimelineSnapshot{
      const source=local.getSnapshot(),shared=new Set(store.listSharedProjects().map(p=>p.id))
      const member=store.getConfig().role==='member'&&!store.getRoleTransition()?store.readCache():{projects:[],schedules:[]}
      return sortSnapshot({projects:[...source.projects.map(p=>shared.has(p.id)?{...p,sharing:'host' as const}:p),...member.projects],schedules:[...source.schedules.map(s=>shared.has(s.projectId)?{...s,sharing:'host' as const}:s),...member.schedules]})
    },
    createProject(input:ProjectInput){
      idle()
      if(store.getConfig().role!=='host'&&input.participants.length)throw failure('FORBIDDEN')
      return local.createProject(input)
    },
    updateProject(input:ProjectInput&{id:string}){
      projectWritable(input.id)
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
