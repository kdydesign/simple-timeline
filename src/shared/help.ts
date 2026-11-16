export const helpChannel = 'help:command'
export const helpOpened = 'help:opened'
export const helpTopicIds = ['app-overview', 'projects', 'schedules', 'gantt-navigation', 'schedule-drag', 'calendar', 'personal-reminders', 'window-tray', 'installation', 'saving-errors', 'help-reading','getting-started','host-start','host-participants','host-projects','host-access','host-updates','member-connect','member-sync','member-reminders','member-updates','member-disconnect','troubleshoot-connection','troubleshoot-updates','troubleshoot-notifications'] as const
export type HelpTopicId = typeof helpTopicIds[number]
export interface HelpReadingState {topicId:HelpTopicId;query:string;scrollTop:number}
export type HelpCommand = 'state'|'remember'|'minimize'|'toggle-maximize'|'close'|'ready'
export interface HelpReply {ok:boolean;reading?:HelpReadingState;version?:string;maximized?:boolean;openId?:number}
export interface HelpApi {command(command:HelpCommand,reading?:HelpReadingState|number):Promise<HelpReply>;onOpen?(listener:()=>void):()=>void}
export function initialHelpTopic(role:string):HelpTopicId {
 return role==='host'?'host-start':role==='member'?'member-connect':'app-overview'
}
export function validHelpReading(value:unknown):value is HelpReadingState {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const s=value as HelpReadingState
 return Object.keys(s).length===3&&helpTopicIds.includes(s.topicId)&&typeof s.query==='string'&&s.query.length<=200&&Number.isFinite(s.scrollTop)&&s.scrollTop>=0&&s.scrollTop<=1e7
}
