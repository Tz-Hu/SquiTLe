// Both rendered date nodes and persisted dependency endpoints use this geometry.
export function foldedSide(start:number,end:number,viewStart:number,viewEnd:number,completed:boolean,milestone:boolean):"past"|"future"|null {
  if(completed||milestone)return null;
  return end<=viewStart?"past":start>=viewEnd?"future":null;
}
export function expandedInset(size:number,scale:number){return Math.max(0,size*(Math.max(1,scale)-1)/2);}
export function portOffset(day:number,pixelsPerDay:number,width:number,milestone=false){
  if(milestone)return width/2;
  const inset=Math.min(7,pixelsPerDay/4,width/2);
  return Math.max(inset,Math.min(width-inset,(day+.5)*pixelsPerDay));
}
export function taskBarWidth(dayCount:number,pixelsPerDay:number){
  return Math.max(pixelsPerDay*.7,dayCount*pixelsPerDay-Math.min(6,pixelsPerDay*.15));
}
export function visiblePortDays(lastDay:number,left:number,pixelsPerDay:number,viewStart:number,viewEnd:number){
  const first=Math.max(0,Math.floor((viewStart-left)/pixelsPerDay));
  const last=Math.min(lastDay,Math.ceil((viewEnd-left)/pixelsPerDay));
  return Array.from({length:Math.max(0,last-first+1)},(_,i)=>first+i);
}
