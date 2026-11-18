import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {helpArticles,helpSections,searchHelp} from '../../shared/help-content'
import {validHelpReading,type HelpApi,type HelpReadingState,type HelpTopicId} from '../../shared/help'
import {Icon} from '../components/Icon'
import {AnnotatedImage,ImageViewer} from './ImageViewer'

const images=import.meta.glob<string>('./images/*.png',{eager:true,query:'?url',import:'default'})
export function HelpApp({api}:{api:HelpApi}) {
 const [openId,setOpenId]=useState(0);const loadGeneration=useRef(0)
 const [reading,setReading]=useState<HelpReadingState>(),[version,setVersion]=useState(''),[failed,setFailed]=useState(false)
 const [maximized,setMaximized]=useState(false),[toc,setToc]=useState(true),[zoom,setZoom]=useState(false),[brokenImage,setBrokenImage]=useState(false)
 const content=useRef<HTMLElement>(null),search=useRef<HTMLInputElement>(null),imageButton=useRef<HTMLButtonElement>(null),restoreScroll=useRef<number|null>(null)
 const pendingReading=useRef<HelpReadingState|undefined>(undefined)
 const load=()=>{const generation=++loadGeneration.current;setFailed(false);void api.command('state').then(r=>{if(generation!==loadGeneration.current)return;if(!r.ok||!validHelpReading(r.reading))throw Error();restoreScroll.current=r.reading.scrollTop;pendingReading.current=r.reading;setReading(r.reading);setOpenId(r.openId??0);setVersion(r.version??'');setMaximized(!!r.maximized)}).catch(()=>{if(generation===loadGeneration.current)setFailed(true)})}
 useEffect(()=>{load();const off=api.onOpen?.(load);return()=>{loadGeneration.current++;off?.()}},[api])
 useEffect(()=>{if(!openId||!reading||failed)return;let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>{void api.command('ready',openId)})});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second)}},[api,openId,!!reading,failed])
 const remember=(next:HelpReadingState)=>{pendingReading.current=next;setReading(next);void api.command('remember',next)}
 const article=helpArticles.find(a=>a.id===reading?.topicId)
 useLayoutEffect(()=>{if(content.current&&restoreScroll.current!==null){content.current.scrollTop=restoreScroll.current;restoreScroll.current=null}},[reading?.topicId])
 const select=(topicId:HelpTopicId)=>{if(!reading)return;restoreScroll.current=0;if(content.current)content.current.scrollTop=0;setBrokenImage(false);remember({...reading,topicId,scrollTop:0});content.current?.focus()}
 const control=async(command:'minimize'|'toggle-maximize'|'close')=>{
  if(pendingReading.current)await api.command('remember',pendingReading.current)
  const r=await api.command(command);if(r.ok)setMaximized(!!r.maximized)
 }
 useEffect(()=>{const resize=()=>void api.command('state').then(r=>{if(r.ok)setMaximized(!!r.maximized)});window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[api])
 const results=searchHelp(reading?.query??''),querying=!!reading?.query.trim()
 return <div className="help-app">
  <header className="help-titlebar"><strong>WorkRail 도움말</strong><div className="help-window-controls"><button aria-label="최소화" onClick={()=>void control('minimize')}><Icon name="minimize"/></button><button aria-label={maximized?'이전 크기로 복원':'최대화'} onClick={()=>void control('toggle-maximize')}><Icon name={maximized?'restore':'maximize'}/></button><button className="help-icon-close" aria-label="도움말 닫기" onClick={()=>void control('close')}><Icon name="close"/></button></div></header>
  {failed?<div className="help-failure"><p role="alert">도움말을 준비하지 못했습니다. 주 창은 계속 사용할 수 있습니다.</p><button onClick={load}>다시 시도</button></div>:!reading||!article?<p role="status">도움말을 준비하고 있습니다.</p>:<>
   <div className="help-toolbar"><button aria-label={toc?'목차 접기':'목차 펼치기'} aria-expanded={toc} onClick={()=>setToc(!toc)}><Icon name="gantt"/>{toc?'목차 접기':'목차 펼치기'}</button><span>인터넷 연결 없이 사용할 수 있습니다.</span></div>
   <div className={`help-layout ${toc?'':'help-toc-hidden'}`}>
    {toc&&<aside><label htmlFor="help-search">도움말 검색</label><input ref={search} id="help-search" type="search" maxLength={200} placeholder="예: 승인, 업데이트" value={reading.query} onChange={e=>remember({...reading,scrollTop:pendingReading.current?.scrollTop??reading.scrollTop,query:e.target.value})}/>{reading.query&&<button className="help-clear" onClick={()=>{remember({...reading,scrollTop:pendingReading.current?.scrollTop??reading.scrollTop,query:''});search.current?.focus()}}>검색 지우기</button>}
    <nav aria-label="도움말 목차">{results.length===0?<p role="status">검색 결과가 없습니다. 다른 검색어를 입력하세요.</p>:helpSections.map(group=>{
     const items=results.filter(r=>r.article.section===group);return items.length>0&&<section key={group}><h2>{group}</h2>{items.map(r=><button key={r.article.id} aria-current={reading.topicId===r.article.id?'page':undefined} onClick={()=>select(r.article.id)}><span>{r.article.title}</span>{querying&&<small>{r.excerpt}</small>}</button>)}</section>
    })}</nav><p className="help-role-note">모든 역할의 설명을 볼 수 있습니다.<br/>이 창은 설정을 변경하지 않습니다.</p></aside>}
    <main ref={content} tabIndex={-1} onScroll={e=>{const next={...reading,scrollTop:e.currentTarget.scrollTop};pendingReading.current=next;void api.command('remember',next)}}>
     <p className="help-breadcrumb">{article.section}</p><h1>{article.title}</h1><p className="help-intro">{article.intro}</p>
     {article.id==='getting-started'&&<figure className="help-flow"><figcaption>공유 관계</figcaption><div><span>호스트 PC<br/><strong>공유 원본 관리</strong></span><span aria-label="승인된 PC에 전달">→</span><span>승인된 멤버 PC<br/><strong>허용된 자료 조회</strong></span></div><p>각 PC의 개인 자료와 자기 일정 알림은 따로 유지됩니다.</p></figure>}
     {article.image&&<figure className="help-figure" style={{maxWidth:article.image.width??720}}>{brokenImage?<p role="status">이미지를 불러오지 못했습니다. {article.image.alt} 아래 번호 설명으로 확인하세요.</p>:<button ref={imageButton} className="help-image-button" aria-label={`화면 확대: ${article.image.alt}`} onClick={()=>setZoom(true)}><AnnotatedImage image={article.image} src={images[`./images/${article.image.file}`]??''} onError={()=>setBrokenImage(true)}/></button>}<figcaption>{article.image.caption} {!brokenImage&&<span>클릭하여 확대</span>}</figcaption></figure>}
     <ol className="help-steps">{article.steps.map((step,i)=><li key={i}><span className="help-step-number" aria-hidden="true">{i+1}</span><div><h2>{step.title}</h2><p>{step.text}</p></div></li>)}</ol>
     {article.note&&<p className="help-note">{article.note}</p>}
     <section className="help-related"><h2>함께 보기</h2>{article.related.map(id=><button key={id} onClick={()=>select(id)}>{helpArticles.find(a=>a.id===id)!.title}</button>)}</section>
    </main>
   </div><footer>오프라인 도움말 <span>WorkRail {version}</span></footer>
   {zoom&&article.image&&<ImageViewer image={article.image} src={images[`./images/${article.image.file}`]??''} onClose={()=>{setZoom(false);requestAnimationFrame(()=>imageButton.current?.focus())}}/>}
  </>}
 </div>
}
