import {useEffect,useRef,useState} from 'react'
import {Dialog} from 'radix-ui'
import type {HelpArticle} from '../../shared/help-content'
import dimensions from './images/dimensions.json'
type HelpImage=NonNullable<HelpArticle['image']>
export function AnnotatedImage({image,src,onLoad,onError}:{image:HelpImage;src:string;onLoad?:React.ReactEventHandler<HTMLImageElement>;onError?:React.ReactEventHandler<HTMLImageElement>}) {
 const size=(dimensions as Record<string,{width:number;height:number}>)[image.file]
 return <><img src={src} alt={image.alt} width={size?.width} height={size?.height} draggable={false} onLoad={onLoad} onError={onError}/>{image.points.map((point,i)=><span key={i} className="help-image-pin" aria-hidden="true" style={{left:`${point.x}%`,top:`${point.y}%`}}>{point.step}</span>)}</>
}
export function ImageViewer({image,src,onClose}:{image:HelpImage;src:string;onClose:()=>void}) {
 const view=useRef<HTMLDivElement>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null)
 const [scale,setScale]=useState<number|null>(null),[natural,setNatural]=useState({width:1000,height:600}),[fit,setFit]=useState(700),[failed,setFailed]=useState(false)
 useEffect(()=>{
  const el=view.current;if(!el)return
  const measure=()=>setFit(Math.max(1,Math.min(natural.width,el.clientWidth-40,(el.clientHeight-40)*natural.width/natural.height)))
  measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect()
 },[natural])
 const zoom=(delta:number)=>setScale(s=>Math.min(3,Math.max(.5,(s??fit/natural.width)+delta)))
 useEffect(()=>{
  const el=view.current;if(!el)return
  const wheel=(e:WheelEvent)=>{e.preventDefault();zoom(e.deltaY<0?.1:-.1)}
  el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)
 },[fit,natural.width])
 return <Dialog.Root open onOpenChange={open=>{if(!open)onClose()}}><Dialog.Portal><Dialog.Overlay className="help-image-overlay"/><Dialog.Content className="help-image-dialog" aria-describedby="help-image-instructions">
  <header><Dialog.Title>이미지 확대</Dialog.Title><div className="help-zoom-actions"><button aria-label="축소" onClick={()=>zoom(-.25)}>−</button><output aria-live="polite">{scale===null?'화면 맞춤':`${Math.round(scale*100)}%`}</output><button aria-label="확대" onClick={()=>zoom(.25)}>+</button><button onClick={()=>{setScale(null);view.current?.scrollTo?.(0,0)}}>화면 맞춤</button><Dialog.Close className="help-icon-close" aria-label="확대 보기 닫기">×</Dialog.Close></div></header>
  <div ref={view} className="help-image-viewport" tabIndex={0} aria-label="확대 이미지, 방향키로 이동" onKeyDown={e=>{const el=view.current;if(!el)return;const moves:Record<string,[number,number]>={ArrowLeft:[-60,0],ArrowRight:[60,0],ArrowUp:[0,-60],ArrowDown:[0,60]};const d=moves[e.key];if(d){e.preventDefault();el.scrollLeft+=d[0];el.scrollTop+=d[1]}}}
   onPointerDown={e=>{if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,left:e.currentTarget.scrollLeft,top:e.currentTarget.scrollTop};e.currentTarget.setPointerCapture(e.pointerId)}}
   onPointerMove={e=>{const d=drag.current;if(d){e.currentTarget.scrollLeft=d.left+d.x-e.clientX;e.currentTarget.scrollTop=d.top+d.y-e.clientY}}}
   onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}}>
   {failed?<p role="status">이미지를 불러오지 못했습니다. {image.alt}</p>:<div className="help-image-surface" style={{width:scale===null?fit:natural.width*scale}}><AnnotatedImage image={image} src={src} onLoad={e=>setNatural({width:e.currentTarget.naturalWidth,height:e.currentTarget.naturalHeight})} onError={()=>setFailed(true)}/></div>}
  </div><Dialog.Description id="help-image-instructions">{image.alt} · 휠로 확대·축소, 드래그 또는 방향키로 이동합니다. Escape로 설명에 돌아갑니다.</Dialog.Description>
 </Dialog.Content></Dialog.Portal></Dialog.Root>
}
