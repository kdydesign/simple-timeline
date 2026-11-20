import {useLayoutEffect, useMemo, useRef, type RefObject} from 'react'

const allHits = 'postrail-response-hits'
const activeHit = 'postrail-response-current'

/** Build ranges over text nodes so a match can cross JSON syntax spans. */
function rangeFactory(mirror:HTMLElement) {
  const nodes: {node:Text,start:number}[] = []
  const walker = document.createTreeWalker(mirror,NodeFilter.SHOW_TEXT)
  let length = 0
  for (let node=walker.nextNode(); node; node=walker.nextNode()) {
    nodes.push({node:node as Text,start:length})
    length += node.textContent?.length ?? 0
  }
  function at(offset:number) {
    let low=0, high=nodes.length
    while (low+1<high) {
      const middle=Math.floor((low+high)/2)
      if (nodes[middle].start<=offset) low=middle
      else high=middle
    }
    return nodes[low]
  }
  return (from:number,to:number)=>{
    const first=at(from), last=at(to-1)
    const range=new Range()
    range.setStart(first.node,from-first.start)
    range.setEnd(last.node,to-last.start)
    return range
  }
}

export function useResponseSearch(text:string, query:string, index:number, mirror:RefObject<HTMLPreElement|null>) {
  const rangeAt = useRef<((index:number)=>Range)|null>(null)
  const offsets = useMemo(()=>{
    if (!query) return []
    const literal = query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
    return Array.from(text.matchAll(new RegExp(literal,'giu')), match=>match.index)
  },[text,query])
  useLayoutEffect(()=>{
    const element = mirror.current
    const viewport = element?.parentElement?.parentElement
    if (!element || !viewport || !offsets.length || !globalThis.CSS?.highlights) return
    const makeRange = rangeFactory(element)
    const hit = (i:number)=>makeRange(offsets[i],offsets[i]+query.length)
    rangeAt.current = hit
    const marks = new Highlight()
    // A frequent match in a large payload can have millions of positions. Only
    // materialize browser ranges for blocks in view; navigation still uses every offset.
    const windowed = offsets.length > 1024
    const paint = ()=>{
      marks.clear()
      const bounds = viewport.getBoundingClientRect()
      function addBlock(first:number,end:number) {
        if (windowed) {
          const rect = makeRange(offsets[first],offsets[end-1]+query.length).getBoundingClientRect()
          if (rect.bottom<bounds.top || rect.top>bounds.bottom || rect.right<bounds.left || rect.left>bounds.right) return
          if (end-first>64) {
            const middle=Math.floor((first+end)/2)
            addBlock(first,middle)
            addBlock(middle,end)
            return
          }
        }
        for (let i=first;i<end;i++) marks.add(hit(i))
      }
      addBlock(0,offsets.length)
      CSS.highlights.set(allHits,marks)
    }
    paint()
    let resize:ResizeObserver|undefined
    if (windowed) {
      viewport.addEventListener('scroll',paint,{passive:true})
      resize=new ResizeObserver(paint)
      resize.observe(viewport)
    }
    return ()=>{
      viewport.removeEventListener('scroll',paint)
      resize?.disconnect()
      if (CSS.highlights.get(allHits)===marks) CSS.highlights.delete(allHits)
      rangeAt.current=null
    }
  },[offsets,query,mirror])

  useLayoutEffect(()=>{
    const range = rangeAt.current?.(index)
    const viewport = mirror.current?.parentElement?.parentElement
    if (!range || !viewport) return
    const mark = new Highlight(range)
    mark.priority=1
    CSS.highlights.set(activeHit,mark)
    const match = range.getBoundingClientRect()
    const bounds = viewport.getBoundingClientRect()
    if (match.top<bounds.top || match.bottom>bounds.bottom) viewport.scrollTop += match.top-bounds.top-4
    if (match.left<bounds.left || match.right>bounds.right) viewport.scrollLeft += match.left-bounds.left-4
    return ()=>{ if (CSS.highlights.get(activeHit)===mark) CSS.highlights.delete(activeHit) }
  },[offsets,index,mirror])
  return offsets.length
}
