import {useLayoutEffect, useRef, useState} from 'react'
import type {PrEnv} from '../../shared/postrail'
import {Icon} from '../components/Icon'
import {PostRailPopup} from './PostRailPopup'
import {TemplateField} from './TemplateField'
import {checkDraft, draftChanged, environmentDraft, type EnvironmentDraft} from './environment-draft'
import type {PostRailController} from './usePostRail'
import './environment-dialog.css'

type EnvironmentAccess = Pick<PostRailController, 'library' | 'mutate' | 'canRememberPassword'> & {logout:(id:string)=>Promise<void|boolean>} &
  Partial<Pick<PostRailController,'run'|'error'>>
type EnvironmentTab = 'variables' | 'login'
type DraftCheck = ReturnType<typeof checkDraft>
type LoginKey = 'apiOrigin'|'loginUrl'|'loginBody'|'tokenPath'|'tokenHeader'|'tokenPrefix'|'loginHeaders'

export function EnvironmentManagerButton({postrail,open,onOpenChange}: {
  postrail:EnvironmentAccess
  open?:boolean
  onOpenChange?:(open:boolean)=>void
}) {
  const [anchor,setAnchor] = useState<HTMLButtonElement|null>(null)
  const [internalOpen,setInternalOpen] = useState(false)
  const [tab,setTab] = useState<EnvironmentTab>('login')
  function toggle(next:boolean) {
    setInternalOpen(next)
    setTab(next ? 'variables' : 'login')
    onOpenChange?.(next)
  }
  return <>
    <button ref={setAnchor} type="button" aria-haspopup="dialog" className="pr-env-manager" onClick={()=>toggle(true)}>
      <Icon name="settings"/>환경 관리</button>
    {(open ?? internalOpen) && anchor && <EnvironmentDialog postrail={postrail} anchor={anchor}
      initialTab={tab} onClose={()=>toggle(false)}/>}
  </>
}

