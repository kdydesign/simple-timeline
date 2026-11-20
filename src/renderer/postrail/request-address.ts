import type {PrQuery,PrRequest} from '../../shared/postrail'
import {pathNames, queryFromUrl, urlWithQuery} from '../../shared/postrail-parameters'
import {mergeEnabled} from './header-fields'

type Address = Pick<PrRequest,'url'|'queryRows'|'pathValues'>

export function changedAddress(input:Address, url:string):Address {
  const patch:Address = {url}
  if (url === input.url) return patch
  const previousRows=input.queryRows ?? queryFromUrl(input.url)
  const incoming=queryFromUrl(url)
  if (input.queryRows || incoming.some(row=>row.raw?.includes('${'))) {
    // Identical visible segments can mix legacy raw and structured substitution.
    // Match their occurrences in the previous order, even when another field moved.
    const bySegment=new Map<string,PrQuery[]>()
    for (let i=previousRows.length-1;i>=0;i--) {
      const row=previousRows[i]
      if (!row.enabled) continue
      const segment=urlWithQuery('',[row]).slice(1)
      const matches=bySegment.get(segment)
      if (matches) matches.push(row)
      else bySegment.set(segment,[row])
    }
    const active=incoming.map(row=>{
      const existing=bySegment.get(row.raw ?? '')?.pop()
      if (existing) return existing
      return row.raw?.includes('${') ? {...row,encodeVariables:true} : row
    })
    if (input.queryRows || active.some(row=>row.encodeVariables)) patch.queryRows=mergeEnabled(previousRows,active)
  }
  const oldPaths = pathNames(input.url)
  const newPaths = pathNames(url)
  if (input.pathValues || newPaths.some(name=>!oldPaths.includes(name))) {
    const previous = input.pathValues ?? {}
    patch.pathValues = Object.fromEntries(newPaths.map(name=>[name,Object.hasOwn(previous,name) ? previous[name] : '']))
  }
  return patch
}
