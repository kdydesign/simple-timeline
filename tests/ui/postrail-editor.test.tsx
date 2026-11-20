import {act, fireEvent, render, renderHook, screen, waitFor, within} from '@testing-library/react'
import {expect, it, vi} from 'vitest'
import type {PrLibrary, PrRequest} from '../../src/shared/postrail'
import type {PrDetail, PrRunState} from '../../src/shared/postrail-run'
import {usePostRail, type PostRailController} from '../../src/renderer/postrail/usePostRail'
import {urlWithQuery} from '../../src/shared/postrail-parameters'
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
    sendError:vi.fn(), invalidDraft:vi.fn(), consoleSince:vi.fn().mockResolvedValue([]), submittingRequestId:null,
    stop:vi.fn(), mutate:vi.fn().mockResolvedValue(library), refresh:vi.fn(), page:vi.fn(), detail:vi.fn()} satisfies PostRailController
}

it('retains draft text across GET and other requests, uses exact indices, and sends the edited snapshot', async () => {
  const c = controller()
  const props = {postrail:c, request:first}
  const app = render(<RequestEditor {...props}/>)
  const body = '{"label":"새 값 ${index}", "enabled":true, "missing":null}'
  fireEvent.change(screen.getByLabelText('JSON 요청 본문'), {target:{value:body}})
  expect(screen.getByText('${index}', {selector:'span.pr-json-variable'})).toBeVisible()
  fireEvent.keyDown(screen.getByRole('combobox',{name:'HTTP 메서드'}),{key:'ArrowDown'})
  fireEvent.click(screen.getByRole('option',{name:'GET'}))
  expect(screen.getByRole('tab',{name:'본문'})).toBeDisabled()
  expect(screen.queryByLabelText('반복 보내기')).toBeNull()
  app.rerender(<RequestEditor {...props} request={second}/>)
  app.rerender(<RequestEditor {...props}/>)
  expect(screen.getByLabelText('HTTP 메서드')).toHaveTextContent('GET')
  fireEvent.keyDown(screen.getByRole('combobox',{name:'HTTP 메서드'}),{key:'ArrowDown'})
  fireEvent.click(screen.getByRole('option',{name:'POST'}))
  expect(screen.getByLabelText('JSON 요청 본문')).toHaveValue(body)
  fireEvent.click(screen.getByLabelText('반복 보내기'))
  fireEvent.change(screen.getByLabelText('횟수'), {target:{value:'0'}})
  expect(screen.getByRole('button',{name:'보내기'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('횟수'), {target:{value:'3'}})
  expect(screen.getByText(/9007199254740993.*9007199254740995/)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'3회 보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledWith({...first,body,savedRepeatCount:'3'}, 'dev', '3'))
})

it('requires valid headers and timeout and saves request-level settings without losing library metadata', async () => {
  const c = controller()
  render(<RequestEditor postrail={c} request={first}/>)
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  fireEvent.click(screen.getByRole('button',{name:'raw'}))
  fireEvent.change(screen.getByLabelText('raw 요청 헤더'),{target:{value:'X-Site: ${site}\nx-site: duplicate'}})
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  expect(screen.getByLabelText('raw 요청 헤더')).toHaveFocus()
  expect(c.start).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('raw 요청 헤더'),{target:{value:'X-Site: ${site}'}})
  fireEvent.click(screen.getByRole('tab',{name:'인증'}))
  fireEvent.click(screen.getByRole('button',{name:'환경 로그인 사용'}))
  fireEvent.change(screen.getByLabelText('응답 대기 시간(초)'),{target:{value:'0'}})
  expect(screen.getByRole('button',{name:'변경 저장'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('응답 대기 시간(초)'),{target:{value:'12'}})
  fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
  await waitFor(()=>expect(c.mutate).toHaveBeenCalledWith({type:'request.content',baseUrl:first.url,
    request:{...first,headers:{'X-Site':'${site}'},headerRows:[{enabled:true,name:'X-Site',value:'${site}'}],useAuth:true,timeoutMs:12000}}))
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
  await waitFor(()=>expect(response.getByLabelText('응답 본문 편집')).toHaveValue('{\n  "first": true\n}'))
  await act(async()=>respond(row))
  expect(response.getByText('QA / 샘플 실행')).toBeVisible()
  expect(response.getByLabelText('응답 본문 편집')).toHaveValue('{\n  "first": true\n}')
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
  fireEvent.click(screen.getByRole('button',{name:'raw'}))
  fireEvent.change(screen.getByLabelText('raw 요청 헤더'),{target:{value:'X-App: ${absent}'}})
  fireEvent.click(screen.getByRole('tab',{name:'인증'}))
  fireEvent.click(send)
  expect(screen.getByLabelText('raw 요청 헤더')).toHaveFocus()
  expect(screen.getByLabelText('raw 요청 헤더')).toHaveAccessibleDescription(/absent/)
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

it('edits masked response drafts, preserves exact JSON tokens, and copies only the displayed body', async () => {
  const received=' {\r\n\t"b":9007199254740993, "b":1.00e+9,\r\n "s":"••••" }  '
  const text='{\n  "b": 9007199254740993,\n  "b": 1.00e+9,\n  "s": "••••"\n}'
  const changed='{"z":"\\u0061","q":[],"q":{}}'
  const formatted='{\n  "z": "\\u0061",\n  "q": [],\n  "q": {}\n}'
  const c = {...controller(),run}
  c.detail.mockResolvedValue({...row,body:received,message:'HTTP 200'})
  const copy=vi.fn().mockResolvedValue(undefined)
  const originalClipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard')
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}})
  try {
    const app=render(<ResponsePane postrail={c} active selected="1"/>)
    const field=await screen.findByRole('textbox',{name:'응답 본문 편집'})
    const draftMode=screen.getByRole('button',{name:'편집본',pressed:true})
    const originalMode=screen.getByRole('button',{name:'원문',pressed:false})
    expect(field).toHaveValue(text)
    expect(field).not.toHaveAttribute('readonly')
    expect(screen.getAllByText(/HTTP 200/)).toHaveLength(1)
    fireEvent.change(field,{target:{value:changed}})
    fireEvent.click(screen.getByRole('button',{name:'포맷 정렬'}))
    expect(field).toHaveValue(formatted)
    fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
    expect(screen.getByLabelText('응답 헤더')).toHaveTextContent('Content-Type: application/json')
    fireEvent.click(screen.getByRole('tab',{name:'본문'}))
    fireEvent.click(originalMode)
    expect(originalMode).toHaveAttribute('aria-pressed','true')
    expect(draftMode).toHaveAttribute('aria-pressed','false')
    fireEvent.click(originalMode)
    const original=screen.getByRole('textbox',{name:'응답 본문 원문'})
    // Native textarea values normalize line endings. Clipboard below checks the received CRLF.
    expect(original).toHaveValue(' {\n\t"b":9007199254740993, "b":1.00e+9,\n "s":"••••" }  ')
    expect(screen.getByRole('button',{name:'포맷 정렬'})).toBeDisabled()
    expect(original).toHaveAttribute('readonly')
    fireEvent.click(screen.getByRole('button',{name:'응답 본문 복사'}))
    await screen.findByText('복사됨')
    expect(copy).toHaveBeenLastCalledWith(received)
    fireEvent.click(draftMode)
    expect(draftMode).toHaveAttribute('aria-pressed','true')
    expect(originalMode).toHaveAttribute('aria-pressed','false')
    expect(screen.getByLabelText('응답 본문 편집')).toHaveValue(formatted)
    const broken=formatted.slice(0,-1)
    fireEvent.change(screen.getByLabelText('응답 본문 편집'),{target:{value:broken}})
    fireEvent.click(screen.getByRole('button',{name:'포맷 정렬'}))
    expect(screen.getByText(/JSON 문법/)).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'응답 본문 복사'}))
    await screen.findByText('복사됨')
    expect(copy).toHaveBeenLastCalledWith(broken)
    c.detail.mockResolvedValue({...row,body:'another [',headers:{}})
    app.rerender(<ResponsePane postrail={c} active selected="2"/>)
    await waitFor(()=>expect(screen.getByLabelText('응답 본문 편집')).toHaveValue('another ['))
  } finally {
    if(originalClipboard) Object.defineProperty(navigator,'clipboard',originalClipboard)
    else Reflect.deleteProperty(navigator,'clipboard')
  }
})