export function EnvironmentDialog({postrail,anchor,onClose,initialTab='variables'}: {
  postrail:EnvironmentAccess
  anchor:HTMLElement
  onClose:()=>void
  initialTab?:EnvironmentTab
}) {
  const [originals] = useState(()=>postrail.library.environments.map(env=>environmentDraft(env)))
  const [drafts,setDrafts] = useState(()=>originals.length ? originals : [environmentDraft()])
  const [initialBlank] = useState(()=>originals.length ? null : drafts[0])
  const [editing,setEditing] = useState(postrail.library.environmentId || drafts[0]?.key)
  const [tab,setTab] = useState(initialTab)
  const [busy,setBusy] = useState(false)
  const [failed,setFailed] = useState('')
  const [checked,setChecked] = useState(false)
  const [advanced,setAdvanced] = useState(false)
  const [confirmation,setConfirmation] = useState<'delete'|'discard'|'token'|null>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const focusName = useRef(false)
  const draft = drafts.find(item=>item.key===editing)
  const original = (item:EnvironmentDraft)=>originals.find(env=>env.key===item.key)
  const changed = drafts.filter(item=>draftChanged(item,original(item)))
  const deleted = originals.filter(item=>!drafts.some(env=>env.key===item.key))
  const pending = [...changed.filter(item=>item.key!==initialBlank?.key || draftChanged(item,initialBlank)),...deleted]
  const hasToken = !!draft?.environment.id && !!postrail.run?.authenticatedEnvironmentIds.includes(draft.environment.id)
  useLayoutEffect(()=>{
    if (focusName.current) nameInput.current?.focus()
    focusName.current = false
  },[editing])

  function update(patch:Partial<EnvironmentDraft>) {
    setFailed('')
    setDrafts(items=>items.map(item=>item.key===editing ? {...item,...patch} : item))
  }
  function updateEnv(key:keyof PrEnv,value:string) {
    if (draft) update({environment:{...draft.environment,[key]:value}})
  }
  function close() {
    if (confirmation) setConfirmation(null)
    else if (pending.length) setConfirmation('discard')
    else onClose()
  }
  function add() {
    if (draft && draft.key === initialBlank?.key && !draftChanged(draft,initialBlank)) {
      nameInput.current?.focus()
      return
    }
    const item = environmentDraft()
    setDrafts([...drafts,item])
    focusName.current = true
    setEditing(item.key)
    setTab('variables')
    setFailed('')
  }
  async function save() {
    if (busy) return
    setChecked(true)
    const saves = []
    for (const item of changed) {
      const result = checkDraft(item)
      if (Object.keys(result.errors).length || Object.keys(result.rowErrors).length) {
        setEditing(item.key)
        if (Object.keys(result.rowErrors).length) setTab('variables')
        else if (!result.errors.name) {
          setTab('login')
          if (result.errors.loginHeaders || result.errors.tokenHeader || result.errors.tokenPrefix) setAdvanced(true)
        }
        return
      }
      saves.push(result.save)
    }
    if (!saves.length && !deleted.length) {onClose(); return}
    setBusy(true)
    try {
      const result = await postrail.mutate({type:'env.batch',saves,deletedIds:deleted.map(item=>item.key)})
      if (result) onClose()
      else setFailed('환경을 저장하지 못했습니다. 입력값과 비밀번호 저장 설정을 확인하세요.')
    } catch {setFailed('환경을 저장하지 못했습니다. 다시 시도하세요.')}
    finally {setBusy(false)}
  }
  const label = (item:EnvironmentDraft)=>item.environment.name.trim() || '새 환경'
  if (confirmation) {
    const title = confirmation==='discard' ? '변경 사항 폐기' : confirmation==='delete' ? '환경 삭제' : '저장된 토큰 비우기'
    async function confirm() {
      if (confirmation==='discard') {onClose(); return}
      if (!draft) return
      if (confirmation==='delete') {
        const remaining = drafts.filter(item=>item.key!==draft.key)
        setDrafts(remaining)
        setEditing(remaining[Math.min(drafts.indexOf(draft), remaining.length-1)]?.key)
      } else if (hasToken) {
        setBusy(true)
        try {
          if (await postrail.logout(draft.environment.id) === false) {
            setFailed('토큰을 비우지 못했습니다. 다시 시도하세요.')
            setConfirmation(null)
            return
          }
        } catch {
          setFailed('토큰을 비우지 못했습니다. 다시 시도하세요.')
          setConfirmation(null)
          return
        } finally {setBusy(false)}
      }
      setFailed('')
      setConfirmation(null)
    }
    return <PostRailPopup key="confirm" anchor={anchor} title={title} onClose={close} busy={busy}>
      <p>{confirmation==='discard' ? pending.map(label).join(', ')+' 환경의 변경 사항을 폐기할까요?' :
        confirmation==='delete' && draft ? '‘'+label(draft)+'’ 환경을 삭제할까요? 저장하면 적용됩니다.' :
        '‘'+(draft && label(draft))+'’ 환경의 토큰을 즉시 비울까요? 이 환경의 인증 반복은 현재 회차 후 중지하며, 다음 인증 요청에서 다시 로그인합니다.'}</p>
      <div className="editor-actions"><button type="button" data-initial-focus disabled={busy} onClick={close}>
        {confirmation==='discard' ? '계속 편집' : '취소'}</button>
        <button type="button" className="danger" disabled={busy} onClick={()=>void confirm()}>
          {confirmation==='discard' ? '폐기' : confirmation==='delete' ? '삭제' : '비우기'}</button></div>
    </PostRailPopup>
  }
  const result = checked && draft ? checkDraft(draft) : undefined
  return <PostRailPopup key="editor" wide anchor={anchor} title="환경 관리" onClose={close} busy={busy}>
    <form noValidate onSubmit={e=>{e.preventDefault(); void save()}}>
      <fieldset disabled={busy} className="pr-environment-grid">
        <div className="pr-environment-list" aria-label="환경 목록">
          <button type="button" className="pr-new-environment" onClick={add}><Icon name="plus"/>환경 추가</button>
          {drafts.map(item=><button type="button" key={item.key} aria-pressed={editing===item.key}
            onClick={()=>{setEditing(item.key);setFailed('')}}>{label(item)}</button>)}
        </div>
        <div className="pr-environment-fields">{draft ? <>
          <label className="pr-field">환경 이름<input ref={nameInput} data-initial-focus value={draft.environment.name}
            aria-invalid={!!result?.errors.name} onChange={e=>updateEnv('name',e.target.value)}/></label>
          {result?.errors.name && <p role="alert">{result.errors.name}</p>}
          <div className="pr-environment-tabs">
            <button type="button" aria-pressed={tab==='variables'} onClick={()=>setTab('variables')}>변수</button>
            <button type="button" aria-pressed={tab==='login'} onClick={()=>setTab('login')}>로그인 설정</button>
          </div>
          {tab==='variables' ? <VariableRows key={editing} draft={draft} errors={result?.rowErrors} update={update}/> :
            <LoginFields draft={draft} errors={result?.errors} update={update} updateEnv={updateEnv} advanced={advanced}
              setAdvanced={setAdvanced} canRemember={postrail.canRememberPassword} hasToken={hasToken}
              clearToken={()=>setConfirmation('token')}/>}
        </> : <p>환경 없음</p>}</div>
      </fieldset>
      {failed && <p role="alert" className="pr-environment-error">{postrail.error || failed}</p>}
      <div className="editor-actions">
        {draft && <button className="danger pr-leading" disabled={busy} type="button" onClick={()=>setConfirmation('delete')}>환경 삭제</button>}
        <button type="button" disabled={busy} onClick={close}>닫기</button>
        <button type="submit" className="primary" disabled={busy}>저장</button>
      </div>
    </form>
  </PostRailPopup>
}

