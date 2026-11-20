import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {useState} from 'react'
import {PostRailStore} from '../../src/main/postrail/store'
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {expect, it, vi} from 'vitest'
import type {PrEnv, PrLibrary, PrMutation, PrRequest} from '../../src/shared/postrail'
import {Sidebar} from '../../src/renderer/postrail/Sidebar'
import {EnvironmentManagerButton} from '../../src/renderer/postrail/EnvironmentDialog'

HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
HTMLDialogElement.prototype.close ??= function () { this.open = false }

const request: PrRequest = {id:'r', name:'장비 조회', groupId:'g', method:'POST', url:'${deviceUrl}/sensor',
  headers:{Accept:'application/json'}, body:'{"sample":"${index}"}', useAuth:true, timeoutMs:65000, favorite:true, nextIndex:'87'}
const environment: PrEnv = {id:'dev', name:'개발', variables:{deviceUrl:'https://dev.test'}, apiOrigin:'https://dev.test',
  loginUrl:'', loginHeaders:{}, loginBody:'', tokenPath:'data.token', tokenHeader:'Authorization', tokenPrefix:'Bearer ', hasPassword:true}
const library: PrLibrary = {groups:[{id:'g',name:'장비'},{id:'h',name:'기록'}], requests:[request], environments:[environment], environmentId:'dev'}
const click = (name: string) => fireEvent.click(screen.getByRole('button', {name}))
const menuItem = (name:string) => fireEvent.click(screen.getByRole('menuitem', {name}))
const change = (name:string, value:string) => fireEvent.change(screen.getByLabelText(name), {target:{value}})
const controller = () => ({library, mutate:vi.fn<(change:PrMutation)=>Promise<PrLibrary|null>>().mockResolvedValue(library),
  canRememberPassword:true, logout:vi.fn().mockResolvedValue(undefined)})

it('copies a saved snapshot to the focused group after the source changes, without touching the system clipboard', async () => {
  const postrail=controller(), onSelect=vi.fn()
  const {rerender}=render(<Sidebar postrail={postrail} selectedId="r" onSelect={onSelect}/>)
  fireEvent.keyDown(screen.getByRole('button',{name:'POST 장비 조회'}),{ctrlKey:true,key:'c'})
  const other={...request,id:'second',name:'장비 조회 복사본',groupId:'h'}
  const updated={...library, requests:[{...request,method:'GET' as const,body:'',favorite:false},other]}
  rerender(<Sidebar postrail={{...postrail,library:updated}} selectedId="r" onSelect={onSelect}/>)
  click('장비 조회 요청 메뉴')
  await act(async () => menuItem('복제'))
  expect(postrail.mutate).toHaveBeenCalledWith({type:'request.duplicate',id:'r',groupId:'g'})
  const copy={...request,id:'copy',name:'장비 조회 복사본 2',groupId:'h',favorite:false,nextIndex:'1'}
  postrail.mutate.mockResolvedValue({...updated,requests:[...updated.requests,copy]})
  fireEvent.keyDown(screen.getByRole('button',{name:'기록'}),{ctrlKey:true,key:'v'})
  expect(postrail.mutate).toHaveBeenLastCalledWith({type:'request.save',copyFilesFrom:'r',request:{...copy,id:''}})
  await waitFor(()=>expect(onSelect).toHaveBeenCalledWith('copy'))
})

it('creates a GET in the selected group and selects it only after storage succeeds', async () => {
  const postrail=controller(), onSelect=vi.fn()
  render(<Sidebar postrail={postrail} selectedId="r" onSelect={onSelect}/>)
  click('추가 메뉴'); menuItem('요청 추가')
  expect(screen.getByLabelText('그룹')).toHaveValue('g')
  change('요청 이름','상태'); change('URL','http://localhost/site/:id?q=${deviceUrl}')
  postrail.mutate.mockResolvedValueOnce(null)
  click('저장')
  await waitFor(()=>expect(screen.getByRole('button',{name:'저장'})).toBeEnabled())
  expect(onSelect).not.toHaveBeenCalled()
  postrail.mutate.mockResolvedValueOnce({...library, requests:[request,{...request,id:'new',name:'상태'}]})
  click('저장')
  expect(postrail.mutate).toHaveBeenLastCalledWith({type:'request.save',request:expect.objectContaining({
    id:'',groupId:'g',method:'GET',url:'http://localhost/site/:id?q=${deviceUrl}',name:'상태',nextIndex:'1',favorite:false,pathValues:{id:''},
    queryRows:[{enabled:true,raw:'q=${deviceUrl}',name:'q',value:'${deviceUrl}',encodeVariables:true}]})})
  await waitFor(()=>expect(onSelect).toHaveBeenCalledWith('new'))
})

