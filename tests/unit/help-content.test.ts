import {expect,it} from 'vitest'
import {existsSync} from 'node:fs'
import {helpArticles,searchHelp,validateHelpContent} from '../../src/shared/help-content'
import {helpTopicIds,initialHelpTopic} from '../../src/shared/help'
it('covers every stable topic with valid local image paths and related links',()=>{
 expect(validateHelpContent(helpArticles)).toEqual([])
 expect(helpArticles.map(x=>x.id).sort()).toEqual([...helpTopicIds].sort())
 for(const a of helpArticles){expect(a.steps.length).toBeGreaterThan(0);if(a.image)expect(existsSync(`src/renderer/help/images/${a.image.file}`)).toBe(true)}
 expect(validateHelpContent([...helpArticles,helpArticles[0]])).not.toEqual([])
 expect(validateHelpContent([{...helpArticles[0],related:['missing'] as any}])).not.toEqual([])
})
it('searches Korean titles/body/steps and trims query without searching user data',()=>{
 expect(searchHelp('   지문   ').map(x=>x.article.id)).toContain('member-connect')
 expect(searchHelp('update').some(x=>x.article.id==='member-updates')).toBe(true)
 expect(searchHelp('지문').every(x=>x.excerpt.includes('지문'))).toBe(true)
 expect(searchHelp('존재하지않는항목123')).toEqual([])
 expect(initialHelpTopic('personal')).toBe('getting-started');expect(initialHelpTopic('host')).toBe('host-start');expect(initialHelpTopic('member')).toBe('member-connect')
})
