import { join } from 'node:path'
export const profileDirectory = (appData: string): string =>
  join(appData, 'SimpleTimeline')
export function developmentMemberOptions({packaged,development,args,appData}:{packaged:boolean;development:boolean;args:string[];appData:string}):{profileDir:string;developmentMember:true}|undefined{
 if(packaged||!development||!args.includes('--planrail-dev-member'))return undefined
 return {profileDir:join(appData,'PlanrailDev','member'),developmentMember:true}
}