it('keeps a group when its delete confirmation is dismissed and toggles the saved favorite', async () => {
  const postrail=controller()
  render(<Sidebar postrail={postrail} selectedId={null} onSelect={vi.fn()}/>)
  click('장비 그룹 메뉴'); menuItem('수정'); click('그룹 삭제')
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'})
  expect(postrail.mutate).not.toHaveBeenCalled()
  click('장비 조회 즐겨찾기')
  await waitFor(()=>expect(postrail.mutate).toHaveBeenCalledWith({type:'request.favorite',id:'r',favorite:false}))
})

it('adds and focuses a variable, blocks reserved or duplicate names, and saves password separately', async () => {
  const postrail=controller()
  render(<EnvironmentManagerButton postrail={postrail}/>)
  click('환경 관리'); click('변수 추가')
  const name=screen.getAllByLabelText('변수 이름').at(-1)!
  expect(name).toHaveFocus()
  for(const invalid of ['index','deviceUrl','password']){
    fireEvent.change(name,{target:{value:invalid}}); click('저장')
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(postrail.mutate).not.toHaveBeenCalled()
  }
  fireEvent.change(name,{target:{value:'site'}})
  fireEvent.change(screen.getAllByLabelText('변수 값')[1],{target:{value:'QA'}})
  fireEvent.click(screen.getByText('로그인 설정'))
  expect(screen.getByLabelText('비밀번호')).toHaveAttribute('type','password')
  change('비밀번호','test-password'); change('로그인 URL','https://login.test/auth')
  fireEvent.click(screen.getByLabelText('이 PC에 저장'))
  click('저장')
  expect(postrail.mutate).toHaveBeenCalledWith({type:'env.batch',saves:[{environment:{...environment,
    loginUrl:'https://login.test/auth', variables:{deviceUrl:'https://dev.test',site:'QA'}},password:'test-password',remember:true}],deletedIds:[]})
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})


it('creates the first environment and preserves existing credentials on later definition edits', async () => {
  const postrail=controller()
  const empty={...library,environments:[],environmentId:null}
  const view=render(<EnvironmentManagerButton postrail={{...postrail,library:empty}}/>)
  click('환경 관리')
  expect(screen.getByLabelText('환경 이름')).toHaveFocus()
  change('환경 이름','QA')
  click('저장')
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
  expect(postrail.mutate).toHaveBeenCalledWith({type:'env.batch',saves:[{environment:expect.objectContaining({id:'',name:'QA',hasPassword:false})}],deletedIds:[]})
  view.rerender(<EnvironmentManagerButton postrail={{...postrail,canRememberPassword:false}}/>)
  click('환경 관리')
  fireEvent.click(screen.getByText('로그인 설정'))
  expect(screen.getByLabelText('비밀번호')).toHaveValue('')
  change('비밀번호','session-only')
  expect(screen.getByLabelText('이 PC에 저장')).toBeDisabled()
  change('비밀번호','')
  change('토큰 수신 API 주소','https://new.test')
  click('저장')
  expect(postrail.mutate).toHaveBeenLastCalledWith({type:'env.batch',saves:[{environment:{...environment,apiOrigin:'https://new.test'}}],deletedIds:[]})
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())
})


