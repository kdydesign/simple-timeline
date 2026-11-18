import { app } from 'electron'
import { bootstrap } from './bootstrap'
import {developmentMemberOptions} from './profile'
void bootstrap(developmentMemberOptions({packaged:app.isPackaged,development:process.env.NODE_ENV==='development',args:process.argv,appData:app.getPath('appData')})).catch((error) => {
  console.error('Startup failed', error)
  app.exit(1)
})
