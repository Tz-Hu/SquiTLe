import { layoutTokens } from "@/lib/presentation/appearance";

export type Point = { x: number; y: number };
export type Rect = { left: number; right: number; top: number; bottom: number };

const segmentIsClear = (a: Point, b: Point, obstacles: Rect[]) => {
  if (a.x === b.x) {
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    return obstacles.every(rect => !(a.x > rect.left && a.x < rect.right && Math.max(top, rect.top) < Math.min(bottom, rect.bottom)));
  }
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  return obstacles.every(rect => !(a.y > rect.top && a.y < rect.bottom && Math.max(left, rect.left) < Math.min(right, rect.right)));
};

export const routeAroundTasks = (start: Point, end: Point, obstacles: Rect[]) => {
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(rect => [rect.left, rect.right])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(rect => [rect.top, rect.bottom])])].sort((a, b) => a - b);
  const points = xs.flatMap(x => ys.map(y => ({ x, y }))).filter(point => obstacles.every(rect => !(point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom)));
  const index = new Map(points.map((point, i) => [`${point.x},${point.y}`, i]));
  const neighbors = points.map(() => [] as number[]);

  for (const x of xs) {
    const column = points.map((point, i) => ({ point, i })).filter(item => item.point.x === x).sort((a, b) => a.point.y - b.point.y);
    for (let i = 1; i < column.length; i++) {
      if (segmentIsClear(column[i - 1].point, column[i].point, obstacles)) {
        neighbors[column[i - 1].i].push(column[i].i);
        neighbors[column[i].i].push(column[i - 1].i);
      }
    }
  }
  for (const y of ys) {
    const row = points.map((point, i) => ({ point, i })).filter(item => item.point.y === y).sort((a, b) => a.point.x - b.point.x);
    for (let i = 1; i < row.length; i++) {
      if (segmentIsClear(row[i - 1].point, row[i].point, obstacles)) {
        neighbors[row[i - 1].i].push(row[i].i);
        neighbors[row[i].i].push(row[i - 1].i);
      }
    }
  }

  const startIndex = index.get(`${start.x},${start.y}`);
  const endIndex = index.get(`${end.x},${end.y}`);
  if (startIndex === undefined || endIndex === undefined) return [start, end];

  type Direction = "horizontal" | "vertical" | "start";
  const distance = new Map<string, number>([[`${startIndex}:start`, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set<string>([`${startIndex}:start`]);
  let finish = "";

  while (pending.size) {
    const current = [...pending].reduce((best, key) => (distance.get(key) ?? Infinity) < (distance.get(best) ?? Infinity) ? key : best);
    pending.delete(current);
    const [nodeText, directionText] = current.split(":");
    const node = Number(nodeText);
    const direction = directionText as Direction;
    if (node === endIndex) {
      finish = current;
      break;
    }
    for (const next of neighbors[node]) {
      const nextDirection: Direction = points[node].x === points[next].x ? "vertical" : "horizontal";
      const length = Math.abs(points[node].x - points[next].x) + Math.abs(points[node].y - points[next].y);
      const nextKey = `${next}:${nextDirection}`;
      const score = (distance.get(current) || 0) + length + (direction !== "start" && direction !== nextDirection ? 24 : 0);
      if (score < (distance.get(nextKey) ?? Infinity)) {
        distance.set(nextKey, score);
        previous.set(nextKey, current);
        pending.add(nextKey);
      }
    }
  }

  if (!finish) return [start, end];
  const route: Point[] = [];
  for (let key: string | undefined = finish; key; key = previous.get(key)) route.push(points[Number(key.split(":")[0])]);
  route.reverse();
  return route.filter((point, i) => i === 0 || i === route.length - 1 || !((route[i - 1].x === point.x && point.x === route[i + 1].x) || (route[i - 1].y === point.y && point.y === route[i + 1].y)));
};

export const smoothRoute = (points: Point[], radius = layoutTokens.cornerRadius, arrowSize = layoutTokens.arrowSize) => {
  const route = points.filter((point, i) => i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  if (route.length < 2) return "";
  let path = `M ${route[0].x} ${route[0].y}`;
  for (let i = 1; i < route.length - 1; i++) {
    const previous = route[i - 1];
    const corner = route[i];
    const next = route[i + 1];
    const incoming = Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y);
    const outgoing = Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y);
    const curve = Math.min(radius, incoming / 2, outgoing / 2, i === route.length - 2 ? Math.max(0, outgoing - arrowSize) : radius);
    const entry = { x: corner.x - Math.sign(corner.x - previous.x) * curve, y: corner.y - Math.sign(corner.y - previous.y) * curve };
    const exit = { x: corner.x + Math.sign(next.x - corner.x) * curve, y: corner.y + Math.sign(next.y - corner.y) * curve };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const end = route[route.length - 1];
  return `${path} L ${end.x} ${end.y}`;
};