it('commits sidebar edits, moves requests to 미분류 on group deletion and removes only the confirmed environment', async () => {
  const directory=mkdtempSync(join(tmpdir(),'postrail-library-ui-'))
  const vault={isEncryptionAvailable:()=>false,encryptString:()=>{throw Error()},decryptString:()=>{throw Error()}}
  const store=new PostRailStore(directory,vault)
  const submit=async (name='저장')=>{click(name); await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull())}
  function Workspace() {
    const [data,setData]=useState(()=>store.read())
    const [selectedId,onSelect]=useState<string|null>(null)
    const postrail={canRememberPassword:false,logout:async()=>{},library:data,mutate:async(cmd:PrMutation)=>{
      const committed=store.mutate(cmd)
      setData(committed)
      return committed
    }}
    return <><Sidebar postrail={postrail} selectedId={selectedId} onSelect={onSelect}/><EnvironmentManagerButton postrail={postrail}/></>
  }
  try {
    render(<Workspace/>)
    click('추가 메뉴'); menuItem('그룹 추가'); change('그룹 이름','테스트 그룹'); await submit()
    click('테스트 그룹 그룹 메뉴'); menuItem('요청 추가')
    change('요청 이름','상태 조회'); change('URL','https://example.test/health'); await submit()
    click('상태 조회 즐겨찾기')
    await waitFor(()=>expect(screen.getByRole('button',{name:'상태 조회 즐겨찾기'})).toHaveAttribute('aria-pressed','true'))
    click('상태 조회 요청 메뉴'); menuItem('수정'); change('요청 이름','상태 확인'); await submit()
    click('테스트 그룹 그룹 메뉴'); menuItem('삭제'); await submit('삭제')
    expect(screen.getByRole('button',{name:'미분류'})).toBeVisible()
    expect(store.read().requests[0]).toMatchObject({groupId:null,name:'상태 확인',favorite:true})
    click('환경 관리'); change('환경 이름','개발'); await submit()
    click('환경 관리'); click('환경 삭제'); click('취소')
    expect(store.read().environments.map(env=>env.name)).toEqual(['개발'])
    click('환경 삭제'); click('삭제')
    expect(store.read().environments).toHaveLength(1)
    await submit()
    expect(store.read().environments).toHaveLength(0)
    expect(screen.getByRole('button',{name:'상태 확인 즐겨찾기'})).toHaveAttribute('aria-pressed','true')
  } finally {
    store.close()
    rmSync(directory,{recursive:true,force:true})
  }
})

it('retains two environment drafts during selection and failed saves, and confirms discard by name', async () => {
  const postrail=controller()
  const qa={...environment,id:'qa',name:'QA'}
  render(<EnvironmentManagerButton postrail={{...postrail,library:{...library,environments:[environment,qa]}}}/>)
  click('환경 관리')
  change('환경 이름','개발 2')
  click('QA')
  change('환경 이름','QA 2')
  click('개발 2')
  expect(screen.getByLabelText('환경 이름')).toHaveValue('개발 2')
  expect(postrail.mutate).not.toHaveBeenCalled()
  postrail.mutate.mockResolvedValueOnce(null)
  click('저장')
  await waitFor(()=>expect(screen.getByRole('alert')).toBeVisible())
  expect(postrail.mutate).toHaveBeenCalledWith({type:'env.batch',saves:[
    {environment:{...environment,name:'개발 2'}},{environment:{...qa,name:'QA 2'}}],deletedIds:[]})
  click('닫기')
  expect(screen.getByRole('dialog')).toHaveTextContent('개발 2')
  expect(screen.getByRole('dialog')).toHaveTextContent('QA 2')
  click('계속 편집')
  expect(screen.getByLabelText('환경 이름')).toHaveValue('개발 2')
})