it('keeps the active response mode visible when original and edited text are identical',async()=>{
  const c={...controller(),run}
  const received='변경되지 않은 서버 응답'
  c.detail.mockResolvedValue({...row,body:received,headers:{'Content-Type':'text/plain'}})
  render(<ResponsePane postrail={c} active selected="1"/>)
  expect(await screen.findByLabelText('응답 본문 편집')).toHaveValue(received)
  const original=screen.getByRole('button',{name:'원문',pressed:false})
  const draft=screen.getByRole('button',{name:'편집본',pressed:true})
  fireEvent.click(original)
  expect(screen.getByLabelText('응답 본문 원문')).toHaveValue(received)
  expect(screen.getByLabelText('응답 본문 원문')).toHaveAttribute('readonly')
  expect(original).toHaveAttribute('aria-pressed','true')
  fireEvent.click(draft)
  expect(screen.getByLabelText('응답 본문 편집')).not.toHaveAttribute('readonly')
  expect(draft).toHaveAttribute('aria-pressed','true')
})

it('cycles literal matches on the current view without changing the edited body',async()=>{
  const c={...controller(),run}
  c.detail.mockResolvedValue({...row,body:'[a.b] [A.B] [axb]'})
  render(<ResponsePane postrail={c} active selected="1"/>)
  const body=await screen.findByLabelText('응답 본문 편집')
  const search=screen.getByRole('searchbox',{name:'응답 본문 검색'})
  fireEvent.change(search,{target:{value:'[a.b]'}})
  expect(screen.getByText('1/2')).toBeVisible()
  fireEvent.keyDown(search,{key:'Enter',shiftKey:true})
  expect(screen.getByText('2/2')).toBeVisible()
  fireEvent.keyDown(search,{key:'Enter'})
  expect(screen.getByText('1/2')).toBeVisible()
  fireEvent.change(body,{target:{value:'first [A.B]'}})
  expect(screen.getByText('1/1')).toBeVisible()
  expect(body).toHaveValue('first [A.B]')
  fireEvent.click(screen.getByRole('button',{name:'원문'}))
  expect(screen.getByText('1/2')).toBeVisible()
})

