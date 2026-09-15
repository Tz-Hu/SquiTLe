// Rebase at whole columns to preserve date/header alignment and subpixel motion.
export function panViewport(scrollLeft: number, movement: number, maxScroll: number, cellWidth: number) {
  const desired = scrollLeft - movement;
  const columns = desired < 0 ? Math.floor(desired / cellWidth) : desired > maxScroll ? Math.ceil((desired - maxScroll) / cellWidth) : 0;
  return { columns, scrollLeft: desired - columns * cellWidth };
}
