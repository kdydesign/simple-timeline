import {createRoot} from 'react-dom/client'
import {HelpApp} from './HelpApp'
import './help.css'
performance.mark('help-module-ready')
createRoot(document.getElementById('root')!).render(<HelpApp api={window.planrailHelp??{command:async()=>({ok:false})}}/> )
