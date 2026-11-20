import {useLayoutEffect, useRef, useState} from 'react'
import type {PrEnv} from '../../shared/postrail'
import {Icon} from '../components/Icon'
import {PostRailPopup} from './PostRailPopup'
import type {PostRailController} from './usePostRail'

type EnvironmentAccess = Pick<PostRailController, 'library' | 'mutate' | 'logout' | 'canRememberPassword'>
const blank: PrEnv = {id:'', name:'', variables:{}, apiOrigin:'', loginUrl:'', loginHeaders:{}, loginBody:'',
  tokenPath:'data.token', tokenHeader:'Authorization', tokenPrefix:'Bearer ', hasPassword:false}

export function EnvironmentManagerButton({postrail}: {postrail:EnvironmentAccess}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return <>
    <button type="button" aria-haspopup="dialog" className="pr-env-manager" disabled={!postrail.library}
      onClick={event => setAnchor(event.currentTarget)}><Icon name="settings"/>환경 관리</button>
    {anchor && <EnvironmentDialog postrail={postrail} anchor={anchor} onClose={() => setAnchor(null)}/>}
  </>
}

export function EnvironmentDialog({postrail, anchor, onClose}: {
  postrail:EnvironmentAccess
  anchor:HTMLElement
  onClose:()=>void
}) {
  const library = postrail.library
  const [creating, setCreating] = useState(false)
  const current = library?.environments.find(item => item.id === library.environmentId)
  const env = creating ? blank : current ?? blank
  return <EnvironmentForm key={env.id} postrail={postrail} anchor={anchor} onClose={onClose}
    original={env} create={() => setCreating(true)}/>
}

