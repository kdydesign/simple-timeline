import {postRailHeaderNameError} from '../../shared/postrail-parameters'
import type {PrField} from '../../shared/postrail'

export function activeHeaders(rows:PrField[]) {
  return Object.fromEntries(rows.filter(row=>row.enabled).map(row=>[row.name,row.value]))
}

export function headerIssue(rows:PrField[]) {
  const seen=new Set<string>()
  for (const [index,row] of rows.entries()) {
    if (!row.enabled) continue
    const key=row.name.toLowerCase()
    const message=postRailHeaderNameError(row.name)
    if (message) return {index,message}
    if (seen.has(key)) return {index,message:'같은 이름의 헤더가 두 번 있습니다.'}
    seen.add(key)
  }
  return undefined
}

export function rawHeaders(rows:PrField[]) {
  return rows.filter(row=>row.enabled).map(row=>row.name+': '+row.value).join('\n')
}

export function parseRawHeaders(text:string) {
  const rows:PrField[]=[]
  const lines:number[]=[]
  for (const [index,line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    const split=line.indexOf(':')
    if (split<1) return {error:(index+1)+'행 · 이름: 값 형식으로 입력하세요.',rows}
    rows.push({name:line.slice(0,split).trim(),value:line.slice(split+1).trim(),enabled:true})
    lines.push(index+1)
  }
  const issue=headerIssue(rows)
  return {rows,error:issue ? lines[issue.index]+'행 · '+issue.message : ''}
}

/** Disabled rows keep their positions while the visible rows follow the new text. */
export function mergeEnabled<T extends PrField>(previous:T[],active:T[]):T[] {
  let next=0
  const merged:T[]=[]
  for (const row of previous) {
    if (!row.enabled) merged.push(row)
    else if (next<active.length) merged.push(active[next++])
  }
  return merged.concat(active.slice(next))
}
