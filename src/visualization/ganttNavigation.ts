export const DEFAULT_DAY_WIDTH = 28
export function validDayWidth(value:unknown):number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 14 && value <= 84 ? value : DEFAULT_DAY_WIDTH
}
export function wheelPixels(delta:number, mode:number, page:number):number {
  return delta * (mode === 1 ? 16 : mode === 2 ? page : 1)
}
export function zoomAt(width:number, offset:number, pointer:number, delta:number, days:number) {
  const dayWidth=Math.max(14,Math.min(84,width*Math.exp(-delta/500)))
  return {dayWidth,offset:Math.max(0,Math.min((days-1)*dayWidth,(offset+pointer)/width*dayWidth-pointer))}
}
