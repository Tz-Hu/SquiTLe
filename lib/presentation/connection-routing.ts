export type RoutePoint = { x: number; y: number };
export type RouteRect = { left: number; right: number; top: number; bottom: number };

export function obstaclesNearRoute(
  start: RoutePoint,
  end: RoutePoint,
  obstacles: RouteRect[],
  margin: number,
): RouteRect[] {
  const left = Math.min(start.x, end.x) - margin;
  const right = Math.max(start.x, end.x) + margin;
  const top = Math.min(start.y, end.y) - margin;
  const bottom = Math.max(start.y, end.y) + margin;
  return obstacles.filter(rect =>
    rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom,
  );
}
