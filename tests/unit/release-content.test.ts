import {expect,it} from 'vitest'
import {releaseNotes,validateReleaseNotes} from '../../src/shared/release-content'
import {validReleaseReading} from '../../src/shared/release-notes'
it('ships every real release since0.8.0 in descending order with nonempty conventional sections',()=>{
 expect(releaseNotes.map(n=>n.version)).toEqual(['1.2.0','1.1.0','1.0.0','0.8.8','0.8.7','0.8.6','0.8.5','0.8.4','0.8.3','0.8.2','0.8.1','0.8.0'])
 expect(validateReleaseNotes(releaseNotes)).toEqual([])
 expect(releaseNotes.find(n=>n.version==='0.8.3')!.sections.find(s=>s.type==='Fix')!.items.join()).toContain('자동 실행')
 expect(releaseNotes[0].sections.flatMap(s=>s.items).join()).not.toContain('13초 지연 해결')
})
it('rejects duplicate versions, unsupported types and empty sections',()=>{
 expect(validateReleaseNotes([releaseNotes[0],releaseNotes[0]])).not.toEqual([])
 expect(validateReleaseNotes([{version:'0.8.5',summary:'',sections:[{type:'Other',items:[]}]}] as any)).not.toEqual([])
 expect(validReleaseReading({version:'0.8.4',scrollTop:120})).toBe(true)
 for(const r of [{version:'../../secret',scrollTop:0},{version:'0.8.4',scrollTop:NaN},{version:'0.8.4',scrollTop:0,url:'https://x'}])expect(validReleaseReading(r)).toBe(false)
})
