// Compile only: no Windows process, application package, installer or uninstaller is executed.
// Download the exact toolsets selected by the pinned builder; this is an explicit check.
import {createRequire} from 'node:module'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
const require=createRequire(import.meta.url)
const {load}=require('js-yaml')
const {getMakeNsisPath,getNsisPluginsPath}=require('app-builder-lib/out/toolsets/windows')
const {NsisScriptGenerator}=require('app-builder-lib/out/targets/nsis/nsisScriptGenerator')
const {LangConfigurator,createAddLangsMacro,addCustomMessageFileInclude}=require('app-builder-lib/out/targets/nsis/nsisLang')
const {nsisTemplatesDir}=require('app-builder-lib/out/targets/nsis/nsisUtil')
const config=load(await readFile('electron-builder.yml','utf8'))
const [compiler,plugins]=await Promise.all([getMakeNsisPath(config.toolsets?.nsis,config.nsis.customNsisBinary),getNsisPluginsPath(config.toolsets?.nsis,config.nsis.customNsisResources)])
const directory=await mkdtemp(join(tmpdir(),'simple-timeline-nsis-compile-'))
try{
 const header=new NsisScriptGenerator(),lang=new LangConfigurator(config.nsis)
 header.include(join(nsisTemplatesDir,'include','StdUtils.nsh'))
 header.addIncludeDir(join(nsisTemplatesDir,'include'))
 header.flags(['updated','force-run','keep-shortcuts','no-desktop-shortcut','delete-app-data','allusers','currentuser'])
 createAddLangsMacro(header,lang)
 let next=0
 const packager={getTempFile:async name=>join(directory,`${next++}-${name}`)}
 await addCustomMessageFileInclude('messages.yml',packager,header,lang)
 await addCustomMessageFileInclude('assistedMessages.yml',packager,header,lang)
 // Deliberately exercise the legal async builder order that failed actual Windows CI.
 // common.nsh defines APP_EXECUTABLE_FILENAME only after this entire shared header.
 header.include(resolve(config.nsis.include))
 header.addPluginDir('x86-unicode',join(plugins,'x86-unicode'))
 const source=header.build()+await readFile(join(nsisTemplatesDir,'installer.nsi'),'utf8')
 const payload=join(directory,'payload.7z'),uninstaller=join(directory,'uninstaller-placeholder.exe')
 await writeFile(payload,'compile-only archive placeholder; never executed')
 await writeFile(uninstaller,'compile-only uninstaller placeholder; never executed')
 const defines={PRODUCT_NAME:'Planrail',PRODUCT_FILENAME:'Planrail',APP_PRODUCT_FILENAME:'Planrail',APP_FILENAME:'Planrail',APP_DESCRIPTION:'Planrail compile smoke',APP_ID:config.appId,APP_GUID:'compile-only-planrail',UNINSTALL_APP_KEY:'compile-only-planrail',APP_PACKAGE_NAME:'simple-timeline',VERSION:'0.8.1',PROJECT_DIR:resolve('.'),BUILD_RESOURCES_DIR:resolve('resources'),APP_64:payload,APP_64_NAME:'payload.7z',APP_64_UNPACKED_SIZE:'1',COMPRESSION_METHOD:'7z',APP_INSTALLER_STORE_FILE:'simple-timeline-updater\\installer.exe',SHORTCUT_NAME:'Planrail',UNINSTALL_DISPLAY_NAME:'Planrail',UNINSTALL_SECTION_NAME:'Uninstall',UNINSTALLER_OUT_FILE:uninstaller,INSTALL_MODE_PER_ALL_USERS_REQUIRED:null}
 for(const mode of ['installer','uninstaller']){
  const flags={...defines,...(mode==='uninstaller'?{BUILD_UNINSTALLER:null}:{})}
  const args=['-WX','-INPUTCHARSET','UTF8',...Object.entries(flags).map(([key,value])=>`-D${key}${value===null?'':'='+value}`),'-XUnicode true',`-XOutFile "${join(directory,mode+'.exe')}"`,'-']
  const result=spawnSync(compiler.path,args,{input:source,cwd:nsisTemplatesDir,env:{...process.env,...compiler.env},encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024})
  if(result.error||result.status!==0){process.stderr.write(`${mode} compile failed\n${result.stdout??''}\n${result.stderr??''}\n`);throw result.error??Error(`${mode} makensis exit ${result.status}`)}
  console.log(`PASS compile-only actual builder ${mode} template with custom include before plugin directory`)
 }
}finally{await rm(directory,{recursive:true,force:true})}
