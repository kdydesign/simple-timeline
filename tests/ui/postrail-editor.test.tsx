import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import {expect, it, vi} from 'vitest'
import type {PrLibrary, PrRequest} from '../../src/shared/postrail'
import type {PrDetail, PrRunState} from '../../src/shared/postrail-run'
import type {PostRailController} from '../../src/renderer/postrail/usePostRail'
import {RequestEditor} from '../../src/renderer/postrail/RequestEditor'
import {ResponsePane, ResultsFooter} from '../../src/renderer/postrail/Results'

const first: PrRequest = {id:'a', name:'샘플', groupId:null, method:'POST', url:'${deviceUrl}/samples',
  body:'{"site":"${site}","name":"test_${index}"}', useAuth:false, timeoutMs:null, headers:{}, favorite:true,
  nextIndex:'9007199254740993'}
const second: PrRequest = {...first, id:'b', name:'조회', method:'GET'}
const library: PrLibrary = {requests:[first,second], groups:[], environmentId:'dev', environments:[
  {id:'dev', name:'개발', variables:{deviceUrl:'http://localhost:8080',site:'서울'}, apiOrigin:'',
    loginUrl:'',loginBody:'',loginHeaders:{},tokenPath:'',tokenHeader:'',tokenPrefix:'',hasPassword:false},
]}
function controller() {
  return {library, available:true, canRememberPassword:false, submitting:false, logout:vi.fn(), clearError:vi.fn(), run:null, error:'', start:vi.fn().mockResolvedValue(true),
    stop:vi.fn(), mutate:vi.fn().mockResolvedValue(library), refresh:vi.fn(), page:vi.fn(), detail:vi.fn()} satisfies PostRailController
}

