import {execFile, type ExecFileOptionsWithStringEncoding} from 'node:child_process'
import {promisify} from 'node:util'

const execute=promisify(execFile)
/** Test-only installer runner. Keep Electron's inspector/exit events responsive. */
export function runInstallerProcess(file:string,args:string[],options:ExecFileOptionsWithStringEncoding){
 return execute(file,args,options)
}
