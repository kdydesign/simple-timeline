import {randomUUID} from 'node:crypto'
import {mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {afterEach, beforeEach, expect, it} from 'vitest'
import {PostRailStore} from '../../src/main/postrail/store'
import type {PrEnv, PrRequest} from '../../src/shared/postrail'

const request: PrRequest = {
  id:'', groupId:null, name:'샘플 조회', method:'GET', url:'${deviceUrl}/samples', headers:{Accept:'application/json'},
  body:'', useAuth:true, timeoutMs:5000, favorite:true, nextIndex:'99',
}
const environment: PrEnv = {
  id:'', name:'개발', variables:{deviceUrl:'https://example.test'}, apiOrigin:'https://example.test', loginUrl:'',
  loginHeaders:{}, loginBody:'{"password":"${password}"}', tokenPath:'data.token', tokenHeader:'Authorization',
  tokenPrefix:'Bearer ', hasPassword:false,
}

let dir: string
let store: PostRailStore
let protectedValues: Map<string,string>
const vault = {
  available:true,
  isEncryptionAvailable() {return this.available},
  encryptString(plain: string) {
    const ref = randomUUID()
    protectedValues.set(ref, plain)
    return Buffer.from(ref)
  },
  decryptString(blob: Buffer) {return protectedValues.get(blob.toString())!},
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'postrail-store-'))
  protectedValues = new Map()
  vault.available = true
  store = new PostRailStore(dir, vault)
})
afterEach(() => {
  store.close()
  rmSync(dir, {force:true, recursive:true})
})
function reopen() {
  store.close()
  store = new PostRailStore(dir, vault)
}

it('persists request edits without overwriting the reserved index and safely ungroups favorites', () => {
  const group = store.mutate({type:'group.save', name:'장비'}).groups[0]
  const saved = store.mutate({type:'request.save', request:{...request, groupId:group.id}}).requests[0]
  expect(saved.nextIndex).toBe('1')
  expect(store.reserveIndex(saved.id)).toBe('1')
  store.mutate({type:'request.save', request:{...saved, method:'POST', body:'{}'}})
  store.mutate({type:'group.save', id:group.id, name:'장비 2'})
  store.mutate({type:'group.delete', id:group.id})
  reopen()
  expect(store.read().requests).toEqual([{...saved, method:'POST', groupId:null, body:'{}', nextIndex:'2'}])
  expect(store.reserveIndex(saved.id)).toBe('2')
  expect(store.mutate({type:'request.delete', id:saved.id}).requests).toEqual([])
  expect(() => store.mutate({type:'request.save', request:saved})).toThrow()
})

it('duplicates only the saved definition with independent numbering and names per group', () => {
  const group = store.mutate({type:'group.save', name:'장비'}).groups[0]
  const original = store.mutate({type:'request.save', request}).requests[0]
  store.reserveIndex(original.id)
  function duplicate(groupId: string|null) {
    return store.mutate({type:'request.duplicate', id:original.id, groupId}).requests.at(-1)!
  }
  const first = duplicate(null)
  expect(first).toEqual({...original, id:expect.any(String), name:'샘플 조회 복사본', favorite:false, nextIndex:'1'})
  expect(first.id).not.toBe(original.id)
  expect(duplicate(null).name).toBe('샘플 조회 복사본 2')
  expect(duplicate(group.id)).toMatchObject({groupId:group.id, name:'샘플 조회 복사본'})
  expect(store.reserveIndex(first.id)).toBe('1')
  expect(store.reserveIndex(original.id)).toBe('2')
})

it('reserves exact large decimal indices across connections and restarts', () => {
  const saved = store.mutate({type:'request.save', request}).requests[0]
  const db = new DatabaseSync(join(dir, 'postrail.sqlite'))
  db.prepare('UPDATE requests SET next_index = ? WHERE id = ?').run('9007199254740993', saved.id)
  db.close()
  const other = new PostRailStore(dir, vault)
  try {
    expect(store.reserveIndex(saved.id)).toBe('9007199254740993')
    expect(other.reserveIndex(saved.id)).toBe('9007199254740994')
  } finally {
    other.close()
  }
  reopen()
  expect(store.read().requests[0].nextIndex).toBe('9007199254740995')
})