it('keeps empty and interrupted response details in the header and disables empty body tools',async()=>{
  const c={...controller(),run}
  c.detail.mockResolvedValue({...row,body:'',outcome:'uncertain',message:'HTTP 200 · 응답 본문 수신 중단 · 결과 확인 필요'})
  render(<ResponsePane postrail={c} active selected="1"/>)
  const status=await screen.findByText(/응답 본문 수신 중단/)
  expect(status).toHaveTextContent(/HTTP 200.*1회차.*24ms/)
  for(const name of ['포맷 정렬','원문','편집본','응답 본문 복사']) expect(screen.getByRole('button',{name})).toBeDisabled()
  expect(screen.getByRole('searchbox')).toBeDisabled()
  expect(screen.queryByLabelText('응답 본문 편집')).toBeNull()
})

it('keeps a deeply nested body usable when indentation would expand it beyond the format budget',async()=>{
  const c={...controller(),run}
  const nested='['.repeat(6000)+'0'+']'.repeat(6000)
  c.detail.mockResolvedValue({...row,body:nested})
  render(<ResponsePane postrail={c} active selected="1"/>)
  const editor=await screen.findByLabelText('응답 본문 편집')
  expect(editor).toHaveValue(nested)
  fireEvent.click(screen.getByRole('button',{name:'포맷 정렬'}))
  expect(screen.getByText(/정렬.*크기/)).toBeVisible()
  expect(editor).toHaveValue(nested)
})

