export interface HolidayDate {date:string;endDate?:string;name:string}
export interface HolidayCalendar { weekdays: number[]; dates: HolidayDate[] }
export interface HolidayEnvelope {schemaVersion:1;hostId:string;datasetId:string;revision:string;calendar:HolidayCalendar}
export interface HolidayState {
 calendar:HolidayCalendar
 status:'local'|'host'|'pending'|'current'|'stale'|'unsupported'|'error'
 lastReceivedAt:string|null
 message:string
}
export const DEFAULT_HOLIDAYS:HolidayCalendar={weekdays:[0,6],dates:[]}
export type HolidayPoll={kind:'updated';envelope:HolidayEnvelope;etag:string}|{kind:'unchanged'}|{kind:'unsupported'}
