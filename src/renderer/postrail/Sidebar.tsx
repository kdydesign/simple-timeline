import {useId, useLayoutEffect, useRef, useState, type KeyboardEvent} from 'react'
import {createPortal} from 'react-dom'
import {Star} from 'lucide-react'
import {postRailCopyName, type PrLibrary, type PrMutation, type PrRequest} from '../../shared/postrail'
import {Icon} from '../components/Icon'
import {Select} from '../components/Select'
import {Menu, type CommandMenu} from '../termrail/WorkspaceControls'
import {PostRailPopup} from './PostRailPopup'
import {changedAddress} from './request-address'
import {variableIssue} from './request-fields'
import {TemplateField} from './TemplateField'
import type {PostRailController} from './usePostRail'

type LibraryAccess = Pick<PostRailController, 'library' | 'mutate'>
type Group = PrLibrary['groups'][number]
type Editor =
  | {kind: 'group', group?: Group}
  | {kind: 'request', request?: PrRequest, groupId: string | null}
  | {kind: 'deleteGroup', group: Group}
  | {kind: 'deleteRequest', request: PrRequest}
type AnchoredEditor = Editor & {anchor: HTMLElement}

export function Sidebar({postrail, selectedId, onSelect}: {
  postrail: LibraryAccess
  selectedId: string | null
  onSelect: (id:string) => void
}) {
  const library = postrail.library
  const [menu, setMenu] = useState<CommandMenu | null>(null)
  const [editor, setEditor] = useState<AnchoredEditor | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set())
  const [search, setSearch] = useState('')
  const [dragged, setDragged] = useState<PrRequest | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState('')
  const tree = useRef<HTMLDivElement>(null)
  const copied = useRef<PrRequest | null>(null)
  const pending = useRef(false)
  useLayoutEffect(() => {
    if (!focusId) return
    tree.current?.querySelector<HTMLButtonElement>(`button[data-request-id="${CSS.escape(focusId)}"]`)?.focus()
    setFocusId(null)
  }, [focusId])

  function toggle(groupId: string | null, open: boolean) {
    setCollapsed(previous => {
      const next = new Set(previous)
      if (open) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  async function save(command: PrMutation, selectNew = false) {
    if (pending.current || !library) return false
    pending.current = true
    try {
      const result = await postrail.mutate(command)
      if (!result) return false
      if (selectNew) {
        const existing = new Set(library.requests.map(item => item.id))
        const created = result.requests.find(item => !existing.has(item.id))
        if (created) {
          toggle(created.groupId, true)
          onSelect(created.id)
          setFocusId(created.id)
        }
      } else if (command.type === 'request.metadata') {
        const saved = result.requests.find(item => item.id === command.id)
        if (saved) toggle(saved.groupId, true)
      } else if (command.type === 'request.move') {
        toggle(command.groupId, true)
        onSelect(command.id)
        setFocusId(command.id)
      } else if (command.type === 'group.delete') {
        toggle(null, true)
      }
      return true
    } finally {
      pending.current = false
    }
  }

  function shortcut(event: KeyboardEvent<HTMLButtonElement>, groupId: string | null, request?: PrRequest) {
    if (!library || event.target !== event.currentTarget || !event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.nativeEvent.isComposing) return
    const key = event.key.toLowerCase()
    if (key === 'c' && request) {
      event.preventDefault()
      copied.current = structuredClone(request)
      setCopyStatus(request.name + ' 복사됨')
    } else if (key === 'v' && copied.current) {
      event.preventDefault()
      if (event.repeat) return
      const snapshot = copied.current
      const name = postRailCopyName(snapshot.name, library.requests.filter(item => item.groupId === groupId).map(item => item.name))
      void save({type:'request.save', copyFilesFrom:snapshot.id,
        request:{...snapshot, id:'', name, groupId, nextIndex:'1', favorite:false}}, true)
        .then(ok => {if (ok) setCopyStatus(name + ' 추가됨')})
    }
  }

  function showMenu(anchor: HTMLElement, target: 'add' | Group | PrRequest | null, point?: {x:number, y:number}) {
    if (menu?.anchor === anchor && !point) {setMenu(null); return}
    const open = (next:Editor) => setEditor({...next, anchor})
    let items: CommandMenu['items']
    if (target === 'add') {
      const groupId = library?.requests.find(r => r.id === selectedId)?.groupId ?? null
      items = [['요청 추가', () => open({kind:'request',groupId})], ['그룹 추가', () => open({kind:'group'})]]
    } else if (target && 'method' in target) {
      items = [['수정', () => open({kind:'request', request:target, groupId:target.groupId})],
        ['복제', () => {void save({type:'request.duplicate',id:target.id,groupId:target.groupId}, true)}],
        ['삭제', () => open({kind:'deleteRequest',request:target})]]
    } else {
      items = [['요청 추가', () => open({kind:'request', groupId:target?.id ?? null})]]
      if (target) items.push(['수정', () => open({kind:'group',group:target})], ['삭제', () => open({kind:'deleteGroup',group:target})])
    }
    const bounds = anchor.getBoundingClientRect()
    setMenu({anchor, x:point?.x ?? bounds.left, y:point?.y ?? bounds.bottom, items})
  }

  function menuButton(label:string, target:'add' | Group | PrRequest | null) {
    const add = target === 'add'
    return <button type="button" className={add ? 'pr-add-button primary' : 'pr-more'} title={label}
      aria-label={label} aria-haspopup="menu" aria-expanded={menu?.anchor.getAttribute('aria-label') === label}
      onClick={event => showMenu(event.currentTarget, target)}>{add ? <Icon name="plus"/> : '…'}</button>
  }

  const groups = [...(library?.groups ?? []), {id:null, name:'미분류'}]
  const needle = search.toLowerCase()
  const matches = library?.requests.filter(item => item.name.toLowerCase().includes(needle)) ?? []
  function endDrag() {
    setDragged(null)
    setDropTarget(undefined)
  }
  return <aside className="pr-sidebar" aria-label="PostRail 요청 목록">
    <div className="pr-env-choice"><span>환경</span>
      <Select compact label="실행 환경 선택" escapeClipping disabled={!library?.environments.length}
        value={library?.environmentId ?? 'none'} onChange={id => void save({type:'env.select',id})}
        options={library?.environments.length ? library.environments.map(env => ({value:env.id,label:env.name}))
          : [{value:'none',label:'환경 없음'}]}/>
    </div>
    <div className="pr-add-bar">
      <input type="search" aria-label="요청 이름 검색" placeholder="요청 이름 검색" value={search} onChange={e => setSearch(e.target.value)}/>
      {menuButton('추가 메뉴', 'add')}
    </div>
    <div className="pr-request-tree" ref={tree}>
      {needle && !matches.length && <p className="pr-no-matches" role="status">일치하는 요청이 없습니다.</p>}
      {groups.map(({id,name}) => {
        const requests = matches.filter(item => item.groupId === id)
        if (needle && !requests.length && !dragged) return null
        const group = id ? {id,name} : null
        const open = !!needle || !collapsed.has(id)
        return <section key={id ?? ''} className="pr-group" data-drop-target={dropTarget === id || undefined}
          onDragOver={event => {
            if (!dragged || dragged.groupId === id) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setDropTarget(id)
          }}
          onDragLeave={event => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
            setDropTarget(previous => previous === id ? undefined : previous)
          }}
          onDrop={event => {
            if (!dragged) return
            event.preventDefault()
            if (dragged.groupId !== id) void save({type:'request.move', id:dragged.id, groupId:id})
            endDrag()
          }}>
          <div className="pr-group-heading">
            <button type="button" aria-label={name} aria-description={requests.length + '개 요청'} aria-expanded={open} onClick={() => {if (!needle) toggle(id, !open)}}
              onContextMenu={e => {e.preventDefault(); showMenu(e.currentTarget,group,{x:e.clientX,y:e.clientY})}}
              onKeyDown={event => shortcut(event, id)}>
              <Icon name={open ? 'down' : 'right'}/><span>{name}</span><small>{requests.length}</small>
            </button>
            {menuButton(name + ' 그룹 메뉴', group)}
          </div>
          {open && requests.map(request => <div key={request.id} className="pr-request-row" data-selected={selectedId === request.id}
            draggable onDragStart={event => {
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('application/x-postrail-request', request.id)
              setDragged(request)
            }} onDragEnd={endDrag}>
            <button type="button" data-request-id={request.id} aria-current={selectedId === request.id || undefined}
              onClick={() => onSelect(request.id)} onKeyDown={event => shortcut(event, id, request)}
              onContextMenu={e => {e.preventDefault(); showMenu(e.currentTarget,request,{x:e.clientX,y:e.clientY})}}>
              <b className={'pr-list-method ' + request.method}>{request.method}</b> <span>{request.name}</span>
            </button>
            <button type="button" className="pr-star" aria-label={request.name + ' 즐겨찾기'} aria-pressed={request.favorite}
              onClick={() => void save({type:'request.favorite',id:request.id,favorite:!request.favorite})}><Star size={15} aria-hidden="true"/></button>
            {menuButton(request.name + ' 요청 메뉴', request)}
          </div>)}
        </section>
      })}
    </div>
    <small role="status" className="pr-copy-status">{copyStatus}</small>
    {menu && createPortal(<Menu menu={menu} dismiss={() => setMenu(null)}/>, document.body)}
    {editor && library && <LibraryDialog key={editor.kind} editor={editor} library={library} onClose={() => setEditor(null)}
      onDelete={setEditor} save={save}/>}
  </aside>
}

function LibraryDialog({editor, library, onClose, onDelete, save}: {
  editor: AnchoredEditor
  library: PrLibrary
  onClose: () => void
  onDelete: (editor:AnchoredEditor) => void
  save: (command:PrMutation, selectNew?:boolean) => Promise<boolean>
}) {
  const group = 'group' in editor ? editor.group : undefined
  const request = 'request' in editor ? editor.request : undefined
  const [name, setName] = useState(group?.name ?? request?.name ?? '')
  const [url, setUrl] = useState(request?.url ?? '')
  const [groupId, setGroupId] = useState(editor.kind === 'request' ? editor.groupId : null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const nameErrorId = useId()
  const urlErrorId = useId()
  const urlError = variableIssue(url,library.environments.find(env=>env.id===library.environmentId),'URL')
  const removing = editor.kind === 'deleteGroup' || editor.kind === 'deleteRequest'
  const noun = editor.kind === 'group' || editor.kind === 'deleteGroup' ? '그룹' : '요청'
  const title = noun + (removing ? ' 삭제' : request || group ? ' 수정' : ' 추가')
  async function submit() {
    if (busy) return
    setBusy(true)
    let command: PrMutation
    switch (editor.kind) {
      case 'deleteGroup': command = {type:'group.delete',id:editor.group.id}; break
      case 'deleteRequest': command = {type:'request.delete',id:editor.request.id}; break
      case 'group': command = {type:'group.save',id:editor.group?.id,name:name.trim()}; break
      case 'request': {
        if (request) {
          command = {type:'request.metadata', id:request.id}
          if (name.trim() !== request.name) command.name = name.trim()
          if (groupId !== request.groupId) command.groupId = groupId
          if (url.trim() !== request.url) {
            const current = library.requests.find(item => item.id === request.id) ?? request
            const {url:addressUrl,queryRows,pathValues} = {...current,...changedAddress(current,url.trim())}
            command.address = {url:addressUrl,queryRows,pathValues}
          }
          break
        }
        const source: PrRequest = {id:'', name:'', groupId:null, method:'GET', url:'', headers:{},
          body:'', useAuth:false, timeoutMs:null, favorite:false, nextIndex:'1'}
        command = {type:'request.save', request:{...source,...changedAddress(source,url.trim()),name:name.trim(),groupId}}
        break
      }
    }
    const ok = await save(command, editor.kind === 'request' && !request)
    setBusy(false)
    if (ok) onClose()
    else setError('변경을 적용하지 못했습니다.')
  }
  return <PostRailPopup title={title} anchor={editor.anchor} onClose={onClose} busy={busy}>
    <form onSubmit={event => {event.preventDefault(); void submit()}}>
      <fieldset disabled={busy}>
        {removing ? <p>‘{name}’ {noun}을 삭제할까요?{group && ' 소속 요청은 미분류로 이동합니다.'}</p> : <>
          <label className={'pr-field' + (editor.kind === 'group' ? ' pr-group-name' : '')}>{noun} 이름<input
            required pattern=".*\S.*" value={name}
            aria-describedby={editor.kind === 'group' && error ? nameErrorId : undefined}
            onInvalid={event => {
              if (editor.kind !== 'group') return
              event.preventDefault()
              event.currentTarget.focus()
              setError('그룹 이름을 입력하세요.')
            }}
            onChange={e => {setName(e.target.value); setError('')}}/></label>
          {editor.kind === 'request' && <>
            <label className="pr-field">URL<TemplateField required pattern=".*\S.*" value={url}
              aria-label="URL" aria-invalid={!!urlError} aria-describedby={urlError ? urlErrorId : undefined}
              className="pr-library-url" placeholder="${deviceUrl}/api/samples" onValueChange={setUrl}/></label>
            {urlError && <p id={urlErrorId} className="pr-error">{urlError}</p>}
            <label className="pr-field">그룹<select value={groupId ?? ''} onChange={e => setGroupId(e.target.value || null)}>
              {library.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}<option value="">미분류</option>
            </select></label>
          </>}
        </>}
        {error && <p id={nameErrorId} role="alert">{error}</p>}
        <div className="editor-actions">
          {!removing && (request || group) && <button className="danger pr-leading" type="button" onClick={() => {
            if (request) onDelete({kind:'deleteRequest',request,anchor:editor.anchor})
            else if (group) onDelete({kind:'deleteGroup',group,anchor:editor.anchor})
          }}>{noun} 삭제</button>}
          <button type="button" data-initial-focus={removing ? true : undefined} onClick={onClose}>닫기</button>
          <button type="submit" className={removing ? 'danger' : 'primary'}>{removing ? '삭제' : '저장'}</button>
        </div>
      </fieldset>
    </form>
  </PostRailPopup>
}