it('opens the session console on demand, keeps the readers scroll position, and switches drawers', async () => {
  const c = {...controller(),run:{...run,consoleVersion:1}}
  c.page.mockResolvedValue([])
  c.consoleSince.mockResolvedValueOnce([{id:1,text:'ERROR · 로그인 실패',error:true}])
    .mockResolvedValueOnce([{id:2,text:'  <b>실패</b>\t',error:true,ending:'\r\n'},{id:3,text:'INFO · 요청 전송',error:false}])
  const props = {postrail:c, selected:'', onSelect:vi.fn(), active:true, environmentButton:null, requestId:'a'}
  const app = render(<ResultsFooter {...props}/>)
  expect(c.consoleSince).not.toHaveBeenCalled()
  app.rerender(<ResultsFooter {...props} openConsole={1}/>)
  const view = await screen.findByRole('region',{name:'console 로그'})
  await waitFor(()=>expect(view).toHaveTextContent('ERROR · 로그인 실패'))
  expect(screen.getByText('ERROR · 로그인 실패')).toHaveAttribute('data-error','true')
  Object.defineProperties(view, {scrollHeight:{value:800}, clientHeight:{value:100}})
  view.scrollTop = 42
  fireEvent.scroll(view)
  app.rerender(<ResultsFooter {...props} postrail={{...c,run:{...run,consoleVersion:2}}} openConsole={1}/>)
  await waitFor(()=>expect(view).toHaveTextContent('INFO · 요청 전송'))
  expect(view.textContent).toContain('  <b>실패</b>\t\r\nINFO · 요청 전송')
  expect(view.querySelector('b')).toBeNull()
  expect(c.consoleSince).toHaveBeenLastCalledWith(1)
  expect(view.scrollTop).toBe(42)
  fireEvent.click(screen.getByRole('button',{name:'회차별 결과'}))
  expect(screen.queryByRole('region',{name:'console 로그'})).toBeNull()
  expect(screen.getByLabelText('회차별 결과 로그')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'console'}))
  expect(screen.queryByLabelText('회차별 결과 로그')).toBeNull()
  fireEvent.keyDown(document,{key:'Escape'})
  expect(screen.getByRole('button',{name:'console'})).toHaveFocus()
})

it('restores disabled headers after raw edits and shares one Content-Type across views',async()=>{
  const c=controller()
  const request={...first,headers:{'X-First':'off','X-Last':'on'}}
  render(<RequestEditor postrail={c} request={request}/>)
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  fireEvent.click(screen.getByRole('checkbox',{name:'헤더 1행 사용'}))
  fireEvent.click(screen.getByRole('button',{name:'raw'}))
  const raw=screen.getByRole('textbox',{name:'raw 요청 헤더'})
  expect(raw).toHaveValue('X-Last: on')
  fireEvent.change(raw,{target:{value:'X-Last: on\nX-Note: a:b\nx-note: twice'}})
  expect(screen.getByRole('button',{name:'Key / Value'})).toBeDisabled()
  expect(raw).toHaveAccessibleDescription(/3행/)
  fireEvent.change(raw,{target:{value:'X-Last: on\nX-Note: a:b'}})
  fireEvent.click(screen.getByRole('button',{name:'Key / Value'}))
  expect(screen.getByRole('checkbox',{name:'헤더 1행 사용'})).not.toBeChecked()
  expect(screen.getByRole('textbox',{name:'헤더 3행 값'})).toHaveValue('a:b')
  fireEvent.click(screen.getByRole('tab',{name:'본문'}))
  fireEvent.change(screen.getByLabelText('Content-Type'),{target:{value:'application/vnd.team+json'}})
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  expect(screen.getByRole('textbox',{name:'헤더 4행 값'})).toHaveValue('application/vnd.team+json')
  fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
  await waitFor(()=>expect(c.mutate).toHaveBeenCalledWith({type:'request.content',baseUrl:first.url,request:expect.objectContaining({
    headers:{'X-Last':'on','X-Note':'a:b','Content-Type':'application/vnd.team+json'},
    headerRows:expect.arrayContaining([{enabled:false,name:'X-First',value:'off'}]),
  })}))
})