it('returns only password presence, seals opted-in values and forgets session passwords on close', () => {
  const password = 'fixture-private-password'
  const first = store.mutate({type:'env.save', environment, password, remember:true})
  const env = first.environments[0]
  expect(first.environmentId).toBe(env.id)
  expect(env.hasPassword).toBe(true)
  expect(JSON.stringify(first)).not.toContain(password)
  const second = store.mutate({type:'env.save', environment:{...environment, name:'QA'}, password:'session-only'})
  const qa = second.environments[1]
  expect(store.password(qa.id)).toBe('session-only')
  expect(second.environmentId).toBe(qa.id)
  expect(store.mutate({type:'env.select', id:env.id}).environmentId).toBe(env.id)
  store.mutate({type:'env.select', id:qa.id})
  store.mutate({type:'env.save', environment:{...env, name:'현장'}})
  for (const file of readdirSync(dir)) {
    const data = readFileSync(join(dir, file)).toString()
    expect(data).not.toContain(password)
    expect(data).not.toContain('session-only')
  }
  reopen()
  expect(store.password(env.id)).toBe(password)
  expect(store.password(qa.id)).toBe('')
  expect(store.read().environmentId).toBe(qa.id)
  expect(store.read().environments[1].hasPassword).toBe(false)
  expect(store.mutate({type:'env.delete', id:qa.id}).environmentId).toBe(env.id)
  store.mutate({type:'env.save', environment:env, remember:false})
  expect(store.password(env.id)).toBe(password)
  reopen()
  expect(store.password(env.id)).toBe('')
})

it('rolls back rejected edits and permits session passwords without an OS key store', () => {
  const saved = store.mutate({type:'env.save', environment, password:'old'}).environments[0]
  vault.available = false
  expect(() => store.mutate({type:'env.save', environment:{...saved, name:'새 이름'}, password:'new', remember:true})).toThrow()
  expect(store.read().environments[0]).toEqual(saved)
  expect(store.password(saved.id)).toBe('old')
  for (const key of ['index','password']) {
    expect(() => store.mutate({type:'env.save', environment:{...saved, variables:{[key]:'value'}}})).toThrow()
  }
  expect(() => store.mutate({type:'request.save', request:{...request, groupId:'stale'}})).toThrow()
  expect(store.read().requests).toEqual([])
})

it('leaves a damaged database untouched', () => {
  store.close()
  const path = join(dir, 'postrail.sqlite')
  writeFileSync(path, 'damaged database')
  expect(() => new PostRailStore(dir, vault)).toThrow()
  expect(readFileSync(path, 'utf8')).toBe('damaged database')
})

it('identifies user-facing validation errors while hiding keyring error text', () => {
  const badRequest = {...request, name:' '}
  expect(() => store.mutate({type:'request.save', request:badRequest})).toThrowError(expect.objectContaining({name:'PostRailStoreError'}))
  const brokenVault = {...vault, encryptString() {throw Error('private keyring diagnostics')}}
  const other = new PostRailStore(dir, brokenVault)
  try {
    expect(() => other.mutate({type:'env.save', environment, password:'test', remember:true})).toThrowError(expect.objectContaining({
      name:'PostRailStoreError',
      message:'비밀번호를 보호하여 저장할 수 없습니다. 이 PC에 저장을 해제하면 현재 세션에서 사용할 수 있습니다.',
    }))
  } finally {
    other.close()
  }
})
it('keeps an editor save and a concurrent sidebar star change independent', () => {
  const current = store.mutate({type:'request.save', request}).requests[0]
  const draft = {...current, body:'{"change":true}', method:'POST' as const}
  store.mutate({type:'request.favorite', id:current.id, favorite:false})
  expect(store.mutate({type:'request.save', request:draft}).requests[0]).toMatchObject({body:draft.body, favorite:false})
  expect(store.mutate({type:'request.favorite', id:current.id, favorite:true}).requests[0]).toMatchObject({body:draft.body, favorite:true})
})

