import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PostRailStore} from '../../src/main/postrail/store'
import {RequestEditor} from '../../src/renderer/postrail/RequestEditor'
import {usePostRail} from '../../src/renderer/postrail/usePostRail'
import {useState} from 'react'
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {expect, it, vi} from 'vitest'
import type {PrEnv, PrLibrary, PrMutation, PrRequest} from '../../src/shared/postrail'
import {Sidebar} from '../../src/renderer/postrail/Sidebar'

const request:PrRequest = {id:'one', groupId:'a', name:'Fetch Notes', method:'GET', url:'https://example.test/hidden',
  body:'', headers:{}, useAuth:false, timeoutMs:null, favorite:true, nextIndex:'42'}
const env:PrEnv = {id:'dev', name:'개발', variables:{}, loginUrl:'', loginHeaders:{}, loginBody:'',
  tokenPath:'', tokenHeader:'', tokenPrefix:'', apiOrigin:'', hasPassword:false}
const library:PrLibrary = {groups:[{id:'a',name:'원본'},{id:'b',name:'목적지'}], requests:[request],
  environments:[env,{...env,id:'qa',name:'QA'}], environmentId:'dev'}
const button = (name:string) => screen.getByRole('button',{name})

it('temporarily expands matching request names and restores collapsed groups when the filter clears', () => {
  const select = vi.fn()
  render(<Sidebar postrail={{library,mutate:vi.fn()}} selectedId={request.id} onSelect={select}/>)
  fireEvent.click(button('원본'))
  const search = screen.getByRole('searchbox',{name:'요청 이름 검색'})
  fireEvent.change(search,{target:{value:'tCh nO'}})
  expect(button('GET Fetch Notes')).toHaveAttribute('aria-current','true')
  expect(screen.queryByRole('button',{name:'목적지'})).toBeNull()
  for (const value of ['원본','hidden','GET']) {
    fireEvent.change(search,{target:{value}})
    expect(screen.queryByRole('button',{name:'GET Fetch Notes'})).toBeNull()
    expect(button('추가 메뉴')).toBeEnabled()
  }
  fireEvent.change(search,{target:{value:''}})
  expect(button('원본')).toHaveAttribute('aria-expanded','false')
  expect(select).not.toHaveBeenCalled()
})

it('selects a run environment with the project picker keyboard controls', async () => {
  const user = userEvent.setup(), mutate = vi.fn().mockResolvedValue(library)
  render(<Sidebar postrail={{library,mutate}} selectedId={request.id} onSelect={vi.fn()}/>)
  const trigger = screen.getByRole('combobox',{name:'실행 환경 선택'})
  trigger.focus()
  await user.keyboard('{Enter}{ArrowDown}{Enter}')
  await waitFor(()=>expect(mutate).toHaveBeenCalledWith({type:'env.select',id:'qa'}))
})

async function dropRequest(rowName:string, groupName:string) {
  const data = new Map<string,string>()
  const dataTransfer = {setData:(key:string,v:string)=>data.set(key,v), getData:(key:string)=>data.get(key)??''}
  fireEvent.dragStart(button(rowName),{dataTransfer})
  fireEvent.dragOver(button(groupName),{dataTransfer})
  await act(async ()=>{fireEvent.drop(button(groupName),{dataTransfer})})
}

it.each(['GET','POST','DELETE'] as const)('moves a %s request only after commit and accepts an empty ungrouped target', async method => {
  const select = vi.fn()
  let rejectMove = true
  function Workspace() {
    const [data,setData] = useState({...library, requests:[{...request,method}]})
    async function mutate(command:PrMutation) {
      if (command.type !== 'request.move' || rejectMove) return null
      const next = {...data, requests:data.requests.map(r=>({...r,groupId:command.groupId}))}
      setData(next)
      return next
    }
    return <Sidebar postrail={{library:data,mutate}} selectedId={request.id} onSelect={select}/>
  }
  render(<Workspace/>)
  const rowName = method+' Fetch Notes'
  fireEvent.click(button('목적지'))
  await dropRequest(rowName,'목적지')
  expect(select).not.toHaveBeenCalled()
  expect(within(button('원본').closest('section')!).getByRole('button',{name:rowName})).toBeVisible()
  rejectMove = false
  await dropRequest(rowName,'목적지')
  expect(select).toHaveBeenCalledWith('one')
  expect(within(button('목적지').closest('section')!).getByRole('button',{name:rowName})).toHaveFocus()
  await dropRequest(rowName,'미분류')
  expect(within(button('미분류').closest('section')!).getByRole('button',{name:rowName})).toBeVisible()
})

it('retains an unsaved request body through filtering and a committed group move', async () => {
  const dir = mkdtempSync(join(tmpdir(),'postrail-dirty-move-'))
  const store = new PostRailStore(dir,{isEncryptionAvailable:()=>false,
    encryptString:()=>{throw Error()},decryptString:()=>{throw Error()}})
  try {
    const group = store.mutate({type:'group.save',name:'그룹'}).groups[0]
    const saved = store.mutate({type:'request.save',request:{...request,id:'',groupId:null,method:'POST',body:'{}'}}).requests[0]
    function Workspace() {
      const controller = usePostRail(false)
      const [data,setData] = useState(()=>store.read())
      const [id,onSelect] = useState(saved.id)
      const postrail = {...controller,library:data,mutate:async (cmd:PrMutation) => {
        const next = store.mutate(cmd)
        setData(next)
        return next
      }}
      return <><Sidebar postrail={postrail} selectedId={id} onSelect={onSelect}/>
        <RequestEditor postrail={postrail} request={data.requests.find(r=>r.id===id)!}/></>
    }
    render(<Workspace/>)
    const draft = '{"draft":true}'
    fireEvent.change(screen.getByLabelText('JSON 요청 본문'),{target:{value:draft}})
    const search = screen.getByRole('searchbox',{name:'요청 이름 검색'})
    fireEvent.change(search,{target:{value:'unmatched'}})
    expect(screen.getByLabelText('JSON 요청 본문')).toHaveValue(draft)
    fireEvent.change(search,{target:{value:''}})
    await dropRequest('POST Fetch Notes','그룹')
    expect(store.read().requests).toEqual([{...saved,groupId:group.id}])
    expect(screen.getByLabelText('JSON 요청 본문')).toHaveValue(draft)
    expect(button('변경 저장')).toBeEnabled()
  } finally {
    store.close()
    rmSync(dir,{recursive:true,force:true})
  }
})