it('keeps path bindings, raw encodings and disabled rows while editing a query from both views',async()=>{
  const c=controller()
  const request={...first,url:'${deviceUrl}/:id?k=%2f&k=two&empty='}
  render(<RequestEditor postrail={c} request={request}/>)
  fireEvent.click(screen.getByRole('tab',{name:'파라미터'}))
  expect(screen.getByLabelText('쿼리 1행 값')).toHaveValue('/')
  fireEvent.click(screen.getByLabelText('쿼리 2행 사용'))
  fireEvent.change(screen.getByLabelText('쿼리 3행 값'),{target:{value:'A&B 한글+'}})
  const url=screen.getByLabelText('요청 URL')
  expect(url).toHaveValue('${deviceUrl}/:id?k=%2f&empty=A%26B%20%ED%95%9C%EA%B8%80%2B')
  fireEvent.change(url,{target:{value:(url as HTMLInputElement).value+'&new=1'}})
  expect(screen.getByLabelText('쿼리 2행 사용')).not.toBeChecked()
  expect(screen.getByLabelText('쿼리 4행 이름')).toHaveValue('new')
  fireEvent.click(screen.getByRole('button',{name:'경로'}))
  fireEvent.change(screen.getByLabelText('id 경로 값'),{target:{value:'${site}/a'}})
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledWith(expect.objectContaining({
    pathValues:{id:'${site}/a'},queryRows:expect.arrayContaining([{name:'k',value:'two',raw:'k=two',enabled:false}])
  }),'dev','1'))
})

it('restores each POST mode draft and saves repeat eligibility only through 변경 저장',async()=>{
  const c=controller()
  render(<RequestEditor postrail={c} request={first}/>)
  const mode=screen.getByRole('combobox',{name:'본문 방식'})
  fireEvent.change(mode,{target:{value:'raw'}})
  fireEvent.change(screen.getByLabelText('raw 요청 본문'),{target:{value:'<city>${site}</city>'}})
  expect(screen.queryByText(/인덱스 900/)).toBeNull()
  fireEvent.change(mode,{target:{value:'urlencoded'}})
  fireEvent.click(screen.getByRole('button',{name:'폼 추가'}))
  fireEvent.change(screen.getByLabelText('폼 1행 이름'),{target:{value:'title'}})
  fireEvent.change(screen.getByLabelText('폼 1행 값'),{target:{value:'A&B'}})
  fireEvent.change(mode,{target:{value:'raw'}})
  expect(screen.getByLabelText('raw 요청 본문')).toHaveValue('<city>${site}</city>')
  fireEvent.click(screen.getByLabelText('반복 보내기'))
  fireEvent.change(screen.getByLabelText('횟수'),{target:{value:'3'}})
  fireEvent.click(screen.getByRole('button',{name:'3회 보내기'}))
  expect(c.mutate).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
  await waitFor(()=>expect(c.mutate).toHaveBeenCalledWith({type:'request.content',baseUrl:first.url,request:expect.objectContaining({
    savedRepeatCount:'3',body:first.body,bodyMode:'raw',rawBody:'<city>${site}</city>',formRows:[{enabled:true,name:'title',value:'A&B'}]
  })}))
})

