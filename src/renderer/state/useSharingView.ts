import {useCallback,useEffect,useMemo,useState} from 'react'
import type {TimelineSnapshot} from '../../shared/types'
export type SourceFilter='all'|'personal'|'shared'
export function useSharingView(live:TimelineSnapshot|null,filter:SourceFilter) {
 const [frozen,setFrozen]=useState<TimelineSnapshot|null>(null)
 const dragInvalidated=useMemo(()=>{
  if(!frozen||!live)return false
  const projectIds=new Set(live.projects.map(p=>p.id)),scheduleIds=new Set(live.schedules.map(s=>s.id))
  return frozen.projects.some(p=>p.sharing==='member'&&!projectIds.has(p.id))||frozen.schedules.some(s=>s.sharing==='member'&&!scheduleIds.has(s.id))
 },[frozen,live])
 useEffect(()=>{if(dragInvalidated)setFrozen(null)},[dragInvalidated])
 const source=frozen&&!dragInvalidated?frozen:live
 const snapshot=useMemo(()=>{
  if(!source)return null
  const projects=source.projects.filter(p=>filter==='all'||(filter==='shared'?!!p.sharing:!p.sharing)),ids=new Set(projects.map(p=>p.id))
  return{projects,schedules:source.schedules.filter(s=>ids.has(s.projectId))}
 },[source,filter])
 const editableProjects=useMemo(()=>(live?.projects??[]).filter(p=>p.sharing!=='member'),[live])
 const beginDrag=useCallback(()=>setFrozen(live),[live]),endDrag=useCallback(()=>setFrozen(null),[])
 return{snapshot,editableProjects,beginDrag,endDrag,dragInvalidated}
}