function VariableRows({draft,errors,update}: {
  draft:EnvironmentDraft
  errors?:DraftCheck['rowErrors']
  update:(patch:Partial<EnvironmentDraft>)=>void
}) {
  const {rows} = draft
  const root = useRef<HTMLDivElement>(null)
  const focus = useRef<string | null>(null)
  const seq = useRef(rows.reduce((next,row)=>Math.max(next,row.id+1),0))
  useLayoutEffect(()=>{
    if (focus.current) root.current?.querySelector<HTMLElement>(focus.current)?.focus()
    focus.current = null
  },[rows])
  return <div ref={root} className="pr-env-variables">
    <div className="pr-variable pr-variable-heading"><span>이름</span><span>값</span></div>
    {rows.map((row,index)=><div key={row.id} className="pr-variable">
      <input aria-label="변수 이름" data-row={row.id} value={row.name} placeholder="변수 이름" spellCheck={false}
        aria-invalid={!!errors?.[row.id]} aria-describedby={errors?.[row.id] ? 'var-error-'+row.id : undefined}
        onChange={e=>update({rows:rows.map(item=>item===row ? {...item,name:e.target.value} : item)})}/>
      <input aria-label="변수 값" value={row.value} placeholder="값"
        onChange={e=>update({rows:rows.map(item=>item===row ? {...item,value:e.target.value} : item)})}/>
      <button type="button" className="pr-variable-icon" aria-label={(row.name+' 변수 삭제').trim()} title="변수 삭제"
        onClick={()=>{
          const next = rows[index+1] ?? rows[index-1]
          focus.current = next ? '[data-row="'+next.id+'"]' : '[data-add]'
          update({rows:rows.filter(item=>item!==row)})
        }}><Icon name="trash"/></button>
      {errors?.[row.id] && <small role="alert" id={'var-error-'+row.id}>{errors[row.id]}</small>}
    </div>)}
    <button type="button" data-add className="pr-variable-icon" aria-label="변수 추가" title="변수 추가"
      onClick={()=>{
        const id = seq.current++
        focus.current = '[data-row="'+id+'"]'
        update({rows:[...rows,{id,name:'',value:''}]})
      }}><Icon name="plus"/></button>
  </div>
}

