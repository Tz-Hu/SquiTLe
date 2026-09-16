export function visibleMonthSegment(start:number,width:number,scroll:number,viewport:number){
  const left=Math.max(start,scroll);
  const right=Math.min(start+width,scroll+Math.max(0,viewport));
  return {left:left-start,width:Math.max(0,right-left)};
}
