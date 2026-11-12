export interface LoginRegistration {selected:boolean|null;registered:boolean;disabled:boolean}
export interface LoginStartupState extends LoginRegistration {supported:boolean;enabled:boolean}
export function createLoginStartup(options:{supported:boolean;execute(action:'Read'|'On'|'Off'):Promise<LoginRegistration>}) {
 const empty:LoginStartupState={supported:options.supported,enabled:false,selected:null,registered:false,disabled:false}
 const read=async():Promise<LoginStartupState>=>{
  if(!options.supported)return {...empty}
  const state=await options.execute('Read')
  return {...state,supported:true,enabled:state.registered&&!state.disabled}
 }
 return {read,async set(enabled:boolean):Promise<{state:LoginStartupState;error?:string}>{
  if(!options.supported)return {state:await read()}
  try{await options.execute(enabled?'On':'Off');const state=await read();if(state.enabled!==enabled||state.selected!==enabled)throw Error('Windows 시작 설정이 적용되지 않았습니다.');return {state}}
  catch(error){return {state:await read(),error:error instanceof Error?error.message:String(error)}}
 }}
}