it('applies the environment editor in one transaction and keeps the execution selection', () => {
  const first = store.mutate({type:'env.save', environment, password:'old'}).environments[0]
  const changed = {environment:{...first, name:'운영'}, password:'new'}
  const added = {environment:{...environment, name:'QA'}}
  vault.available = false
  expect(() => store.mutate({type:'env.batch', saves:[changed, {...added, password:'blocked', remember:true}], deletedIds:[]})).toThrow()
  expect(store.read().environments).toEqual([first])
  expect(store.password(first.id)).toBe('old')
  const saved = store.mutate({type:'env.batch', saves:[changed, added], deletedIds:[]})
  expect(saved.environments.map(env=>env.name)).toEqual(['운영','QA'])
  expect(saved.environmentId).toBe(first.id)
  expect(store.password(first.id)).toBe('new')
  const remaining = store.mutate({type:'env.batch', saves:[], deletedIds:[first.id]})
  expect(remaining.environmentId).toBe(saved.environments[1].id)
  expect(store.mutate({type:'env.batch', saves:[], deletedIds:[remaining.environmentId!]}).environmentId).toBeNull()
})

it('persists only selected file references and binds copied files to the duplicate request', async () => {
  const first = store.mutate({type:'request.save', request:{...request,method:'POST'}}).requests[0]
  const second = store.mutate({type:'request.save', request}).requests[1]
  const path = join(dir,'첨부.bin')
  writeFileSync(path, new Uint8Array([0,255]))
  const file = store.selectFile(first.id, path)
  expect(file).toEqual({id:expect.any(String),name:'첨부.bin'})
  const upload:PrRequest = {...first, bodyMode:'binary', binaryFile:file, savedRepeatCount:'3',
    formRows:[{name:'saved',value:'draft',enabled:false}]}
  expect(() => store.mutate({type:'request.save', request:{...upload,id:second.id}})).toThrow()
  store.mutate({type:'request.save', request:upload})
  const copy = store.mutate({type:'request.duplicate', id:first.id, groupId:null}).requests.at(-1)!
  reopen()
  expect(store.read().requests[0]).toEqual(upload)
  expect(JSON.stringify(store.read())).not.toContain(dir)
  expect((await store.openFile(copy.id,copy.binaryFile!)()).size).toBe(2)
  rmSync(path)
  expect(() => store.openFile(first.id,file)).toThrow()
})

it('moves only the saved group while preserving the definition and latest reserved index', () => {
  const group = store.mutate({type:'group.save',name:'목적지'}).groups[0]
  const saved = store.mutate({type:'request.save',request:{...request,method:'POST',body:'{"sample":1}'}}).requests[0]
  store.reserveIndex(saved.id)
  expect(store.mutate({type:'request.move',id:saved.id,groupId:group.id}).requests)
    .toEqual([{...saved,groupId:group.id,nextIndex:'2'}])
  expect(()=>store.mutate({type:'request.move',id:saved.id,groupId:'missing'})).toThrow()
  expect(store.read().requests[0].groupId).toBe(group.id)
  expect(store.mutate({type:'request.move',id:saved.id,groupId:null}).requests)
    .toEqual([{...saved,groupId:null,nextIndex:'2'}])
})

