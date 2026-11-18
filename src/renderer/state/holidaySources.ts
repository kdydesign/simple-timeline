import type {SharingState} from '../../shared/sharing'
import {DEFAULT_HOLIDAYS,type HolidaySources} from '../../shared/holidays'
/** Revocation/disconnect removes remote dates, never the local user's choices. */
export function localHolidaySources(state?:SharingState|null):HolidaySources{
 const common=state&&(state.role==='host'||(state.role==='member'&&state.status!=='revoked'&&state.holidays?.status!=='revoked'))?state.holidays?.calendar??DEFAULT_HOLIDAYS:undefined
 return {common,personal:state?.personalHolidays??DEFAULT_HOLIDAYS}
}
