import {spawnSync} from 'node:child_process'
import {readFile,readdir,writeFile,copyFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectPackage} from '../testing/packaged-smoke.mjs'
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Build on Windows x64; cross-build is not release verification')
const git=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}),sha=git.stdout?.trim()
if(git.status!==0||!sha||!/^[0-9a-f]{40}$/.test(sha))throw Error('Source commit SHA required')
const pkg=JSON.parse(await readFile('package.json','utf8')),update=process.argv.includes('--validation-update'),parts=pkg.version.split('.').map(Number)
const version=update?`${parts[0]}.${parts[1]}.${parts[2]+1}`:pkg.version,output=update?'artifacts/windows-update':'release'
const args=['node_modules/electron-builder/cli.js','--config','electron-builder.yml','--win','nsis','--x64','--publish','never',`--config.extraMetadata.sourceSha=${sha}`,`--config.extraMetadata.version=${version}`,`--config.directories.output=${output}`]
const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,ST_SOURCE_SHA:sha,CSC_IDENTITY_AUTO_DISCOVERY:'false'}})
if(result.status!==0)process.exit(result.status??1)
const inspection=await inspectPackage(join(output,'win-unpacked'),{sourceSha:sha,version})
const installers=(await readdir(output)).filter(p=>p.endsWith('.exe'))
if(installers.length!==1)throw Error('Exactly one Windows installer expected')
const name=installers[0],bytes=await readFile(join(output,name)),hash=createHash('sha256').update(bytes).digest('hex')
const manifest={version,arch:'x64',target:'Windows 11',sourceSha:sha,installer:name,sha256:hash,bytes:bytes.length,signed:false,distribution:'private-ci-artifact',validationUpdateOnly:update,unpacked:inspection}
await writeFile(join(output,name+'.sha256'),`${hash}  ${name}\n`)
await writeFile(join(output,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n')
if(!update)await copyFile('docs/release/user-guide.md',join(output,'USER-GUIDE.ko.md'))
console.log('Windows installer manifest: '+resolve(output,'release-manifest.json'))
