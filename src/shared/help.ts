export const helpChannel = 'help:command'
export const helpOpened = 'help:opened'
export const helpSectionIds = ['home','planrail','noderail','termrail','settings'] as const
export type HelpSection = typeof helpSectionIds[number]
export const isHelpSection = (value:unknown):value is HelpSection => helpSectionIds.some(id=>id===value)
export const helpTopicIds = ['workrail-home','node-management','ssh-terminal','settings','personal-holidays','app-overview', 'projects', 'schedules', 'gantt-navigation', 'schedule-drag', 'calendar', 'personal-reminders', 'window-tray', 'installation', 'saving-errors', 'help-reading','getting-started','host-start','host-participants','shared-holidays','host-projects','host-access','host-updates','member-connect','member-sync','member-reminders','member-updates','member-disconnect','troubleshoot-connection','troubleshoot-updates','troubleshoot-notifications'] as const
export type HelpTopicId = typeof helpTopicIds[number]
interface LegacyHelpReading {topicId:HelpTopicId;query:string;scrollTop:number}
export interface HelpReadingState extends LegacyHelpReading {section:HelpSection}
export type HelpCommand = 'state'|'remember'|'minimize'|'toggle-maximize'|'close'|'ready'
export interface HelpReply {ok:boolean;reading?:HelpReadingState;version?:string;maximized?:boolean;openId?:number}
export interface HelpApi {command(command:HelpCommand,reading?:HelpReadingState|number):Promise<HelpReply>;onOpen?(listener:()=>void):()=>void}
export function initialHelpTopic(role:string,section?:HelpSection):HelpTopicId {
 if(section)return ({home:'workrail-home',planrail:'app-overview',noderail:'node-management',termrail:'ssh-terminal',settings:'settings'} as const)[section]
 return role==='host'?'host-start':role==='member'?'member-connect':'app-overview'
}
function validReadingFields(value:unknown,keyCount:number):value is LegacyHelpReading {
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const s=value as LegacyHelpReading
 return Object.keys(s).length===keyCount&&helpTopicIds.includes(s.topicId)&&typeof s.query==='string'&&s.query.length<=200&&Number.isFinite(s.scrollTop)&&s.scrollTop>=0&&s.scrollTop<=1e7
}
export function validLegacyHelpReading(value:unknown):value is LegacyHelpReading {
 return validReadingFields(value,3)
}
export function validHelpReading(value:unknown):value is HelpReadingState {
 return validReadingFields(value,4)&&'section' in value&&isHelpSection(value.section)
}
