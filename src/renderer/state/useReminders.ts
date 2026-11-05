import {useCallback,useEffect,useRef,useState} from 'react'
import type {ReminderApi,ReminderState} from '../../shared/reminder-api'
const empty:ReminderState={failed:0,unknown:0,storageError:false,openRequest:null}
export function useReminders(api:ReminderApi|undefined=window.timelineReminders){
 const [state,setState]=useState(empty),[error,setError]=useState('')
 const generation=useRef(0),alive=useRef(false)
 const refresh=useCallback(async()=>{
  if(!api)return
  const seq=++generation.current
  try{const result=await api.getState();if(!alive.current||seq!==generation.current)return
   if(result.ok){setState(result.data);setError('')}else setError(result.error.message)
  }catch{if(alive.current&&seq===generation.current)setError('알림 상태를 확인하지 못했습니다.')}
 },[api])
 useEffect(()=>{alive.current=true;const off=api?.onChange(()=>{void refresh()});void refresh();return()=>{alive.current=false;generation.current++;off?.()}},[api,refresh])
 const acknowledge=async(token:number)=>{try{await api?.acknowledge(token)}catch{if(alive.current)setError('알림 선택 상태를 확인하지 못했습니다.')}await refresh()}
 const retry=async()=>{try{const result=await api?.retry();if(result&&!result.ok&&alive.current)setError(result.error.message)}catch{if(alive.current)setError('알림 재시도 요청을 확인하지 못했습니다.')}await refresh()}
 return {...state,error,refresh,retry,acknowledge}
}
