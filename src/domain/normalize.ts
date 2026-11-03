import {DomainValidationError} from './error'
export function normalizeName(value:unknown,field='name'):string {
  if(typeof value!=='string'||!value.trim())throw new DomainValidationError(field,'이름을 입력해 주세요.')
  return value.trim()
}
export function normalizeParticipants(value:unknown):string[] {
  if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))throw new DomainValidationError('participants')
  return [...new Set((value as string[]).map(v=>v.trim()).filter(Boolean))]
}
export function normalizeColor(value:unknown):string {
  if(typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))throw new DomainValidationError('color','색상은 #RRGGBB 형식으로 입력해 주세요.')
  return value.toUpperCase()
}
export function validateId(value:unknown,field='id'):string {
  if(typeof value!=='string'||!/[1-9]\d*/.test(value)||!/^([1-9]\d*)$/.test(value)||BigInt(value)>9223372036854775807n)throw new DomainValidationError(field)
  return value
}
