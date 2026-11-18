import {it,expect} from 'vitest'
import {join} from 'node:path'
import {developmentMemberOptions,profileDirectory} from '../../src/main/profile'
it('isolates a persistent member profile only for an unpackaged development flag',()=>{
 const input={packaged:false,development:true,args:['--planrail-dev-member'],appData:'/fake/appdata'}
 const options=developmentMemberOptions(input)
 expect(options).toEqual({profileDir:join(input.appData,'PlanrailDev','member'),developmentMember:true})
 expect(options?.profileDir).not.toBe(profileDirectory(input.appData))
 expect(developmentMemberOptions(input)).toEqual(options)
 expect(developmentMemberOptions({...input,packaged:true})).toBeUndefined()
 expect(developmentMemberOptions({...input,development:false})).toBeUndefined()
 expect(developmentMemberOptions({...input,args:[]})).toBeUndefined()
})
