import {app} from 'electron'
import {bootstrap} from './bootstrap'
void bootstrap().catch(error=>{console.error('Startup failed',error);app.exit(1)})