it('distinguishes the request auth choice and opens environment setup and send diagnostics',async()=>{
  const c=controller()
  c.sendError.mockReturnValue({message:'요청 주소가 환경에 지정한 토큰 수신 API 주소와 일치하지 않습니다.',preflight:true})
  const openEnvironment=vi.fn(),openConsole=vi.fn()
  render(<RequestEditor postrail={c} request={first} onOpenEnvironment={openEnvironment} onOpenConsole={openConsole}/>)
  const indicator=screen.getByRole('button',{name:'전송 오류 · console 열기'})
  expect(indicator).toHaveAccessibleDescription(/토큰 수신 API 주소/)
  act(()=>indicator.focus())
  const tooltip=await screen.findByRole('tooltip')
  expect(tooltip).toHaveTextContent(/토큰 수신 API 주소/)
  expect(indicator.closest('.pr-compose')).not.toContainElement(tooltip)
  fireEvent.keyDown(indicator,{key:'Escape'})
  await waitFor(()=>expect(screen.queryByRole('tooltip')).toBeNull())
  fireEvent.pointerMove(indicator,{pointerType:'mouse'})
  expect(await screen.findByRole('tooltip')).toHaveTextContent(/토큰 수신 API 주소/)
  fireEvent.click(indicator)
  expect(openConsole).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button',{name:'인증 없음'}))
  fireEvent.click(screen.getByRole('button',{name:'환경 로그인 사용'}))
  expect(screen.getByText(/환경 로그인에 필요한 항목/)).toHaveTextContent('로그인 URL')
  fireEvent.click(screen.getByRole('button',{name:'환경 관리 열기'}))
  expect(openEnvironment).toHaveBeenCalledOnce()
})

it('selects multipart and binary files through the native request-scoped picker and stores only references',async()=>{
  const c=controller()
  const chooseFile=vi.fn().mockResolvedValueOnce({id:'f1',name:'사진.png'}).mockResolvedValueOnce({id:'f2',name:'사진.png'})
  const original=window.postRail
  Object.defineProperty(window,'postRail',{configurable:true,writable:true,value:{chooseFile}})
  try {
    render(<RequestEditor postrail={c} request={first}/>)
    const mode=screen.getByLabelText('본문 방식')
    fireEvent.change(mode,{target:{value:'multipart'}})
    fireEvent.click(screen.getByRole('button',{name:'파트 추가'}))
    fireEvent.change(screen.getByLabelText('파트 1행 이름'),{target:{value:'images'}})
    fireEvent.change(screen.getByLabelText('파트 1행 유형'),{target:{value:'file'}})
    fireEvent.click(screen.getByRole('button',{name:'파트 1행 파일 선택'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'파트 1행 파일 선택'})).toHaveTextContent('사진.png'))
    fireEvent.change(screen.getByLabelText('파트 1행 MIME'),{target:{value:'image/png'}})
    fireEvent.change(mode,{target:{value:'binary'}})
    fireEvent.click(screen.getByRole('button',{name:'binary 파일 선택'}))
    await waitFor(()=>expect(screen.getByRole('button',{name:'binary 파일 선택'})).toHaveTextContent('사진.png'))
    fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
    expect(chooseFile.mock.calls).toEqual([[first.id,[]],[first.id,['f1']]])
    expect(c.mutate).toHaveBeenCalledWith({type:'request.content',baseUrl:first.url,request:expect.objectContaining({bodyMode:'binary',binaryFile:{id:'f2',name:'사진.png'},
      parts:[{name:'images',enabled:true,value:'',kind:'file',file:{id:'f1',name:'사진.png'},mime:'image/png'}]})})
  } finally {window.postRail=original}
})

it('preserves component substitution and duplicate occurrences when the URL reorders existing query fields',async()=>{
  const c=controller()
  const legacy={enabled:true,name:'q',value:'${term}',raw:'q=${term}'}
  const structured={enabled:true,name:'q',value:'${term}'}
  const kept={enabled:false,name:'off',value:'123'}
  const request={...first,url:'${deviceUrl}?x=1&q=${term}&q=${term}',
    queryRows:[{enabled:true,name:'x',value:'1',raw:'x=1'},legacy,kept,structured]}
  const env={...library.environments[0],variables:{...library.environments[0].variables,term:'A&B+'}}
  render(<RequestEditor postrail={{...c,library:{...library,environments:[env]}}} request={request}/>)
  fireEvent.change(screen.getByLabelText('요청 URL'),{target:{value:'${deviceUrl}?q=${term}&q=${term}&new=n&x=1'}})
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledOnce())
  expect(c.start.mock.calls[0][0].queryRows).toEqual([
    legacy,structured,kept,{enabled:true,name:'new',value:'n',raw:'new=n'},request.queryRows[0]
  ])
})

