import { createRoot } from 'react-dom/client'
import { App } from './App'
performance.mark('timeline-module-ready')
createRoot(document.getElementById('root')!).render(<App />)
