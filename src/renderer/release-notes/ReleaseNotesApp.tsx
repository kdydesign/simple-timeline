import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {releaseNotes,releaseTypes} from '../../shared/release-content'
import {validReleaseReading,type ReleaseApi,type ReleaseReading} from '../../shared/release-notes'
import {Icon} from '../components/Icon'
export function ReleaseNotesApp({api}:{api:ReleaseApi}){
 const [reading,setReading]=useState<ReleaseReading>(),[version,setVersion]=useState(''),[failed,setFailed]=useState(false),[maximized,setMaximized]=useState(false)
 const main=useRef<HTMLElement>(null),current=useRef<ReleaseReading|undefined>(undefined),scroll=useRef<number|null>(null),generation=useRef(0)
 const load=()=>{const id=++generation.current;setFailed(false);void api.command('state').then(r=>{if(id!==generation.current)return;if(!r.ok||!validReleaseReading(r.reading))throw Error();current.current=r.reading;scroll.current=r.reading.scrollTop;setReading(r.reading);setVersion(r.version??'');setMaximized(!!r.maximized)}).catch(()=>{if(id===generation.current)setFailed(true)})}
 useEffect(()=>{load();const off=api.onOpen?.(load);return()=>{generation.current++;off?.()}},[api])
 useLayoutEffect(()=>{if(main.current&&scroll.current!==null){main.current.scrollTop=scroll.current;scroll.current=null}},[reading])
 const remember=(r:ReleaseReading)=>{current.current=r;void api.command('remember',r)}
 const select=(v:string)=>{const r={version:v,scrollTop:0};scroll.current=0;remember(r);setReading(r);main.current?.focus()}
 const control=async(c:'minimize'|'toggle-maximize'|'close')=>{
  const last=current.current
  if(last)await api.command('remember',{version:last.version,scrollTop:main.current?.scrollTop??last.scrollTop})
  const r=await api.command(c);if(r.ok)setMaximized(!!r.maximized)
 }
 useEffect(()=>{const sync=()=>void api.command('state').then(r=>{if(r.ok)setMaximized(!!r.maximized)});window.addEventListener('resize',sync);return()=>window.removeEventListener('resize',sync)},[api])
 const note=releaseNotes.find(n=>n.version===reading?.version)
 return <div className="help-app"><header className="help-titlebar"><strong>WorkRail 릴리즈노트</strong><div className="help-window-controls"><button aria-label="최소화" onClick={()=>void control('minimize')}><Icon name="minimize"/></button><button aria-label={maximized?'이전 크기로 복원':'최대화'} onClick={()=>void control('toggle-maximize')}><Icon name={maximized?'restore':'maximize'}/></button><button className="help-icon-close" aria-label="릴리즈노트 닫기" onClick={()=>void control('close')}><Icon name="close"/></button></div></header>
  {failed?<div className="help-failure"><p role="alert">릴리즈노트를 준비하지 못했습니다.</p><button onClick={load}>다시 시도</button></div>:!note||!reading?<p role="status">릴리즈노트를 준비하고 있습니다.</p>:<><div className="help-toolbar"><strong>버전별 변경 내용</strong><span>인터넷 연결 없이 사용할 수 있습니다.</span></div><div className="help-layout"><aside><nav aria-label="릴리즈 버전">{releaseNotes.map(n=><button key={n.version} aria-label={n.version} aria-current={n.version===reading.version?'page':undefined} onClick={()=>select(n.version)}>{n.version}{n.version===version&&<small>현재 설치 버전</small>}</button>)}</nav></aside><main ref={main} data-release-version={reading.version} tabIndex={-1} onScroll={e=>remember({...reading,scrollTop:e.currentTarget.scrollTop})}><h1>{Number(note.version.split('.')[0])>=1?'WorkRail':'Planrail'} {note.version}</h1><p className="help-intro">{note.summary}</p>{note.sections.map(s=><section className="release-section" key={s.type}><h2>{s.type} · {releaseTypes[s.type]}</h2><ul>{s.items.map(item=><li key={item}>{item}</li>)}</ul></section>)}{note.notes?.length&&<section className="help-related"><h2>사용 안내</h2><ul>{note.notes.map(n=><li key={n}>{n}</li>)}</ul></section>}</main></div><footer>오프라인 릴리즈노트<span>WorkRail {version}</span></footer></>}
 </div>
}
