import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { categoryDefaults } from "@/lib/presentation/appearance";
import type { InboxItem } from "@/lib/domain/inbox";
import type { Dependency, Port, Task } from "@/lib/domain/schedule";
import type { TaskTrack } from "@/lib/domain/tracks";
import type { Point } from "@/features/timeline/dependency-routing";

export type Project = { id: string; name: string; color: string };
export type VisibleRow =
  | { kind: "task"; project: Project; task: Task; tasks: Task[] }
  | { kind: "add"; project: Project }
  | { kind: "insert"; project: Project; phase: "hint" | "ready" }
  | { kind: "summary"; project: Project; tasks: Task[] }
  | { kind: "empty"; project: Project };
export type PasteAnchor = { documentId: string; projectId: string; rowId?: string; order?: number; rowKind: "task" | "add" | "empty"; date: string };
export type RenderedConnection = { key: string; edge: Dependency; from: Point; to: Point; path: string; conflicts: boolean };
export type Schedule = { projects: Project[]; tasks: Task[]; edges: Dependency[]; tracks: TaskTrack[]; inbox: InboxItem[] };

const projectPalette = Object.values(categoryDefaults);

export const iso = (date: Date) => format(date, "yyyy-MM-dd");

export const statusForRange = (start: string, end: string): Task["status"] => {
  const today = iso(new Date());
  return end < today ? "已完成" : start > today ? "未开始" : "进行中";
};

export function initialProjects(): Project[] {
  return [
    { id: "p1", name: "示例项目 A", color: projectPalette[0] },
    { id: "p2", name: "示例项目 B", color: projectPalette[1] },
  ];
}

export function initialTasks(): Task[] {
  const today = startOfDay(new Date());
  return [
    { id: "t1", title: "示例事项 1", projectIds: ["p1"], order: {}, type: "论文", start: iso(addDays(today, -5)), end: iso(addDays(today, 2)), status: "已完成" },
    { id: "t2", title: "示例事项 2", projectIds: ["p1"], order: {}, type: "整理", start: iso(addDays(today, -1)), end: iso(addDays(today, 8)), status: "进行中" },
    { id: "t3", title: "示例事项 3", projectIds: ["p1"], order: {}, type: "算法/仿真", start: iso(addDays(today, 7)), end: iso(addDays(today, 17)), status: "未开始" },
    { id: "t4", title: "示例事项 4", projectIds: ["p1"], order: {}, type: "论文", start: iso(addDays(today, 14)), end: iso(addDays(today, 26)), status: "未开始" },
    { id: "t5", title: "示例事项 5", projectIds: ["p2"], order: {}, type: "工程", start: iso(addDays(today, 1)), end: iso(addDays(today, 6)), status: "进行中" },
    { id: "t6", title: "示例里程碑", projectIds: ["p2"], order: {}, type: "idea与思考", start: iso(addDays(today, 11)), end: iso(addDays(today, 11)), status: "未开始", milestone: true },
  ];
}

export const emptyTask = (projectId = "p1"): Task => ({
  id: "",
  title: "",
  memo: "",
  outputs: [],
  projectIds: [projectId],
  order: {},
  type: "算法/仿真",
  start: iso(new Date()),
  end: iso(addDays(new Date(), 3)),
  status: "未开始",
});

export const duration = (task: Task) => Math.max(0, differenceInCalendarDays(new Date(task.end + "T00:00:00"), new Date(task.start + "T00:00:00")));
export const portDay = (port: Port, task: Task) => Math.min(duration(task), Math.max(0, port.day));
export const portDate = (port: Port, task: Task) => iso(addDays(new Date(task.start + "T00:00:00"), portDay(port, task)));

export function initialEdges(): Dependency[] {
  const tasks = initialTasks();
  return [["t1", "t2"], ["t2", "t3"], ["t3", "t4"], ["t5", "t6"]].map(([source, target]) => ({
    id: source + "-" + target,
    source: { taskId: source, day: duration(tasks.find(task => task.id === source)!), side: "bottom" },
    target: { taskId: target, day: 0, side: "top" },
  }));
}

export const nextProjectColor = (projectCount: number) => projectPalette[projectCount % projectPalette.length];
