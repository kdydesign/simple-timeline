import {test,expect} from 'vitest'
import {spawn} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {runInstallerProcess} from '../e2e/installer-process'

test('installer waiting for an inspected app exit does not block debugger disconnect',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'planrail-inspector-exit-')),flag=join(dir,'exit')
 const app=spawn(process.execPath,['--inspect=0','-e',"const fs=require('node:fs');const t=setInterval(()=>{if(fs.existsSync(process.argv[1]))clearInterval(t)},10)",flag],{stdio:['ignore','ignore','pipe']})
 const closed=new Promise<void>(resolve=>app.once('close',()=>resolve()))
 let socket:WebSocket|undefined,observed=false,log=''
 try{
  const address=await new Promise<string>((resolve,reject)=>{
   app.once('error',reject)
   app.stderr.on('data',chunk=>{log+=chunk;const m=log.match(/ws:\/\/[^\s]+/);if(m)resolve(m[0]);if(log.includes('Waiting for the debugger to disconnect')){observed=true;socket?.close()}})
  })
  socket=new WebSocket(address)
  await new Promise<void>((resolve,reject)=>{socket!.onopen=()=>resolve();socket!.onerror=()=>reject(Error('Inspector connection failed'))})
  await new Promise<void>(resolve=>{socket!.onmessage=e=>{if(JSON.parse(String(e.data)).id===1)resolve()};socket!.send(JSON.stringify({id:1,method:'Runtime.enable'}))})
  // A separate process triggers a natural exit and waits as the real installer does.
  const wait="const fs=require('node:fs'),pid=Number(process.argv[1]);fs.writeFileSync(process.argv[2],'exit');const end=Date.now()+5000,t=setInterval(()=>{try{process.kill(pid,0)}catch{clearInterval(t);console.log('closed');return}if(Date.now()>end){clearInterval(t);console.error('installer exit wait timed out');process.exitCode=2}},20)"
  const result=await runInstallerProcess(process.execPath,['-e',wait,String(app.pid),flag],{encoding:'utf8',timeout:8000})
  await closed
  expect(result.stdout.trim()).toBe('closed');expect(observed).toBe(true)
 }finally{
  socket?.close()
  const timer=setTimeout(()=>app.kill(),1000)
  await closed;clearTimeout(timer)
  await rm(dir,{recursive:true,force:true})
 }
},15000)

test('installer failure keeps its original output available to cleanup and diagnostics',async()=>{
 await expect(runInstallerProcess(process.execPath,['-e',"console.error('identity denied');process.exitCode=2"],{encoding:'utf8',timeout:5000})).rejects.toMatchObject({code:2,stderr:expect.stringContaining('identity denied')})
})
