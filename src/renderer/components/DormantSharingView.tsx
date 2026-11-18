import {useEffect,useRef,useState} from 'react'
import type {SharingApi} from '../../shared/sharing'
import type {HolidayCalendar} from '../../shared/holidays'
import type {Project,Schedule} from '../../shared/types'
import {Button} from './ui/button'
import {restoreFocus} from '../state/restoreFocus'
type DormantData={projects:Project[];schedules:Schedule[];holidays:HolidayCalendar}
/** Deliberately separate from calendar state: this data is only displayed here. */
export function DormantSharingView({api,onBack}:{api:SharingApi;onBack:()=>void}){
 const [data,setData]=useState<DormantData|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 const heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{restoreFocus(heading.current)},[])
 useEffect(()=>{
  let active=true;setError('');setData(null)
  void api.getDormantData().then(result=>{if(!active)return;if(result.ok)setData(result.data);else setError(result.error.message)}).catch(()=>{if(active)setError('중지된 공유 자료를 읽지 못했습니다. 다시 시도하세요.')})
  return()=>{active=false}
 },[api,attempt])
 return <section className="dormant-sharing" aria-label="중지된 공유 자료">
  <div className="sharing-role-summary"><h3 ref={heading} tabIndex={-1}>중지된 공유 자료</h3><Button onClick={onBack}>공유 설정으로 돌아가기</Button></div>
  <p className="help">이 PC의 이전 호스트 원본입니다. 조회만 가능하며 현재 일정·달력·워킹데이·알림에는 포함되지 않습니다.</p>
  {error?<><p role="alert">{error}</p><Button onClick={()=>setAttempt(v=>v+1)}>조회 다시 시도</Button></>:!data?<p role="status">보관 자료를 확인하고 있습니다.</p>:<>
   <h4>프로젝트와 일정</h4>
   {!data.projects.length&&<p className="help">보관된 공유 프로젝트가 없습니다.</p>}
   {data.projects.map(project=><section className="dormant-project" key={project.id} aria-label={project.name}>
    <h5>{project.name}</h5><p className="help">참여자: {project.participants.join(', ')||'없음'}</p>
    {data.schedules.some(schedule=>schedule.projectId===project.id)?<table><thead><tr><th scope="col">일정</th><th scope="col">기간</th></tr></thead><tbody>{data.schedules.filter(schedule=>schedule.projectId===project.id).map(schedule=><tr key={schedule.id}><td>{schedule.name}</td><td><time dateTime={schedule.startDate}>{schedule.startDate}</time> ~ <time dateTime={schedule.endDate}>{schedule.endDate}</time></td></tr>)}</tbody></table>:<p className="help">보관된 일정이 없습니다.</p>}
   </section>)}
   <h4>당시 공통 휴일</h4>
   <dl className="dormant-holidays"><dt>반복 휴일</dt><dd>{[1,2,3,4,5,6,0].filter(day=>data.holidays.weekdays.includes(day)).map(day=>`${['일','월','화','수','목','금','토'][day]}요일`).join(', ')||'없음'}</dd></dl>
   {data.holidays.dates.length?<table><thead><tr><th scope="col">기간</th><th scope="col">휴일 이름</th></tr></thead><tbody>{data.holidays.dates.map(holiday=><tr key={holiday.date}><td><time dateTime={holiday.date}>{holiday.date}</time>{holiday.endDate&&<> ~ <time dateTime={holiday.endDate}>{holiday.endDate}</time></>}</td><td>{holiday.name}</td></tr>)}</tbody></table>:<p className="help">보관된 날짜별 휴일이 없습니다.</p>}
  </>}
 </section>
}
