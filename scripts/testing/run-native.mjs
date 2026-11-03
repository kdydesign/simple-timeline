import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {mkdirSync,rmSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
mkdirSync('artifacts/native',{recursive:true});rmSync('artifacts/native/results.json',{force:true});
const electron=require('electron');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const r=spawnSync(electron,['tests/native/runner.cjs'],{env,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
writeFileSync('artifacts/native/latest.log',(r.stdout||'')+(r.stderr||''));
console.log(r.stdout||'');if(r.error||r.status!==0){console.error(r.error||r.stderr||`Electron exited ${r.status} ${r.signal}`);process.exit(1)}
