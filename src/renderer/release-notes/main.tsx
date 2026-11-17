import {createRoot} from 'react-dom/client'
import {ReleaseNotesApp} from './ReleaseNotesApp'
import '../help/help.css'
createRoot(document.getElementById('root')!).render(<ReleaseNotesApp api={window.planrailReleaseNotes??{command:async()=>({ok:false})}}/>)
