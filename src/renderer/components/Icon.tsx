import {isRestoringFocus} from '../state/restoreFocus';
import type { ButtonHTMLAttributes } from 'react';
import {Button} from './ui/button';
import {Tooltip,TooltipTrigger,TooltipContent} from './ui/tooltip';
const paths = {
 refresh:'M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2', connection:'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Z M9 12l2 2 4-4',
 gantt:'M3 6h10M7 12h14M3 18h12', calendar:'M4 5h16v16H4Z M8 2v6m8-6v6M4 10h16M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
 folder:'M3 7V4h7l3 3h8v13H3Z', project:'M3 7V4h7l3 3h8v13H3Z M12 11v6m-3-3h6',
 plus:'M12 5v14M5 12h14', left:'m15 5-7 7 7 7', right:'m9 5 7 7-7 7', down:'m6 9 6 6 6-6',
 close:'m6 6 12 12M6 18 18 6', minimize:'M5 12h14', maximize:'M5 5h14v14H5Z', restore:'M8 5V3h13v13h-2M3 8h13v13H3Z',
 moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z', sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
 today:'M12 2v3m0 14v3M2 12h3m14 0h3M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0', check:'m5 12 4 4L19 6',
} as const;
export type IconName = keyof typeof paths;
export function Icon({name}: {name: IconName}) {return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>}
export function IconButton({icon,label,tooltip=false,description,onFocus,className='',...props}: {icon:IconName;label:string;tooltip?:boolean;description?:string}&ButtonHTMLAttributes<HTMLButtonElement>) {
 const button=<Button type="button" variant="ghost" size="icon" {...props} onFocus={e=>{onFocus?.(e);if(isRestoringFocus())e.preventDefault()}} className={`icon-button ${className}`} aria-label={label} aria-description={description??props['aria-description']}><Icon name={icon}/></Button>;
 return tooltip ? <Tooltip><TooltipTrigger asChild>{button}</TooltipTrigger><TooltipContent side="bottom" align="center" sideOffset={8} collisionPadding={8} className="app-tooltip">{description?`${label} · ${description}`:label}</TooltipContent></Tooltip> : button;
}
