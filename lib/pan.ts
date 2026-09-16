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