it('retains a scoped safe diagnosis while the send IPC is unavailable and keeps native cancellation quiet', async () => {
  const start = vi.fn().mockRejectedValueOnce(Error('PRIVATE_QUERY')).mockResolvedValueOnce(null).mockResolvedValueOnce(run)
  const invalidDraft = vi.fn().mockRejectedValue(Error('PRIVATE_PATH'))
  vi.stubGlobal('postRail',{start,invalidDraft,state:vi.fn().mockResolvedValue(run),read:vi.fn().mockResolvedValue(library)})
  try {
    const {result} = renderHook(()=>usePostRail(false))
    await act(async()=>{await result.current.start(first,'dev','1')})
    expect(result.current.sendError(first.id,'dev')).toMatchObject({message:'PostRail에서 전송 요청의 처리 여부를 확인할 수 없습니다.',preflight:false})
    expect(result.current.sendError(second.id,'dev')).toBeUndefined()
    expect(result.current.sendError(first.id,'qa')).toBeUndefined()
    expect(result.current.error).toBe('')
    await act(async()=>{await result.current.start(second,'dev','1')})
    expect(invalidDraft).toHaveBeenCalledTimes(1)
    await act(async()=>{await result.current.start(first,'dev','1')})
    expect(result.current.sendError(first.id,'dev')).toBeUndefined()
  } finally {vi.unstubAllGlobals()}
})

it('encodes substitutions in newly typed query fields while retaining legacy substitutions and literal percent escapes',async()=>{
  const c=controller()
  const env={...library.environments[0],variables:{...library.environments[0].variables,term:'A&B+',legacy:'a&b=c'}}
  const request={...second,url:'https://example.test/api?old=${legacy}'}
  render(<RequestEditor postrail={{...c,library:{...library,environments:[env]}}} request={request}/>)
  const url='https://example.test/api?new=%24%7Bliteral%7D-${term}&old=${legacy}'
  fireEvent.change(screen.getByLabelText('요청 URL'),{target:{value:url}})
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledOnce())
  const sent:PrRequest=c.start.mock.calls[0][0]
  expect(sent.url).toBe(url)
  expect(sent.queryRows).toBeDefined()
  const target=urlWithQuery(sent.url,sent.queryRows!,value=>value.replace(/\$\{([^{}]+)\}/g,(_,name:string)=>(env.variables as Record<string,string>)[name]))
  expect(target).toBe('https://example.test/api?new=%24%7Bliteral%7D-A%26B%2B&old=a&b=c')
})

