export const PROJECT_COLUMN_WIDTH = 160;
export const TASK_COLUMN_DEFAULT = 260;
export const TASK_COLUMN_MIN = 180;
export const TASK_COLUMN_MAX = 420;
export const TIMELINE_VISIBLE_MIN = 320;
export const COLLAPSED_PROJECT_HEIGHT = 22;

export function collapsedSummaryBounds(barHeight:number){
  const height=Math.min(barHeight,COLLAPSED_PROJECT_HEIGHT-4);
  return {top:(COLLAPSED_PROJECT_HEIGHT-height)/2,bottom:(COLLAPSED_PROJECT_HEIGHT+height)/2,height};
}

export function clampTaskColumnWidth(width: number, viewportWidth: number) {
  const availableMax = Math.max(
    TASK_COLUMN_MIN,
    viewportWidth - PROJECT_COLUMN_WIDTH - TIMELINE_VISIBLE_MIN,
  );
  return Math.round(
    Math.max(TASK_COLUMN_MIN, Math.min(width, TASK_COLUMN_MAX, availableMax)),
  );
}
