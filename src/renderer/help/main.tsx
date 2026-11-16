import {createRoot} from 'react-dom/client'
import {HelpApp} from './HelpApp'
import './help.css'
createRoot(document.getElementById('root')!).render(<HelpApp api={window.planrailHelp??{command:async()=>({ok:false})}}/> )