it('opens headers and query parameters with editable entry rows without modifying the request',async()=>{
  const c=controller(),dirty=vi.fn()
  render(<RequestEditor postrail={c} request={second} onDirtyChange={dirty}/>)
  const name=(table:string,n:number)=>screen.getByRole('textbox',{name:table+' '+n+'행 이름'})
  expect(name('헤더',1)).toHaveValue('')
  fireEvent.click(screen.getByRole('button',{name:'헤더 추가'}))
  expect(name('헤더',1)).toHaveFocus()
  fireEvent.click(screen.getByRole('tab',{name:'파라미터'}))
  expect(name('쿼리',1)).toHaveValue('')
  fireEvent.click(screen.getByRole('button',{name:'쿼리 추가'}))
  expect(name('쿼리',1)).toHaveFocus()
  expect(screen.queryByRole('button',{name:'변경 저장'})).toBeNull()
  expect(dirty).toHaveBeenLastCalledWith(false)
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledWith(second,'dev','1'))

  fireEvent.change(name('쿼리',1),{target:{value:'search'}})
  fireEvent.change(screen.getByLabelText('쿼리 1행 값'),{target:{value:'A&B'}})
  expect(name('쿼리',2)).toHaveValue('')
  expect(screen.getByLabelText('요청 URL')).toHaveValue(second.url+'?search=A%26B')
  fireEvent.click(screen.getByRole('tab',{name:'헤더'}))
  fireEvent.change(screen.getByLabelText('헤더 1행 값'),{target:{value:'sample'}})
  fireEvent.change(name('헤더',1),{target:{value:'X-Note'}})
  expect(name('헤더',2)).toHaveValue('')
  fireEvent.click(screen.getByRole('button',{name:'헤더 추가'}))
  expect(name('헤더',2)).toHaveFocus()
  fireEvent.click(screen.getByRole('button',{name:'raw'}))
  expect(screen.getByLabelText('raw 요청 헤더')).toHaveValue('X-Note: sample')
  fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
  await waitFor(()=>expect(c.mutate).toHaveBeenCalledWith({type:'request.content',baseUrl:second.url,request:{
    ...second,url:second.url+'?search=A%26B',queryRows:[{enabled:true,name:'search',value:'A&B'}],
    headers:{'X-Note':'sample'},headerRows:[{enabled:true,name:'X-Note',value:'sample'}],
  }}))
})

it('returns the last cleared header or query to an untouched entry row',async()=>{
  const c=controller(),dirty=vi.fn()
  render(<RequestEditor postrail={c} request={second} onDirtyChange={dirty}/>)
  const header=screen.getByLabelText('헤더 1행 이름')
  fireEvent.change(header,{target:{value:'X-Remove'}})
  fireEvent.change(header,{target:{value:''}})
  fireEvent.click(screen.getByRole('tab',{name:'파라미터'}))
  const query=screen.getByLabelText('쿼리 1행 값')
  fireEvent.change(query,{target:{value:'test'}})
  fireEvent.change(query,{target:{value:''}})
  expect(screen.queryByLabelText('쿼리 2행 이름')).toBeNull()
  expect(screen.getByLabelText('요청 URL')).toHaveValue(second.url)
  expect(dirty).toHaveBeenLastCalledWith(false)
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  await waitFor(()=>expect(c.start).toHaveBeenCalledWith(second,'dev','1'))
})

it.each(['쿼리','헤더'])('retains position and cursor while renaming a temporarily empty %s row',async table=>{
  const c=controller()
  const request={...second,url:second.url+'?a=&b=2',headers:{a:'',b:'2'}}
  render(<RequestEditor postrail={c} request={request}/>)
  if (table==='쿼리') fireEvent.click(screen.getByRole('tab',{name:'파라미터'}))
  const firstName=screen.getByLabelText(table+' 1행 이름')
  firstName.focus()
  fireEvent.change(firstName,{target:{value:''}})
  expect(firstName).toHaveFocus()
  expect(firstName).toHaveValue('')
  expect(screen.getByLabelText(table+' 2행 이름')).toHaveValue('b')
  fireEvent.click(screen.getByRole('button',{name:'보내기'}))
  const sent=c.start.mock.calls[0][0] as PrRequest
  if (table==='쿼리') expect(sent.url).toBe(second.url+'?b=2')
  else expect(sent.headers).toEqual({b:'2'})
  fireEvent.change(firstName,{target:{value:'c'}})
  expect(screen.getByLabelText(table+' 1행 이름')).toHaveValue('c')
  expect(screen.getByLabelText(table+' 2행 이름')).toHaveValue('b')
  fireEvent.click(screen.getByRole('button',{name:'변경 저장'}))
  await waitFor(()=>expect(c.mutate).toHaveBeenCalledOnce())
  const saved=c.mutate.mock.calls[0][0].request as PrRequest
  if (table==='쿼리') expect(saved.url).toBe(second.url+'?c=&b=2')
  else expect(Object.keys(saved.headers)).toEqual(['c','b'])
})
