import {cloneElement,type ReactElement,type ReactNode} from 'react'
import {namedHoliday} from '../../domain/holidays'
import type {HolidayCalendar} from '../../shared/holidays'
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from './ui/tooltip'
/** Decorates the existing date action, preserving its click/drag and tab order. */
export function HolidayDateTooltip({date,calendar,children}:{date:string|null;calendar?:HolidayCalendar;children:ReactElement<{children?:ReactNode}>}){
 const holiday=date?namedHoliday(date,calendar):undefined
 if(!holiday)return children
 return <TooltipProvider><Tooltip><TooltipTrigger asChild>{cloneElement(children,{},children.props.children,<span className="holiday-marker" aria-hidden="true"/>)}</TooltipTrigger><TooltipContent className="app-tooltip holiday-tooltip" side="bottom" collisionPadding={8}><strong>{holiday.name}</strong><span>{holiday.date}{holiday.endDate?` ~ ${holiday.endDate}`:''}</span></TooltipContent></Tooltip></TooltipProvider>
}
