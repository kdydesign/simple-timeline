import {cloneElement,type ReactElement,type ReactNode} from 'react'
import {namedHoliday,namedHolidays} from '../../domain/holidays'
import type {HolidayCalendar} from '../../shared/holidays'
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from './ui/tooltip'
/** Decorates the existing date action, preserving its click/drag and tab order. */
export function HolidayDateTooltip({date,calendar,children,sources}:{sources?:import('../../shared/holidays').HolidaySources;date:string|null;calendar?:HolidayCalendar;children:ReactElement<{children?:ReactNode}>}){
 const single=date?namedHoliday(date,calendar):undefined
 const holidays=date&&sources?namedHolidays(date,sources):single?[{source:'common' as const,holiday:single}]:[]
 if(!holidays.length)return children
 return <TooltipProvider><Tooltip><TooltipTrigger asChild>{cloneElement(children,{},children.props.children,<span className="holiday-marker" aria-hidden="true"/>)}</TooltipTrigger><TooltipContent className="app-tooltip holiday-tooltip" side="bottom" collisionPadding={8}>{holidays.map(({source,holiday})=><span key={source}><strong>{sources?`${source==='common'?'공통':'개인'}: `:''}{holiday.name}</strong><span>{holiday.date}{holiday.endDate?` ~ ${holiday.endDate}`:''}</span></span>)}</TooltipContent></Tooltip></TooltipProvider>
}
