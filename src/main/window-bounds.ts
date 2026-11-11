export function initialWindowBounds(area: {x:number;y:number;width:number;height:number}) {
  const width=Math.min(1707,area.width),height=Math.min(890,area.height)
  return {x:area.x+Math.floor((area.width-width)/2),y:area.y+Math.floor((area.height-height)/2),width,height}
}
