import {spawnSync} from 'node:child_process';
for(const tz of ['UTC','America/New_York','Asia/Seoul']){
  console.log(`Timezone: ${tz}`);
  const r=spawnSync(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.config.mts'],{env:{...process.env,TZ:tz},stdio:'inherit',timeout:60000});
  if(r.error||r.status!==0){console.error(r.error??`Exit ${r.status}`);process.exit(1)}
}