function LoginFields({draft,errors,update,updateEnv,advanced,setAdvanced,canRemember,hasToken,clearToken}: {
  draft:EnvironmentDraft
  errors?:DraftCheck['errors']
  update:(patch:Partial<EnvironmentDraft>)=>void
  updateEnv:(key:keyof PrEnv,value:string)=>void
  advanced:boolean
  setAdvanced:(open:boolean)=>void
  canRemember:boolean
  hasToken:boolean
  clearToken:()=>void
}) {
  const field = (key:LoginKey,label:string,placeholder?:string) => {
    const template = ['apiOrigin','loginUrl','loginBody','loginHeaders'].includes(key)
    const multiline = key==='loginBody' || key==='loginHeaders'
    const value = key==='loginHeaders' ? draft.headersText : draft.environment[key]
    const change = (s:string) => key==='loginHeaders' ? update({headersText:s}) : updateEnv(key,s)
    const attributes = {'aria-label':label,'aria-invalid':!!errors?.[key],'aria-describedby':errors?.[key] ? 'err-'+key : undefined,placeholder}
    return <div className="pr-env-field"><label className="pr-field">{label}
      {template ? <TemplateField {...attributes} multiline={multiline} rows={key==='loginBody' ? 4 : 3} value={value} onValueChange={change}/> :
        <input {...attributes} value={value} spellCheck={false} onChange={e=>change(e.target.value)}/>}</label>
      {errors?.[key] && <small role="alert" id={'err-'+key}>{errors[key]}</small>}</div>
  }
  return <div className="pr-environment-login">
    <h3>로그인 요청 <small>POST</small></h3>
    {field('loginUrl','로그인 URL','${BASE_URL}/login')}
    {field('loginBody','로그인 본문 (JSON)','{"password":"${password}"}')}
    <label className="pr-field">비밀번호<input type="password" autoComplete="new-password" value={draft.password}
      placeholder={draft.environment.hasPassword ? '등록됨 · 새 비밀번호 입력' : '${password}'} disabled={draft.clearPassword}
      onChange={e=>update({password:e.target.value})}/></label>
    <label className="pr-check"><input type="checkbox" checked={draft.remember}
      disabled={!draft.password || !canRemember || draft.clearPassword} onChange={e=>update({remember:e.target.checked})}/>이 PC에 저장</label>
    {!canRemember && <small>이 PC의 보호 저장소를 사용할 수 없습니다.</small>}
    {draft.environment.hasPassword && <label className="pr-check"><input type="checkbox" checked={draft.clearPassword}
      onChange={e=>update({clearPassword:e.target.checked})}/>등록된 비밀번호 지우기</label>}
    <h3>발급 토큰 사용</h3>
    <div className="pr-env-pair">{field('tokenPath','토큰 JSON 경로','data.token')}{field('apiOrigin','토큰 수신 API 주소','https://api.example.test')}</div>
    <details className="pr-env-details" open={advanced} onToggle={e=>setAdvanced(e.currentTarget.open)}>
      <summary>고급 헤더 설정</summary>
      <div className="pr-env-pair">{field('tokenHeader','토큰 헤더')}{field('tokenPrefix','토큰 접두어')}</div>
      {field('loginHeaders','로그인 헤더 (JSON)')}
    </details>
    <div className="pr-env-session"><span>{hasToken ? '사용 가능한 토큰' : '저장된 토큰 없음'}</span>
      {hasToken && <button type="button" className="pr-setting-action" onClick={clearToken}>저장된 토큰 비우기</button>}</div>
  </div>
}
