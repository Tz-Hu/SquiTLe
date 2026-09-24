// The calendar window owns the scroll range; offscreen tasks never extend it.
export function windowScrollLimit(calendarWidth: number, viewportWidth: number, frozenWidth = 420) {
  return Math.max(0, frozenWidth + calendarWidth - viewportWidth);
}

// Rebase at whole columns to preserve date/header alignment and subpixel motion.
export function panViewport(scrollLeft: number, movement: number, maxScroll: number, cellWidth: number) {
  const desired = scrollLeft - movement;
  const columns = desired < 0 ? Math.floor(desired / cellWidth) : desired > maxScroll ? Math.ceil((desired - maxScroll) / cellWidth) : 0;
  return { columns, scrollLeft: desired - columns * cellWidth };
}

// Preserve the horizontal component of diagonal trackpad gestures. Browsers that
// already translate Shift+wheel into deltaX must not have it applied twice.
export function horizontalWheelDelta(deltaX:number,deltaY:number,shiftKey:boolean,deltaMode:number,viewportWidth:number){
  const horizontal=deltaX!==0?deltaX:shiftKey?deltaY:0;
  if(!horizontal)return 0;
  const scale=deltaMode===1?16:deltaMode===2?viewportWidth:1;
  return horizontal*scale;
}

// Null means native scrolling owns this event. At an edge preserve the full
// requested date displacement, then replenish the buffer in both directions.
export function wheelBoundaryPan(scrollLeft:number,delta:number,maxScroll:number,cellWidth:number){
  if(!delta||maxScroll<=0)return null;
  const desired=scrollLeft+delta;
  if(desired>=0&&desired<=maxScroll)return null;
  const next=panViewport(scrollLeft,-delta,maxScroll,cellWidth);
  const recenterColumns=Math.trunc((next.scrollLeft-maxScroll/2)/cellWidth);
  return {columns:next.columns+recenterColumns,scrollLeft:next.scrollLeft-recenterColumns*cellWidth};
}
