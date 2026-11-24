import {expect,it} from 'vitest'
import {existsSync} from 'node:fs'
import {helpArticles,searchHelp,validateHelpContent} from '../../src/shared/help-content'
import {helpSectionIds,helpTopicIds,initialHelpTopic} from '../../src/shared/help'
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
 expect(initialHelpTopic('personal')).toBe('app-overview');expect(initialHelpTopic('host')).toBe('host-start');expect(initialHelpTopic('member')).toBe('member-connect')
})
it('opens settings directly at its controls within the common guide',()=>{
 expect(initialHelpTopic('host','settings')).toBe('settings')
})
it.each(helpSectionIds.filter(section=>section!=='settings'))('starts %s at the first article in its table of contents',section=>{
 expect(initialHelpTopic('host',section)).toBe(helpArticles.find(a=>a.menu===section)?.id)
})
it.each(['Space','Ctrl','프로젝트 추가','일정 추가','트레이','100%'])('documents core Planrail capability %s',query=>{
 expect(searchHelp(query).length).toBeGreaterThan(0)
})

it('opens PostRail at the request editor guide and finds instructions for numbered sends and authentication',()=>{
 expect(initialHelpTopic('personal','postrail')).toBe('postrail-requests')
 for(const query of ['회차별 결과','401','${index}']){
  expect(searchHelp(query).some(result=>result.article.menu==='postrail')).toBe(true)
 }
})

it('finds the device status guide, TermRail connection and macro results offline',()=>{
 expect(initialHelpTopic('personal','devicerail')).toBe('device-status')
 for (const [query,topic] of [['30초','device-status'],['임시 탭','device-ssh'],['표준 오류','device-macros']]) {
  expect(searchHelp(query).map(result=>result.article.id)).toContain(topic)
 }
})