it('retains draft text across GET and other requests, uses exact indices, and sends the edited snapshot', async () => {
  const c = controller()
  const props = {postrail:c, request:first}
  const app = render(<RequestEditor {...props}/>)
  const body = '{"label":"새 값 ${index}", "enabled":true, "missing":null}'
  fireEvent.change(screen.getByLabelText('JSON 요청 본문'), {target:{value:body}})
  expect(screen.getByText('${index}', {selector:'span.pr-json-variable'})).toBeVisible()
  fireEvent.change(screen.getByLabelText('HTTP 메서드'), {target:{value:'GET'}})
  expect(screen.getByRole('tab',{name:'JSON 본문'})).toBeDisabled()
  expect(screen.queryByLabelText('반복 보내기')).toBeNull()
  app.rerender(<RequestEditor {...props} request={second}/>)
  app.rerender(<RequestEditor {...props}/>)
  expect(screen.getByLabelText('HTTP 메서드')).toHaveValue('GET')
  fireEvent.change(screen.getByLabelText('HTTP 메서드'), {target:{value:'POST'}})
  expect(screen.getByLabelText('JSON 요청 본문')).toHaveValue(body)
  fireEvent.click(screen.getByLabelText('반복 보내기'))
  fireEvent.change(screen.getByLabelText('횟수'), {target:{value:'0'}})
  expect(screen.getByRole('button',{name:'보내기'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('횟수'), {target:{value:'3'}})
  expect(screen.getByText(/9007199254740993.*9007199254740995/)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'3회 보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledWith({...first,body}, 'dev', '3'))
})

it('requires valid headers and timeout and saves request-level settings without losing library metadata', async () => {
  const c = controller()
  render(<RequestEditor postrail={c} request={first}/>)
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  fireEvent.change(screen.getByLabelText('요청 헤더'),{target:{value:'X-Site: ${site}\nx-site: duplicate'}})
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  expect(screen.getByLabelText('요청 헤더')).toHaveFocus()
  expect(c.start).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('요청 헤더'),{target:{value:'X-Site: ${site}'}})
  fireEvent.click(screen.getByRole('tab',{name:'인증'}))
  fireEvent.click(screen.getByLabelText('환경 로그인 사용'))
  fireEvent.change(screen.getByLabelText('응답 대기 시간(초)'),{target:{value:'0'}})
  expect(screen.getByRole('button',{name:'변경 저장'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('응답 대기 시간(초)'),{target:{value:'12'}})
  fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
  await waitFor(()=>expect(c.mutate).toHaveBeenCalledWith({type:'request.save',
    request:{...first,headers:{'X-Site':'${site}'},useAuth:true,timeoutMs:12000}}))
})

const run: PrRunState = {phase:'completed',runId:'run1',requestId:'a',requestName:'샘플 실행',environmentId:'qa',
  environmentName:'QA',total:'102',completed:'102',failed:'1',uncertain:'1',message:'',authenticatedEnvironmentIds:[]}
const row: PrDetail = {iteration:'102',index:'999',outcome:'success',status:200,durationMs:24,message:'',
  body:'{"ok":true}',headers:{'Content-Type':'application/json'}}
it('reads only expanded log pages and accepts exact iteration selection while the drawer closes independently', async () => {
  const c = {...controller(),run}
  c.page.mockResolvedValue([row])
  const select = vi.fn()
  render(<ResultsFooter postrail={c} selected="102" onSelect={select} active environmentButton={<button>환경 관리</button>}/>)
  expect(c.page).not.toHaveBeenCalled()
  expect(screen.getByText(/실패 1건.*결과 확인 필요 1건/)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'회차별 결과'}))
  await waitFor(()=>expect(screen.getByLabelText('회차별 결과 로그')).toHaveValue('102회　성공　HTTP 200　인덱스 999'))
  expect(c.page).toHaveBeenCalledWith('100','run1')
  fireEvent.click(screen.getByRole('button',{name:'이전'}))
  await waitFor(()=>expect(c.page).toHaveBeenCalledWith('0','run1'))
  fireEvent.change(screen.getByLabelText('회차'),{target:{value:'103'}})
  fireEvent.click(screen.getByRole('button',{name:'응답 보기'}))
  expect(select).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('회차'),{target:{value:'1'}})
  fireEvent.click(screen.getByRole('button',{name:'응답 보기'}))
  expect(select).toHaveBeenCalledWith('1')
  fireEvent.keyDown(screen.getByLabelText('회차'),{key:'Escape'})
  expect(screen.queryByLabelText('회차별 결과 로그')).toBeNull()
})

it('discards stale detail reads and displays headers or the original body for the selected run only', async () => {
  const c = {...controller(),run}
  let respond!: (d:PrDetail)=>void
  c.detail.mockReturnValueOnce(new Promise<PrDetail>(resolve=>{respond=resolve}))
    .mockResolvedValueOnce({...row,iteration:'1',body:'{"first":true}'})
  const props = {postrail:c,active:true}
  const app = render(<ResponsePane {...props} selected="102"/>)
  app.rerender(<ResponsePane {...props} selected="1"/>)
  const response = within(screen.getByRole('region',{name:'응답'}))
  await waitFor(()=>expect(response.getByLabelText('응답 본문')).toHaveTextContent('{"first":true}'))
  await act(async()=>respond(row))
  expect(response.getByText('QA / 샘플 실행')).toBeVisible()
  expect(response.getByLabelText('응답 본문')).toHaveTextContent('{"first":true}')
  fireEvent.click(response.getByRole('tab',{name:'헤더'}))
  expect(response.getByLabelText('응답 헤더')).toHaveTextContent('Content-Type: application/json')
})

it('keeps other draft fields while a confirmed request popup URL change replaces the draft address', () => {
  const c = controller()
  const app = render(<RequestEditor postrail={c} request={first}/>)
  fireEvent.change(screen.getByLabelText('요청 URL'),{target:{value:'https://draft.test'}})
  fireEvent.change(screen.getByLabelText('JSON 요청 본문'),{target:{value:'{"edited":true}'}})
  app.rerender(<RequestEditor postrail={c} request={{...first,favorite:false}}/>)
  expect(screen.getByLabelText('요청 URL')).toHaveValue('https://draft.test')
  const updated = {...first,url:'https://saved.test'}
  app.rerender(<RequestEditor postrail={{...c,library:{...library,requests:[updated,second]}}} request={updated}/>)
  expect(screen.getByLabelText('요청 URL')).toHaveValue('https://saved.test')
  expect(screen.getByLabelText('JSON 요청 본문')).toHaveValue('{"edited":true}')
})

it('locates bad addresses, unknown template variables, and non-object JSON without sending', () => {
  const c = controller()
  render(<RequestEditor postrail={c} request={first}/>)
  const url = screen.getByLabelText('요청 URL')
  const send = screen.getByRole('button',{name:'보내기'})
  fireEvent.change(url,{target:{value:'ftp://host.test/a'}})
  fireEvent.click(send)
  expect(url).toHaveFocus()
  expect(url).toHaveAttribute('aria-invalid','true')
  expect(url).toHaveAccessibleDescription(/HTTP/)
  fireEvent.change(url,{target:{value:'${wrong}/samples'}})
  expect(url).toHaveAccessibleDescription(/wrong/)
  fireEvent.change(url,{target:{value:first.url}})
  fireEvent.change(screen.getByLabelText('JSON 요청 본문'),{target:{value:'[]'}})
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  fireEvent.click(send)
  const body=screen.getByLabelText('JSON 요청 본문')
  expect(body).toHaveFocus()
  expect(body).toHaveAccessibleDescription(/JSON 객체/)
  fireEvent.change(body,{target:{value:'{"name":"${missing}"}'}})
  expect(body).toHaveAccessibleDescription(/missing/)
  fireEvent.change(body,{target:{value:'{"name":"${index}"}'}})
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  fireEvent.change(screen.getByLabelText('요청 헤더'),{target:{value:'X-App: ${absent}'}})
  fireEvent.click(screen.getByRole('tab',{name:'인증'}))
  fireEvent.click(send)
  expect(screen.getByLabelText('요청 헤더')).toHaveFocus()
  expect(screen.getByLabelText('요청 헤더')).toHaveAccessibleDescription(/absent/)
  expect(c.start).not.toHaveBeenCalled()
})

it('reports dirty definitions across selection changes and explains how to create the first environment', () => {
  const c = {...controller(),library:{...library,environments:[],environmentId:null}}
  const onDirtyChange=vi.fn()
  const app=render(<RequestEditor postrail={c} request={first} onDirtyChange={onDirtyChange}/>)
  expect(screen.getByText(/환경 관리에서.*환경을 추가/)).toBeVisible()
  expect(screen.getByRole('button',{name:'보내기'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('요청 URL'),{target:{value:'https://edited.test'}})
  app.rerender(<RequestEditor postrail={c} request={second} onDirtyChange={onDirtyChange}/>)
  expect(onDirtyChange).toHaveBeenLastCalledWith(true)
  app.rerender(<RequestEditor postrail={c} request={first} onDirtyChange={onDirtyChange}/>)
  fireEvent.change(screen.getByLabelText('요청 URL'),{target:{value:first.url}})
  expect(onDirtyChange).toHaveBeenLastCalledWith(false)
})

it('shows whether the current environment has a login profile before sending', () => {
  const c = controller()
  const app = render(<RequestEditor postrail={c} request={first}/>)
  expect(screen.getByText('개발 · 로그인 미설정')).toBeVisible()
  const configured = {...library.environments[0],loginUrl:'https://example.test/login'}
  app.rerender(<RequestEditor postrail={{...c,library:{...library,environments:[configured]}}} request={first}/>)
  expect(screen.getByText('개발 · 로그인 필요')).toBeVisible()
})