it('shows login configuration errors at the field, preserves an explicitly empty prefix and trailing spaces', async () => {
  const postrail=controller()
  render(<EnvironmentManagerButton postrail={postrail}/>)
  click('환경 관리'); click('로그인 설정')
  change('로그인 본문 (JSON)','{')
  click('저장')
  expect(screen.getByLabelText('로그인 본문 (JSON)')).toHaveAttribute('aria-invalid','true')
  expect(screen.getByRole('alert')).toHaveTextContent('JSON 객체')
  change('로그인 본문 (JSON)','{"team":"${missing}"}')
  expect(screen.getByRole('alert')).toHaveTextContent('등록되지 않은')
  change('로그인 본문 (JSON)','{"team":"${deviceUrl}"}')
  fireEvent.click(screen.getByText('고급 헤더 설정'))
  change('토큰 접두어','')
  postrail.mutate.mockResolvedValueOnce(null)
  click('저장')
  await waitFor(()=>expect(postrail.mutate).toHaveBeenCalledWith(expect.objectContaining({
    saves:[{environment:expect.objectContaining({tokenPrefix:''})}]})))
  change('토큰 접두어','Team  ')
  click('저장')
  await waitFor(()=>expect(postrail.mutate).toHaveBeenCalledWith(expect.objectContaining({
    saves:[{environment:expect.objectContaining({tokenPrefix:'Team  '})}]})))
})

it('discards a token immediately for the edited environment only, independently of definition drafts', async () => {
  const postrail=controller()
  const qa={...environment,id:'qa',name:'QA'}
  const data={...library,environments:[environment,qa]}
  const state={phase:'completed' as const,environmentName:'',environmentId:'',requestName:'',requestId:'',runId:'',total:'1',
    completed:'1',failed:'0',uncertain:'0',message:'',authenticatedEnvironmentIds:['dev','qa']}
  const view=render(<EnvironmentManagerButton postrail={{...postrail,library:data,run:state}}/>)
  click('환경 관리'); click('QA'); click('로그인 설정'); change('환경 이름','QA draft')
  click('저장된 토큰 비우기')
  expect(screen.getByRole('dialog')).toHaveTextContent('현재 회차 후 중지')
  click('취소')
  expect(postrail.logout).not.toHaveBeenCalled()
  click('저장된 토큰 비우기'); click('비우기')
  await waitFor(()=>expect(postrail.logout).toHaveBeenCalledWith('qa'))
  view.rerender(<EnvironmentManagerButton postrail={{...postrail,library:data,run:{...state,authenticatedEnvironmentIds:['dev']}}}/>)
  await waitFor(()=>expect(screen.queryByRole('button',{name:'저장된 토큰 비우기'})).toBeNull())
  click('개발')
  expect(screen.getByRole('button',{name:'저장된 토큰 비우기'})).toBeVisible()
  click('닫기');click('폐기')
  expect(postrail.mutate).not.toHaveBeenCalled()
})

it('updates saved path and query parameters when the URL changes in the request menu', async () => {
  const saved:PrRequest={...request,url:'https://example.test/:same/:removed?one=1',
    pathValues:{same:'kept',removed:'gone'},queryRows:[{enabled:true,name:'one',value:'1'},{enabled:false,name:'off',value:'two'}]}
  const postrail={...controller(),library:{...library,requests:[saved]}}
  render(<Sidebar postrail={postrail} selectedId={saved.id} onSelect={vi.fn()}/>)
  click('장비 조회 요청 메뉴'); menuItem('수정')
  change('URL','https://example.test/:same/:new/:constructor?other=2')
  await act(async ()=>click('저장'))
  expect(postrail.mutate).toHaveBeenCalledWith({type:'request.metadata',id:saved.id,address:{
    url:'https://example.test/:same/:new/:constructor?other=2',pathValues:{same:'kept',new:'',constructor:''},
    queryRows:[{enabled:true,name:'other',value:'2',raw:'other=2'},{enabled:false,name:'off',value:'two'}]}})
})

it('shows unknown URL references next to the metadata field and retains the literal template', () => {
  render(<Sidebar postrail={controller()} selectedId="r" onSelect={vi.fn()}/>)
  click('장비 조회 요청 메뉴'); menuItem('수정')
  change('URL','${OTHER}/read')
  const input=screen.getByRole('textbox',{name:'URL'})
  expect(input).toHaveValue('${OTHER}/read')
  expect(input).toHaveAccessibleDescription(/OTHER/)
  expect(screen.getByText('${OTHER}',{selector:'.pr-json-variable'})).toBeVisible()
})