function EnvironmentForm({postrail, anchor, onClose, original, create}: {
  postrail:EnvironmentAccess
  anchor:HTMLElement
  onClose:()=>void
  original:PrEnv
  create:()=>void
}) {
  const [draft, setDraft] = useState(original)
  const [headersText, setHeadersText] = useState(JSON.stringify(original.loginHeaders,null,2))
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [clearPassword, setClearPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [rows, setRows] = useState(() => Object.entries(original.variables).map(([name,value],id) => ({id,name,value})))
  const nextRow = useRef(rows.length)
  const focusRow = useRef<number | 'add' | null>(null)
  const variableInputs = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => {
    if (focusRow.current === 'add') addButton.current?.focus()
    else if (focusRow.current !== null) variableInputs.current?.querySelector<HTMLInputElement>(`input[data-row="${focusRow.current}"]`)?.focus()
    focusRow.current = null
  }, [rows])

  async function save() {
    if (busy) return
    const names = rows.map(row => row.name.trim())
    if (names.some(name => !name || name === 'index' || name === 'password') || new Set(names).size !== names.length) {
      setError('각 변수에 서로 다른 이름을 입력하세요. index와 password는 예약 이름입니다.')
      return
    }
    let headers: unknown
    try {headers = JSON.parse(headersText.trim() || '{}')} catch {headers = null}
    if (!headers || typeof headers !== 'object' || Array.isArray(headers) ||
        Object.entries(headers).some(([key,value]) => !key.trim() || typeof value !== 'string')) {
      setError('로그인 헤더를 이름과 문자열 값으로 된 JSON 객체로 입력하세요.')
      return
    }
    const environment:PrEnv = {...draft, name:draft.name.trim(), apiOrigin:draft.apiOrigin.trim(), loginUrl:draft.loginUrl.trim(),
      loginHeaders:Object.fromEntries(Object.entries(headers)), variables:Object.fromEntries(rows.map((row,i) => [names[i],row.value]))}
    if (!environment.name) {setError('환경 이름을 입력하세요.'); return}
    setBusy(true)
    const result = await postrail.mutate({type:'env.save', environment,
      ...(clearPassword ? {password:'',remember:false} : password ? {password,remember} : {})})
    setBusy(false)
    if (result) onClose()
    else setError('환경을 저장하지 못했습니다. 입력값과 비밀번호 저장 설정을 확인하세요.')
  }
  const field = (key:'name'|'apiOrigin'|'loginUrl'|'loginBody'|'tokenPath'|'tokenHeader'|'tokenPrefix',label:string,placeholder?:string) =>
    <label className="pr-field">{label}{key === 'loginBody' ?
      <textarea rows={3} value={draft[key]} spellCheck={false} placeholder={placeholder} onChange={event => setDraft({...draft,[key]:event.target.value})}/> :
      <input value={draft[key]} required={key === 'name'} placeholder={placeholder} spellCheck={false}
        data-initial-focus={key === 'name' && !original.id || undefined} onChange={event => setDraft({...draft,[key]:event.target.value})}/>}</label>

  if (deleting) return <PostRailPopup title="환경 삭제" anchor={anchor} busy={busy} onClose={onClose}>
    <p>‘{original.name}’ 환경과 이 환경의 로그인 설정을 삭제할까요?</p>
    {error && <p role="alert">{error}</p>}
    <div className="editor-actions">
      <button type="button" data-initial-focus disabled={busy} onClick={onClose}>닫기</button>
      <button type="button" className="danger" disabled={busy} onClick={async () => {
        setBusy(true)
        const result = await postrail.mutate({type:'env.delete',id:original.id})
        setBusy(false)
        if (result) onClose()
        else setError('환경을 삭제하지 못했습니다.')
      }}>삭제</button>
    </div>
  </PostRailPopup>

  return <PostRailPopup anchor={anchor} title={original.id ? '환경 관리 · ' + original.name : '환경 추가'} onClose={onClose} busy={busy}>
    <form onSubmit={event => {event.preventDefault(); void save()}}>
      <fieldset disabled={busy}>
        {!original.id && field('name','환경 이름')}
        <h3>변수</h3>
        <div className="pr-vars" ref={variableInputs}>
          {rows.map((row, index) => <div className="pr-variable" key={row.id}>
            <input data-row={row.id} value={row.name} aria-label="변수 이름" placeholder="변수 이름" spellCheck={false}
              onChange={e => setRows(rows.map(item => item.id === row.id ? {...item,name:e.target.value} : item))}/>
            <input value={row.value} aria-label="변수 값" placeholder="값"
              onChange={e => setRows(rows.map(item => item.id === row.id ? {...item,value:e.target.value} : item))}/>
            <button type="button" className="pr-variable-icon" aria-label={(row.name + ' 변수 삭제').trim()} title="변수 삭제"
              onClick={() => {focusRow.current = (rows[index + 1] ?? rows[index - 1])?.id ?? 'add'; setRows(rows.filter(item => item.id !== row.id))}}>
              <Icon name="trash"/>
            </button>
          </div>)}
        </div>
        <button type="button" className="pr-variable-icon" ref={addButton} aria-label="변수 추가" title="변수 추가"
          onClick={() => {
            const id = nextRow.current++
            focusRow.current = id
            setRows([...rows,{id,name:'',value:''}])
          }}><Icon name="plus"/></button>
        <details className="pr-env-details">
          <summary><span>로그인 설정</span>{draft.apiOrigin && <small>{draft.apiOrigin}</small>}</summary>
          {field('apiOrigin','토큰 수신 API 주소','https://api.example.test')}
          {field('loginUrl','로그인 URL','${deviceUrl}/login')}
          <label className="pr-field">로그인 헤더 (JSON)<textarea spellCheck={false} rows={2} value={headersText} onChange={e => setHeadersText(e.target.value)}/></label>
          {field('loginBody','로그인 본문 (JSON)','{"username":"${username}","password":"${password}"}')}
          {field('tokenPath','토큰 JSON 경로','data.token')}
          {field('tokenHeader','토큰 헤더','Authorization')}
          {field('tokenPrefix','토큰 접두어','Bearer ')}
          <label className="pr-field">비밀번호<input type="password" autoComplete="new-password" value={password}
            placeholder={original.hasPassword ? '등록됨 · 새 비밀번호 입력' : '${password}'} disabled={clearPassword}
            onChange={e => setPassword(e.target.value)}/></label>
          <label className="pr-check"><input type="checkbox" checked={remember} disabled={!password || !postrail.canRememberPassword || clearPassword}
            onChange={e => setRemember(e.target.checked)}/>이 PC에 저장</label>
          {!postrail.canRememberPassword && <small>이 PC의 보호 저장소를 사용할 수 없습니다.</small>}
          {original.hasPassword && <label className="pr-check"><input type="checkbox" checked={clearPassword}
            onChange={e => setClearPassword(e.target.checked)}/>등록된 비밀번호 지우기</label>}
          {original.id && <button type="button" className="pr-setting-action" onClick={() => void postrail.logout(original.id)}>로그아웃</button>}
        </details>
        {original.id && <details className="pr-env-details">
          <summary>환경 설정</summary>
          {field('name','환경 이름')}
          <div className="pr-env-tools">
            <button type="button" className="pr-setting-action" onClick={create}>환경 추가</button>
            <button type="button" className="pr-setting-action danger" onClick={() => {setError(''); setDeleting(true)}}>환경 삭제</button>
          </div>
        </details>}
        {error && <p role="alert">{error}</p>}
        <div className="editor-actions"><button type="button" onClick={onClose}>닫기</button><button type="submit" className="primary">저장</button></div>
      </fieldset>
    </form>
  </PostRailPopup>
}