it('validates active header rows on save and keeps disabled header drafts out of the effective headers', () => {
  const header={name:'Host',value:'example.test',enabled:true}
  expect(()=>store.mutate({type:'request.save',request:{...request,headerRows:[header]}})).toThrow()
  const rows=[{...header,enabled:false},{name:'X-Note',value:'a:b',enabled:true}]
  const saved=store.mutate({type:'request.save',request:{...request,headerRows:rows}}).requests[0]
  expect(saved.headers).toEqual({'X-Note':'a:b'})
  expect(saved.headerRows).toEqual(rows)
})

it('revokes picked and saved files when the owner is deleted, including stale drafts on another connection', async () => {
  const owner=store.mutate({type:'request.save',request:{...request,method:'POST'}}).requests[0]
  const path=join(dir,'attachment.txt')
  writeFileSync(path,'local')
  const saved=store.selectFile(owner.id,path)
  store.mutate({type:'request.save',request:{...owner,binaryFile:saved}})
  const pending=store.selectFile(owner.id,path)
  const other=new PostRailStore(dir,vault)
  try {
    const remoteDraft=other.selectFile(owner.id,path)
    const prepared=other.openFile(owner.id,remoteDraft)
    store.mutate({type:'request.delete',id:owner.id})
    expect(()=>store.openFile(owner.id,saved)).toThrow()
    expect(()=>store.openFile(owner.id,pending)).toThrow()
    expect(()=>other.openFile(owner.id,remoteDraft)).toThrow()
    await expect(async()=>prepared()).rejects.toThrow()
  } finally {other.close()}
})

it('drops superseded picks and preserves draft files in other body modes through an unrelated save', () => {
  const owner=store.mutate({type:'request.save',request:{...request,method:'POST'}}).requests[0]
  const path=join(dir,'attachment.txt')
  writeFileSync(path,'local')
  const first=store.selectFile(owner.id,path)
  const otherMode=store.selectFile(owner.id,path,[first.id])
  const replacement=store.selectFile(owner.id,path,[otherMode.id])
  expect(()=>store.openFile(owner.id,first)).toThrow()
  store.mutate({type:'request.save',request:{...owner,name:'rename'}})
  expect(()=>store.openFile(owner.id,otherMode)).not.toThrow()
  expect(()=>store.openFile(owner.id,replacement)).not.toThrow()
  store.mutate({type:'request.save',request:{...owner,binaryFile:replacement}})
  store.mutate({type:'request.save',request:owner})
  expect(()=>store.openFile(owner.id,replacement)).toThrow()
})

it('merges content, moved groups, and popup metadata when commands are based on the same saved request', () => {
  const group=store.mutate({type:'group.save',name:'목적지'}).groups[0]
  const create=()=>store.mutate({type:'request.save',request}).requests.at(-1)!
  for (const contentFirst of [false,true]) {
    const saved=create()
    const content={type:'request.content' as const,baseUrl:saved.url,
      request:{...saved,body:'{"new":true}',url:'https://editor.test/:old?stale=1',pathValues:{old:'old'},
        queryRows:[{enabled:true,name:'stale',value:'1'}]}}
    const address={url:'https://popup.test/:new?fresh=2',pathValues:{new:'two'},queryRows:[{enabled:true,name:'fresh',value:'2'}]}
    const metadata={type:'request.metadata' as const,id:saved.id,name:'새 이름',address}
    if (contentFirst) store.mutate(content)
    store.mutate({type:'request.move',id:saved.id,groupId:group.id})
    store.mutate(metadata)
    if (!contentFirst) store.mutate(content)
    expect(store.read().requests.at(-1)).toEqual({...saved,...address,body:'{"new":true}',groupId:group.id,name:'새 이름'})
  }
  const saved=create()
  store.mutate({type:'request.move',id:saved.id,groupId:group.id})
  store.mutate({type:'request.content',baseUrl:saved.url,request:{...saved,url:'https://edited.test'}})
  expect(store.mutate({type:'request.metadata',id:saved.id,name:'변경'}).requests.at(-1))
    .toEqual({...saved,url:'https://edited.test',name:'변경',groupId:group.id})
})
