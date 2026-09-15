"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Circle, Diamond, GripVertical, Link2, Plus, RotateCcw, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { transferTask, relatedDepths, hasCycle, type Task, type TaskType, type Dependency, type Port, type TransferMode } from "@/lib/schedule";
import { historyOf, commit, undo, redo } from "@/lib/history";
import { flushSync } from "react-dom";
import { panViewport } from "@/lib/pan";

type Project = { id: string; name: string; color: string };
type VisibleRow = { kind: "task"; project: Project; task: Task } | { kind: "summary"; project: Project; tasks: Task[] } | { kind: "empty"; project: Project };
type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };
const colors: Record<string, string> = { 论文: "#1d4ed8", 实验: "#d97706", 工程: "#0f766e", 其他: "#6d5bd0" };
const projectPalette = ["#2563eb", "#7c3aed", "#0f766e", "#d97706"];
const iso = (date: Date) => format(date, "yyyy-MM-dd");

const segmentIsClear = (a: Point, b: Point, obstacles: Rect[]) => {
  if (a.x === b.x) {
    const top = Math.min(a.y, b.y); const bottom = Math.max(a.y, b.y);
    return obstacles.every(rect => !(a.x > rect.left && a.x < rect.right && Math.max(top, rect.top) < Math.min(bottom, rect.bottom)));
  }
  const left = Math.min(a.x, b.x); const right = Math.max(a.x, b.x);
  return obstacles.every(rect => !(a.y > rect.top && a.y < rect.bottom && Math.max(left, rect.left) < Math.min(right, rect.right)));
};

const routeAroundTasks = (start: Point, end: Point, obstacles: Rect[]) => {
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(rect => [rect.left, rect.right])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(rect => [rect.top, rect.bottom])])].sort((a, b) => a - b);
  const points = xs.flatMap(x => ys.map(y => ({ x, y }))).filter(point => obstacles.every(rect => !(point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom)));
  const index = new Map(points.map((point, i) => [`${point.x},${point.y}`, i]));
  const neighbors = points.map(() => [] as number[]);
  for (const x of xs) {
    const column = points.map((point, i) => ({ point, i })).filter(item => item.point.x === x).sort((a, b) => a.point.y - b.point.y);
    for (let i = 1; i < column.length; i++) if (segmentIsClear(column[i - 1].point, column[i].point, obstacles)) { neighbors[column[i - 1].i].push(column[i].i); neighbors[column[i].i].push(column[i - 1].i); }
  }
  for (const y of ys) {
    const row = points.map((point, i) => ({ point, i })).filter(item => item.point.y === y).sort((a, b) => a.point.x - b.point.x);
    for (let i = 1; i < row.length; i++) if (segmentIsClear(row[i - 1].point, row[i].point, obstacles)) { neighbors[row[i - 1].i].push(row[i].i); neighbors[row[i].i].push(row[i - 1].i); }
  }

  const startIndex = index.get(`${start.x},${start.y}`); const endIndex = index.get(`${end.x},${end.y}`);
  if (startIndex === undefined || endIndex === undefined) return [start, end];
  type Direction = "horizontal" | "vertical" | "start";
  const distance = new Map<string, number>([[`${startIndex}:start`, 0]]);
  const previous = new Map<string, string>();
  const pending = new Set<string>([`${startIndex}:start`]);
  let finish = "";
  while (pending.size) {
    const current = [...pending].reduce((best, key) => (distance.get(key) ?? Infinity) < (distance.get(best) ?? Infinity) ? key : best);
    pending.delete(current);
    const [nodeText, directionText] = current.split(":"); const node = Number(nodeText); const direction = directionText as Direction;
    if (node === endIndex) { finish = current; break; }
    for (const next of neighbors[node]) {
      const nextDirection: Direction = points[node].x === points[next].x ? "vertical" : "horizontal";
      const length = Math.abs(points[node].x - points[next].x) + Math.abs(points[node].y - points[next].y);
      const nextKey = `${next}:${nextDirection}`;
      const score = (distance.get(current) || 0) + length + (direction !== "start" && direction !== nextDirection ? 24 : 0);
      if (score < (distance.get(nextKey) ?? Infinity)) { distance.set(nextKey, score); previous.set(nextKey, current); pending.add(nextKey); }
    }
  }
  if (!finish) return [start, end];
  const route: Point[] = [];
  for (let key: string | undefined = finish; key; key = previous.get(key)) route.push(points[Number(key.split(":")[0])]);
  route.reverse();
  return route.filter((point, i) => i === 0 || i === route.length - 1 || !((route[i - 1].x === point.x && point.x === route[i + 1].x) || (route[i - 1].y === point.y && point.y === route[i + 1].y)));
};

const smoothRoute = (points: Point[], radius = 18) => {
  const route = points.filter((point, i) => i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  if (route.length < 2) return "";
  let path = `M ${route[0].x} ${route[0].y}`;
  for (let i = 1; i < route.length - 1; i++) {
    const previous = route[i - 1]; const corner = route[i]; const next = route[i + 1];
    const incoming = Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y);
    const outgoing = Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y);
    const curve = Math.min(radius, incoming / 2, outgoing / 2);
    const entry = { x: corner.x - Math.sign(corner.x - previous.x) * curve, y: corner.y - Math.sign(corner.y - previous.y) * curve };
    const exit = { x: corner.x + Math.sign(next.x - corner.x) * curve, y: corner.y + Math.sign(next.y - corner.y) * curve };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const end = route[route.length - 1];
  return `${path} L ${end.x} ${end.y}`;
};

function initialProjects(): Project[] {
  return [
    { id: "p1", name: "具身导航论文", color: projectPalette[0] },
    { id: "p2", name: "机器人平台", color: projectPalette[1] },
  ];
}

function initialTasks(): Task[] {
  const today = startOfDay(new Date());
  return [
    { id: "t1", title: "相关工作梳理", projectIds: ["p1"], order: {}, type: "论文", start: iso(addDays(today, -5)), end: iso(addDays(today, 2)), status: "已完成" },
    { id: "t2", title: "基线模型复现", projectIds: ["p1"], order: {}, type: "工程", start: iso(addDays(today, -1)), end: iso(addDays(today, 8)), status: "进行中" },
    { id: "t3", title: "消融实验", projectIds: ["p1"], order: {}, type: "实验", start: iso(addDays(today, 7)), end: iso(addDays(today, 17)), status: "未开始" },
    { id: "t4", title: "论文初稿", projectIds: ["p1"], order: {}, type: "论文", start: iso(addDays(today, 14)), end: iso(addDays(today, 26)), status: "未开始" },
    { id: "t5", title: "传感器标定", projectIds: ["p2"], order: {}, type: "工程", start: iso(addDays(today, 1)), end: iso(addDays(today, 6)), status: "进行中" },
    { id: "t6", title: "组会汇报", projectIds: ["p2"], order: {}, type: "其他", start: iso(addDays(today, 11)), end: iso(addDays(today, 11)), status: "未开始", milestone: true },
  ];
}

const emptyTask = (projectId = "p1"): Task => ({ id: "", title: "", projectIds: [projectId], order: {}, type: "实验", start: iso(new Date()), end: iso(addDays(new Date(), 3)), status: "未开始" });

const duration = (task: Task) => Math.max(0, differenceInCalendarDays(new Date(task.end + "T00:00:00"), new Date(task.start + "T00:00:00")));
const portDay = (port: Port, task: Task) => Math.min(duration(task), Math.max(0, port.day));
const portDate = (port: Port, task: Task) => iso(addDays(new Date(task.start + "T00:00:00"), portDay(port, task)));
function initialEdges(): Dependency[] {
  const tasks = initialTasks();
  return [["t1","t2"],["t2","t3"],["t3","t4"],["t5","t6"]].map(([source,target]) => ({
    id: source + "-" + target, source: { taskId: source, day: duration(tasks.find(t => t.id === source)!), side: "bottom" },
    target: { taskId: target, day: 0, side: "top" },
  }));
}
type Schedule = { projects: Project[]; tasks: Task[]; edges: Dependency[] };
export default function Home() {
  const [history, setHistory] = useState(() => historyOf<Schedule>({ projects: initialProjects(), tasks: initialTasks(), edges: initialEdges() }));
  const { projects, tasks, edges } = history.present;
  const changeSchedule = useCallback((change: (state: Schedule) => Schedule) => setHistory(current => commit(current, change)), []);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{pointerId:number;startX:number;lastX:number;moved:boolean}|null>(null);
  const suppressPanClick = useRef(false);
  const [panning,setPanning] = useState(false);
  const [viewportWidth,setViewportWidth] = useState(1400);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState<"day" | "week">("day");
  const [anchor, setAnchor] = useState(() => addDays(startOfDay(new Date()), -7));
  const [editing, setEditing] = useState<Task | null>(null);
  const [editingEdges, setEditingEdges] = useState<Dependency[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transferMode, setTransferMode] = useState<TransferMode>("move");
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [rowDrag, setRowDrag] = useState<{ taskId: string; projectId: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingPort, setPendingPort] = useState<Port | null>(null);
  const [notice, setNotice] = useState("");
  const [editError, setEditError] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; startX: number; previewCells: number; moved: boolean } | null>(null);
  const [resize, setResize] = useState<{ id: string; edge: "start" | "end"; startX: number; previewDays: number; moved: boolean } | null>(null);
  const suppressEdit = useRef<string | null>(null);

  useEffect(() => {
    try {
      let restored: Schedule = { projects: initialProjects(), tasks: initialTasks(), edges: initialEdges() };
      const unified = localStorage.getItem("research-gantt-v2");
      if (unified) {
        const state = JSON.parse(unified);
        restored = { projects: state.projects, tasks: state.tasks, edges: state.edges };
        setCollapsedProjects(new Set(state.collapsed ?? []));
        setTransferMode(["move","copy","share"].includes(state.transferMode) ? state.transferMode : "move");
      } else {
        const savedProjects = localStorage.getItem("research-gantt-projects");
        const restoredProjects: Project[] = savedProjects ? JSON.parse(savedProjects) : initialProjects();
        const savedTasks = localStorage.getItem("research-gantt-tasks");
        const legacy: Array<Partial<Task> & { projectId?: string; project?: string; dependsOn?: string }> = savedTasks ? JSON.parse(savedTasks) : [];
        if (restoredProjects.length) restored.projects = restoredProjects;
        if (savedTasks) {
          const migrated: Task[] = legacy.map((task, i) => {
            const project = restoredProjects.some(p => p.id === task.projectId) ? task.projectId! : restoredProjects[0]?.id ?? "p1";
            return { id: task.id || crypto.randomUUID(), title: task.title || "未命名事项", projectIds: [project], order: { [project]: i },
              type: (task.type || task.project || "其他") as TaskType, start: task.start || iso(new Date()), end: task.end || task.start || iso(new Date()), status: task.status || "未开始", milestone: task.milestone };
          });
          restored.tasks = migrated;
          restored.edges = legacy.flatMap(task => {
            const source = migrated.find(t => t.id === task.dependsOn); const target = migrated.find(t => t.id === task.id);
            return source && target ? [{ id: crypto.randomUUID(), source: { taskId: source.id, day: duration(source), side: "bottom" as const }, target: { taskId: target.id, day: 0, side: "top" as const } }] : [];
          });
        }
        const collapsed = localStorage.getItem("research-gantt-collapsed-projects");
        if (collapsed) setCollapsedProjects(new Set(JSON.parse(collapsed)));
      }
      setHistory(historyOf(restored));
    } catch { setNotice("保存的数据未能读取，原始数据仍保留在浏览器中。"); return; }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem("research-gantt-v2", JSON.stringify({ projects, tasks, edges, collapsed: [...collapsedProjects], transferMode })); }
    catch { setNotice("浏览器未能保存，请检查存储空间。"); }
  }, [projects, tasks, edges, collapsedProjects, transferMode, ready]);
  useEffect(() => {
    const context = (document as unknown as { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({
      name: "create_research_task",
      title: "新建科研排期",
      description: "在当前科研甘特图中创建一个带起止日期的事项。",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "YYYY-MM-DD" },
          end: { type: "string", description: "YYYY-MM-DD" },
          projectId: { type: "string", description: "项目 ID；省略时加入第一个项目" },
          type: { type: "string", enum: ["论文", "实验", "工程", "其他"] },
        },
        required: ["title", "start", "end"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as Partial<Task> & { projectId?: string };
        if (value.projectId && !projects.some(project => project.id === value.projectId)) throw new Error("项目不存在");
        if (!value.title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(value.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(value.end || "")) throw new Error("事项名称与日期格式无效");
        const task: Task = { id: crypto.randomUUID(), title: value.title.trim(), start: value.start!, end: value.end! < value.start! ? value.start! : value.end!, projectIds: [value.projectId || projects[0]?.id || "p1"], order: { [value.projectId || projects[0]?.id || "p1"]: tasks.length }, type: value.type || "其他", status: "未开始" };
        changeSchedule(current => ({ ...current, tasks: [...current.tasks, task] }));
        return { id: task.id, status: "created" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [projects, tasks.length, changeSchedule]);

  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const cellWidth = zoom === "day" ? 54 : 82;
  const stepDays = zoom === "day" ? 1 : 7;
  const cellCount = Math.max(zoom === "day" ? 35 : 26, Math.ceil(viewportWidth/cellWidth)+14);
  const dates = useMemo(() => Array.from({ length: cellCount }, (_, i) => addDays(anchor, i * stepDays)), [anchor, cellCount, stepDays]);
  const monthGroups = useMemo(() => dates.reduce<Array<{ key: string; date: Date; count: number }>>((groups, date) => {
    const key = format(date, "yyyy-MM");
    const current = groups[groups.length - 1];
    if (current?.key === key) current.count += 1;
    else groups.push({ key, date, count: 1 });
    return groups;
  }, []), [dates]);
  const projectGroups = useMemo(() => projects.map(project => ({ project, tasks: tasks.filter(task => task.projectIds.includes(project.id)).sort((a, b) => (a.order[project.id] ?? 0) - (b.order[project.id] ?? 0)) })), [projects, tasks]);
  const visibleRows = useMemo<VisibleRow[]>(() => projectGroups.flatMap<VisibleRow>(group => !group.tasks.length
    ? [{ kind: "empty" as const, project: group.project }]
    : collapsedProjects.has(group.project.id)
      ? [{ kind: "summary" as const, project: group.project, tasks: group.tasks }]
      : group.tasks.map(task => ({ kind: "task" as const, project: group.project, task }))), [projectGroups, collapsedProjects]);
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button,input,select,textarea,[role="button"],[role="separator"]')) return;
    event.preventDefault(); suppressPanClick.current = false;
    pan.current = { pointerId:event.pointerId,startX:event.clientX,lastX:event.clientX,moved:false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = pan.current; const element = viewport.current;
    if (!active || active.pointerId !== event.pointerId || !element) return;
    if (!active.moved && Math.abs(event.clientX-active.startX)<4) return;
    event.preventDefault(); active.moved = true; setPanning(true); setHoveredTask(null);
    const next = panViewport(element.scrollLeft,event.clientX-active.lastX,element.scrollWidth-element.clientWidth,cellWidth);
    active.lastX = event.clientX;
    // Update the calendar origin and scroll offset together before the next paint.
    if (next.columns) flushSync(() => setAnchor(current=>addDays(current,next.columns*stepDays)));
    element.scrollLeft = next.scrollLeft;
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = pan.current;
    if (!active || active.pointerId !== event.pointerId) return;
    suppressPanClick.current = active.moved;
    pan.current = null; setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(()=>{suppressPanClick.current=false;},0);
  };
  const totalWidth = cellCount * cellWidth;
  const todayOffset = differenceInCalendarDays(startOfDay(new Date()), anchor) / stepDays;
  const taskGeometry = (task: Task) => {
    const start = differenceInCalendarDays(new Date(task.start + "T00:00:00"), anchor) / stepDays;
    const duration = Math.max(1, (differenceInCalendarDays(new Date(task.end + "T00:00:00"), new Date(task.start + "T00:00:00")) + 1) / stepDays);
    return { left: start * cellWidth, width: Math.max(task.milestone ? 28 : cellWidth * .7, duration * cellWidth - 6) };
  };

  const saveTask = () => {
    if (!editing?.title.trim() || !editing.start || !editing.end) { setEditError("请填写事项名称和起止日期。"); return; }
    const normalized = { ...editing, title: editing.title.trim(), end: editing.end < editing.start ? editing.start : editing.end };
    const allEdges = [...edges.filter(edge => edge.source.taskId !== editing.id && edge.target.taskId !== editing.id), ...editingEdges];
    if (hasCycle(allEdges)) { setEditError("这些关系会形成循环依赖，请调整前置或后接任务。"); return; }
    changeSchedule(current => ({ ...current, tasks: current.tasks.some(task => task.id === normalized.id) ? current.tasks.map(task => task.id === normalized.id ? normalized : task) : [...current.tasks, normalized], edges: allEdges }));
    setEditing(null); setEditingEdges([]); setEditError("");
  };
  const saveProject = () => {
    const name = newProjectName.trim();
    if (!name || projects.some(project => project.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    const projectId = crypto.randomUUID();
    changeSchedule(current => ({ ...current, projects: [...current.projects, { id: projectId, name, color: projectPalette[current.projects.length % projectPalette.length] }] }));
    setNewProjectName("");
    setNewProjectOpen(false);
  };
  const shiftTask = (task: Task, days: number) => ({ ...task, start: iso(addDays(new Date(task.start + "T00:00:00"), days)), end: iso(addDays(new Date(task.end + "T00:00:00"), days)) });
  const moveDrag = (event: React.PointerEvent, task: Task) => {
    if (!drag || drag.id !== task.id) return;
    const distance = event.clientX - drag.startX;
    const cells = Math.round(distance / cellWidth);
    setDrag({ ...drag, previewCells: cells, moved: drag.moved || Math.abs(distance) > 4 });
  };
  const finishDrag = (event: React.PointerEvent, task: Task) => {
    if (!drag || drag.id !== task.id) return;
    const distance = event.clientX - drag.startX;
    const cells = Math.round(distance / cellWidth);
    if (cells) changeSchedule(current => ({ ...current, tasks: current.tasks.map(t => t.id === task.id ? shiftTask(t, cells * stepDays) : t) }));
    if (drag.moved || Math.abs(distance) > 4) {
      suppressEdit.current = task.id;
      window.setTimeout(() => { if (suppressEdit.current === task.id) suppressEdit.current = null; }, 0);
    }
    setDrag(null);
  };
  const moveResize = (event: React.PointerEvent, task: Task) => {
    if (!resize || resize.id !== task.id) return;
    const distance = event.clientX - resize.startX;
    const snappedDays = Math.round(distance / cellWidth) * stepDays;
    const durationDays = differenceInCalendarDays(new Date(task.end + "T00:00:00"), new Date(task.start + "T00:00:00"));
    const previewDays = resize.edge === "start" ? Math.min(snappedDays, durationDays) : Math.max(snappedDays, -durationDays);
    setResize({ ...resize, previewDays, moved: resize.moved || Math.abs(distance) > 4 });
  };
  const finishResize = (event: React.PointerEvent, task: Task) => {
    if (!resize || resize.id !== task.id) return;
    const distance = event.clientX - resize.startX;
    const snappedDays = Math.round(distance / cellWidth) * stepDays;
    const durationDays = differenceInCalendarDays(new Date(task.end + "T00:00:00"), new Date(task.start + "T00:00:00"));
    const days = resize.edge === "start" ? Math.min(snappedDays, durationDays) : Math.max(snappedDays, -durationDays);
    if (days) changeSchedule(current => ({ ...current, tasks: current.tasks.map(item => item.id !== task.id ? item : resize.edge === "start" ? { ...item, start: iso(addDays(new Date(item.start + "T00:00:00"), days)) } : { ...item, end: iso(addDays(new Date(item.end + "T00:00:00"), days)) }) }));
    if (resize.moved || Math.abs(distance) > 4) {
      suppressEdit.current = task.id;
      window.setTimeout(() => { if (suppressEdit.current === task.id) suppressEdit.current = null; }, 0);
    }
    setResize(null);
  };
  const selectTask = (event: React.MouseEvent, task: Task) => {
    event.stopPropagation();
    if (suppressEdit.current === task.id || rowDrag || drag?.moved || resize?.moved) return;
    setSelectedTask(task.id); setSelectedEdge(null);
  };
  const deleteTask = useCallback((id: string) => {
    changeSchedule(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id), edges: current.edges.filter(edge => edge.source.taskId !== id && edge.target.taskId !== id) }));
    setSelectedTask(null); setHoveredTask(null); setPendingPort(null);
    setNotice("事项及其关系已删除（共享事项会从所有项目删除）。Ctrl+Z 可撤销。");
  }, [changeSchedule]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || event.isComposing || target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="menu"],[role="listbox"]') || editing || newProjectOpen || settingsOpen || !ready) return;
      if (drag || resize || rowDrag || pan.current) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (key === "z" || key === "y")) {
        event.preventDefault();
        setHistory(current => key === "y" || event.shiftKey ? redo(current) : undo(current));
        setSelectedTask(null); setSelectedEdge(null); setHoveredTask(null); setPendingPort(null); setNotice("");
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && (key === "delete" || key === "backspace") && (selectedTask || selectedEdge)) {
        event.preventDefault();
        if (!event.repeat) {
          if (selectedEdge) { changeSchedule(current=>({...current,edges:current.edges.filter(edge=>edge.id!==selectedEdge)})); setSelectedEdge(null); setNotice("连线已删除，Ctrl+Z 可恢复。"); }
          else if (selectedTask) deleteTask(selectedTask);
        }
      } else if (key === "escape") { setSelectedTask(null); setSelectedEdge(null); setPendingPort(null); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedTask, selectedEdge, changeSchedule, deleteTask, editing, newProjectOpen, settingsOpen, ready, drag, resize, rowDrag]);
  const openTask = (task: Task) => {
    if (suppressEdit.current === task.id) { suppressEdit.current = null; return; }
    setSelectedTask(task.id); setSelectedEdge(null);
    setEditing({ ...task });
    setEditingEdges(edges.filter(edge => edge.source.taskId === task.id || edge.target.taskId === task.id)); setEditError("");
  };
  const addTaskToProject = (projectId: string) => {
    setCollapsedProjects(current => { const next = new Set(current); next.delete(projectId); return next; });
    setEditing({ ...emptyTask(projectId), id: crypto.randomUUID(), order: { [projectId]: tasks.length } }); setEditError("");
    setEditingEdges([]);
  };
  const toggleProject = (projectId: string) => setCollapsedProjects(current => {
    const next = new Set(current);
    if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
    return next;
  });
  const reset = () => { const freshProjects = initialProjects(); const freshTasks = initialTasks(); changeSchedule(() => ({ projects: freshProjects, tasks: freshTasks, edges: initialEdges() })); setSelectedTask(null); setCollapsedProjects(new Set()); };
  const displayGeometry = (task: Task) => {
    const activeResize = resize?.id === task.id ? resize : null;
    const previewTask = activeResize ? activeResize.edge === "start"
      ? { ...task, start: iso(addDays(new Date(task.start + "T00:00:00"), activeResize.previewDays)) }
      : { ...task, end: iso(addDays(new Date(task.end + "T00:00:00"), activeResize.previewDays)) }
      : task;
    const geometry = taskGeometry(previewTask);
    return drag?.id === task.id ? { ...geometry, left: geometry.left + drag.previewCells * cellWidth } : geometry;
  };
  const summaryTask = (row: Extract<VisibleRow, { kind: "summary" }>): Task => ({
    id: `summary-${row.project.id}`, title: row.project.name, projectIds: [row.project.id], order: {}, type: "其他",
    start: row.tasks.reduce((earliest, task) => task.start < earliest ? task.start : earliest, row.tasks[0].start),
    end: row.tasks.reduce((latest, task) => task.end > latest ? task.end : latest, row.tasks[0].end),
    status: row.tasks.every(task => task.status === "已完成") ? "已完成" : row.tasks.some(task => task.status === "进行中") ? "进行中" : "未开始",
  });
  const connections = useMemo(() => {
    const geometry = (row: VisibleRow) => row.kind === "task" ? displayGeometry(row.task) : row.kind === "summary" ? taskGeometry(summaryTask(row)) : { left: 0, width: 0 };
    const clearance = 10;
    const obstacles = visibleRows.flatMap((row, i) => row.kind === "empty" ? [] : [{ left: geometry(row).left - clearance, right: geometry(row).left + geometry(row).width + clearance, top: i * 64 + 14 - clearance, bottom: i * 64 + 50 + clearance }]);
    const rowsFor = (id: string) => visibleRows.flatMap((row, i) => (row.kind === "task" ? row.task.id === id : row.kind === "summary" && row.tasks.some(t => t.id === id)) ? [i] : []);
    const pointFor = (port: Port, rowIndex: number) => {
      const row = visibleRows[rowIndex]; const g = geometry(row);
      const task = row.kind === "task" ? row.task : row.kind === "summary" ? summaryTask(row) : undefined;
      const original = tasks.find(t => t.id === port.taskId);
      const days = task && original ? differenceInCalendarDays(new Date(portDate(port, original) + "T00:00:00"), new Date(task.start + "T00:00:00")) : 0;
      const x = g.left + Math.max(7, Math.min(g.width - 7, (days + .5) * cellWidth / stepDays));
      const y = rowIndex * 64 + (port.side === "top" ? 14 : 50);
      return { x, y };
    };
    return edges.flatMap(edge => {
      const sources = rowsFor(edge.source.taskId); const targets = rowsFor(edge.target.taskId);
      const source = tasks.find(t => t.id === edge.source.taskId); const target = tasks.find(t => t.id === edge.target.taskId);
      if (!source || !target) return [];
      const pairs = new Map<string, [number, number]>();
      const nearest = (i: number, options: number[]) => [...options].sort((a,b) => Number(visibleRows[b].project.id === visibleRows[i].project.id) - Number(visibleRows[a].project.id === visibleRows[i].project.id) || Math.abs(a-i)-Math.abs(b-i))[0];
      sources.forEach(i => { const j = nearest(i,targets); if(j !== undefined && i !== j) pairs.set(i+"-"+j,[i,j]); });
      targets.forEach(j => { const i = nearest(j,sources); if(i !== undefined && i !== j) pairs.set(i+"-"+j,[i,j]); });
      return [...pairs].map(([key,[i,j]]) => {
        const from = pointFor(edge.source,i); const to = pointFor(edge.target,j);
        const outsideFrom = { x: from.x, y: from.y + (edge.source.side === "top" ? -clearance : clearance) };
        const outsideTo = { x: to.x, y: to.y + (edge.target.side === "top" ? -clearance : clearance) };
        const route = routeAroundTasks(outsideFrom,outsideTo,obstacles);
        return { key: edge.id+"-"+key, edge, from, to, path: smoothRoute([from,...route,to],8), conflicts: portDate(edge.target,target) < portDate(edge.source,source) };
      });
    });
  }, [visibleRows, tasks, edges, drag, resize, anchor, cellWidth, stepDays]);
  const depths = useMemo(() => relatedDepths(hoveredTask, edges), [hoveredTask, edges]);
  const highlight = (id: string) => {
    if (id === selectedTask) return { opacity: 1, outline: "3px solid #172554", outlineOffset: "3px" };
    if (!hoveredTask) return {};
    const depth = depths.get(id);
    return { opacity: depth === undefined ? .3 : Math.max(.5, 1 - depth * .14), boxShadow: depth === undefined ? undefined : "0 0 0 " + (depth === 0 ? 3 : 2) + "px rgba(37,99,235," + (depth === 0 ? .65 : Math.max(.08,.35/(depth+1))) + ")" };
  };
  const drop = (projectId: string, before?: string) => {
    if (!rowDrag) return;
    const copyId = crypto.randomUUID();
    changeSchedule(current => ({ ...current, tasks: transferTask(current.tasks,rowDrag.taskId,rowDrag.projectId,projectId,before,transferMode,copyId) }));
    setCollapsedProjects(current => { const next = new Set(current); next.delete(projectId); return next; });
    setRowDrag(null); setDropTarget(null);
  };
  const choosePort = (event: React.MouseEvent<HTMLElement>, task: Task, side: Port["side"]) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const day = Math.max(0,Math.min(duration(task),Math.floor((event.clientX-rect.left) / rect.width * (duration(task)+1))));
    const port: Port = { taskId: task.id, day, side };
    if (!pendingPort) { setPendingPort(port); return; }
    if (pendingPort.taskId === task.id) { setPendingPort(port); return; }
    const edge: Dependency = { id: crypto.randomUUID(), source: pendingPort, target: port };
    if (hasCycle([...edges,edge])) { setNotice("这条连线会形成循环依赖，请选择其他事项。"); return; }
    changeSchedule(current => ({ ...current, edges: [...current.edges,edge] })); setPendingPort(null); setNotice("");
  };
  const relationEditor = (direction: "source" | "target") => {
    if (!editing) return null;
    const own = direction === "source" ? "target" : "source";
    const selected = editingEdges.filter(edge => edge[own].taskId === editing.id);
    return <div className="grid gap-2"><Label>{direction === "source" ? "前置任务（多选）" : "后接任务（多选）"}</Label>
      <Select value="" onValueChange={id => {
        const other = tasks.find(task => task.id === id)!;
        const source = direction === "source" ? other : editing; const target = direction === "source" ? editing : other;
        setEditingEdges(current => [...current,{ id: crypto.randomUUID(),source: {taskId:source.id,day:duration(source),side:"bottom"},target:{taskId:target.id,day:0,side:"top"} }]);
      }}><SelectTrigger><SelectValue placeholder="＋ 添加关联任务" /></SelectTrigger><SelectContent>{tasks.filter(task => task.id !== editing.id).map(task => <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>)}</SelectContent></Select>
      {selected.map(edge => <div key={edge.id} className="rounded-lg border p-3 text-sm">
        <div className="mb-2 flex items-center justify-between"><span>{tasks.find(task => task.id === edge[direction].taskId)?.title}</span><button aria-label="移除关系" onClick={() => setEditingEdges(current => current.filter(item => item.id !== edge.id))}><X size={15}/></button></div>
        {(["source","target"] as const).map(end => { const task = edge[end].taskId === editing.id ? editing : tasks.find(t => t.id === edge[end].taskId); if(!task) return null; return <div key={end} className="mb-2 grid grid-cols-[36px_1fr_76px] items-center gap-2">
          <span>{end === "source" ? "输出" : "输入"}</span>
          <Input aria-label={end === "source" ? "输出日期" : "输入日期"} type="date" min={task.start} max={task.end} value={portDate(edge[end],task)} onChange={event => { if(!event.target.value)return; const day=differenceInCalendarDays(new Date(event.target.value+"T00:00:00"),new Date(task.start+"T00:00:00")); setEditingEdges(current=>current.map(item=>item.id===edge.id?{...item,[end]:{...item[end],day:Math.max(0,Math.min(duration(task),day))}}:item)); }}/>
          <Select value={edge[end].side} onValueChange={side=>setEditingEdges(current=>current.map(item=>item.id===edge.id?{...item,[end]:{...item[end],side:side as Port["side"]}}:item))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="top">顶部</SelectItem><SelectItem value="bottom">底部</SelectItem></SelectContent></Select>
        </div>; })}
      </div>)}
    </div>;
  };

  return <main onClick={event => { if (!(event.target as Element).closest("button,input,select,textarea,[role]")) {setSelectedTask(null);setSelectedEdge(null);} }} className="min-h-screen bg-[#f5f7fb] text-[#172033]">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce2ec] bg-white px-5 py-4 lg:px-8">
      <div className="flex items-center gap-3"><DropdownMenu><DropdownMenuTrigger asChild><button aria-label="展开菜单" className="flex h-10 items-center gap-1 rounded-xl bg-[#172554] px-3 text-white shadow-sm"><CalendarDays size={20}/><ChevronDown size={13}/></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-44 bg-white"><DropdownMenuItem onSelect={() => setSettingsOpen(true)}><Settings size={16}/>设置</DropdownMenuItem></DropdownMenuContent></DropdownMenu><div><h1 className="text-lg font-bold tracking-tight">科研排期</h1><p className="text-sm text-[#68738a]">把研究计划放到同一条时间线上</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setAnchor(addDays(anchor, zoom === "day" ? -7 : -28))} aria-label="上一段"><ChevronLeft /></Button>
        <Button variant="outline" onClick={() => {setAnchor(addDays(startOfDay(new Date()), -7)); if(viewport.current)viewport.current.scrollLeft=0;}}>今天</Button>
        <Button variant="ghost" size="icon" onClick={() => setAnchor(addDays(anchor, zoom === "day" ? 7 : 28))} aria-label="下一段"><ChevronRight /></Button>
        <Tabs value={zoom} onValueChange={v => setZoom(v as "day" | "week")}><TabsList className="bg-[#e9edf5]"><TabsTrigger value="day">日</TabsTrigger><TabsTrigger value="week">周</TabsTrigger></TabsList></Tabs>
        <Button className="bg-[#1d4ed8] hover:bg-[#1e40af]" onClick={() => { setNewProjectName(""); setNewProjectOpen(true); }}><Plus />新项目</Button>
      </div>
    </header>
    <section className="px-4 py-5 lg:px-8">
      {(notice || pendingPort) && <div role="status" className="mb-3 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800"><span>{pendingPort ? "已选输出节点，请点击另一事项顶部或底部的日期位置作为输入。" : notice}</span><button onClick={() => {setPendingPort(null);setNotice("");}} aria-label="取消"><X size={16}/></button></div>}
      <div className="mb-3 flex items-center justify-between text-sm text-[#68738a]"><p>拖动空白平移时间 · 单击事项/连线选中 · 双击事项编辑 · Delete 删除 · Ctrl+Z 撤销</p><button onClick={reset} className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-white hover:text-[#172033]"><RotateCcw size={14} />恢复示例</button></div>
      <div className="overflow-hidden rounded-2xl border border-[#d9e0eb] bg-white shadow-[0_10px_35px_rgba(25,39,75,.07)]"><div ref={viewport} className="overflow-x-auto" style={{overflowAnchor:"none"}}><div className="grid min-w-max" style={{ gridTemplateColumns: `160px 260px ${totalWidth}px` }}>
        <div className="sticky left-0 z-40 flex h-24 items-end border-b border-r border-[#d9e0eb] bg-[#f8faff] px-4 pb-3 text-sm font-semibold">项目</div>
        <div className="sticky left-[160px] z-30 flex h-24 items-end border-b border-r border-[#d9e0eb] bg-[#f8faff] px-4 pb-3 text-sm font-semibold">事项</div>
        <div className="relative h-24 border-b border-[#d9e0eb] bg-[#f8faff]"><div className="flex h-8 border-b border-[#d9e0eb]">{monthGroups.map((group, index) => <div key={group.key} className="flex shrink-0 items-center justify-center border-r border-[#d9e0eb] text-xs font-semibold text-[#4e5a70]" style={{ width: group.count * cellWidth }}>{format(group.date, index === 0 || group.date.getMonth() === 0 ? "yyyy年M月" : "M月")}</div>)}</div><div className="flex h-16">{dates.map(date => <div key={date.toISOString()} className={`shrink-0 border-r border-[#e7ebf2] px-2 pb-2 pt-2 ${format(date,"yyyy-MM-dd") === iso(new Date()) ? "bg-[#eaf1ff]" : ""}`} style={{ width: cellWidth }}><div className="text-[11px] font-medium uppercase text-[#8b95a8]">{zoom === "day" ? format(date, "EEE", { locale: zhCN }) : `第${format(date,"w")}周`}</div><div className="mt-1 text-sm font-semibold">{zoom === "day" ? format(date, "d") : format(date, "M/d")}</div></div>)}</div></div>
        <div className="sticky left-0 z-30 bg-white">{projectGroups.map(group => { const collapsed = collapsedProjects.has(group.project.id); const rowCount = !group.tasks.length || collapsed ? 1 : group.tasks.length; return <div key={group.project.id} onDragOver={event=>{if(rowDrag){event.preventDefault();setDropTarget(group.project.id);}}} onDrop={event=>{event.preventDefault();drop(group.project.id);}} className="relative border-b border-r border-[#d9e0eb] bg-[#fbfcfe] px-3 py-3" style={{ height: rowCount * 64, boxShadow: dropTarget === group.project.id ? "inset 0 0 0 2px #2563eb" : undefined }}><button onClick={() => group.tasks.length && toggleProject(group.project.id)} className="flex max-w-[112px] items-start gap-1.5 text-left" aria-expanded={group.tasks.length ? !collapsed : undefined}><ChevronDown size={15} className={`mt-0.5 shrink-0 text-[#68738a] transition-transform ${!group.tasks.length ? "opacity-20" : collapsed ? "-rotate-90" : ""}`} /><span className="min-w-0"><span className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-full" style={{ background: group.project.color }} /><span className="truncate text-sm font-semibold">{group.project.name}</span></span><span className="mt-1 block text-xs text-[#7b8598]">{group.tasks.length} 项工作</span></span></button><button onClick={() => addTaskToProject(group.project.id)} className="absolute right-2 top-3 grid size-8 place-items-center rounded-lg text-[#1d4ed8] transition hover:bg-[#eaf1ff]" aria-label={`在${group.project.name}中添加事项`} title="添加事项"><Plus size={17} /></button></div>; })}<div className="h-14 border-r border-[#e7ebf2]" /></div>
        <div className="sticky left-[160px] z-20 bg-white">{visibleRows.map(row => row.kind === "summary" ? <button key={`summary-${row.project.id}`} onClick={() => toggleProject(row.project.id)} className="flex h-16 w-full items-center border-b border-r border-[#e7ebf2] bg-[#f8faff] px-4 text-left hover:bg-[#f3f6fb]"><span><span className="block text-sm font-semibold">项目摘要</span><span className="mt-1 block text-xs text-[#778197]">{row.tasks.length} 项 · {format(new Date(summaryTask(row).start + "T00:00:00"), "M/d")}—{format(new Date(summaryTask(row).end + "T00:00:00"), "M/d")}</span></span></button> : row.kind === "empty" ? <button key={`empty-${row.project.id}`} onDragOver={event=>{if(rowDrag)event.preventDefault();}} onDrop={event=>{event.preventDefault();drop(row.project.id);}} onClick={() => addTaskToProject(row.project.id)} className="flex h-16 w-full items-center gap-2 border-b border-r border-dashed border-[#d9e0eb] px-4 text-sm font-medium text-[#1d4ed8] hover:bg-[#f6f8fc]"><Plus size={16} />添加第一个事项</button> : <button key={row.project.id + row.task.id}
          draggable onDragStart={event=>{setRowDrag({taskId:row.task.id,projectId:row.project.id});event.dataTransfer.setData("text/plain",row.task.id);event.dataTransfer.effectAllowed="copyMove";}}
          onDragEnd={()=>{setRowDrag(null);setDropTarget(null);}}
          onDragOver={event=>{if(rowDrag){event.preventDefault();const after=event.clientY>event.currentTarget.getBoundingClientRect().top+32;setDropTarget(row.project.id+":"+row.task.id+":"+(after?"after":"before"));}}}
          onDrop={event=>{event.preventDefault();const group=projectGroups.find(group=>group.project.id===row.project.id)!;const after=event.clientY>event.currentTarget.getBoundingClientRect().top+32;drop(row.project.id,after?group.tasks[group.tasks.findIndex(task=>task.id===row.task.id)+1]?.id:row.task.id);}}
          style={{...highlight(row.task.id), borderTop:dropTarget===row.project.id+":"+row.task.id+":before"?"2px solid #2563eb":undefined,borderBottom:dropTarget===row.project.id+":"+row.task.id+":after"?"2px solid #2563eb":undefined}}
          onClick={event => selectTask(event, row.task)} aria-pressed={selectedTask === row.task.id} onDoubleClick={() => openTask(row.task)} className="flex h-16 w-full items-center gap-3 border-b border-r border-[#e7ebf2] px-4 text-left transition hover:bg-[#f6f8fc]"><GripVertical size={15} className="shrink-0 text-[#aab2c1]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.task.title}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-[#778197]"><span className="size-2 rounded-full" style={{ background: colors[row.task.type] || colors.其他 }} />{row.task.type} · {row.task.status}{row.task.projectIds.length > 1 ? " · 共享" : ""}</span></span></button>)}<div className="h-14 border-r border-[#e7ebf2]" /></div>
        <div className={`relative select-none ${panning ? "cursor-grabbing" : "cursor-grab"}`} style={{ width: totalWidth, touchAction:"pan-y" }} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} onClickCapture={event=>{if(suppressPanClick.current){event.preventDefault();event.stopPropagation();suppressPanClick.current=false;}}}>
          {todayOffset >= 0 && todayOffset <= cellCount && <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[#ef4444]" style={{ left: todayOffset * cellWidth }}><span className="absolute -left-1 -top-1 size-2 rounded-full bg-[#ef4444]" /></div>}
          <svg className="pointer-events-none absolute inset-0 z-[25] h-full w-full overflow-visible" aria-label="事项依赖关系"><defs><marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#76839a" /></marker><marker id="conflict-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#e07a19" /></marker></defs>{connections.map(connection => {
            const related = depths.has(connection.edge.source.taskId) && depths.has(connection.edge.target.taskId);
            const depth = Math.max(depths.get(connection.edge.source.taskId) ?? 0,depths.get(connection.edge.target.taskId) ?? 0);
            const isSelected = selectedEdge === connection.edge.id;
            const stroke = isSelected ? "#172554" : hoveredTask && related ? "#2563eb" : connection.conflicts ? "#e07a19" : "#76839a";
            return <g key={connection.key} opacity={isSelected ? 1 : hoveredTask ? related ? Math.max(.4,1-depth*.15) : .12 : 1}>
              <path d={connection.path} fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
              <path d={connection.path} fill="none" stroke={stroke} strokeWidth={isSelected ? 3.5 : hoveredTask&&related?2.5:2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={connection.conflicts?"6 5":undefined} markerEnd={connection.conflicts?"url(#conflict-arrow)":"url(#arrow)"}/>
              <circle cx={connection.from.x} cy={connection.from.y} r={3.5} fill="white" stroke={stroke} strokeWidth={1.5}/>
              <circle cx={connection.to.x} cy={connection.to.y} r={3.5} fill="white" stroke={stroke} strokeWidth={1.5}/>
              <path d={connection.path} fill="none" stroke="transparent" strokeWidth="14" pointerEvents="stroke" className="cursor-pointer" role="button" tabIndex={0} aria-label="选中任务连接线" aria-pressed={isSelected}
                onClick={event=>{event.stopPropagation();setSelectedEdge(connection.edge.id);setSelectedTask(null);setHoveredTask(null);}}
                onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setSelectedEdge(connection.edge.id);setSelectedTask(null);setHoveredTask(null);}}}/>
            </g>;
          })}</svg>
          {visibleRows.map(row => { if (row.kind === "summary") { const task = summaryTask(row); const g = taskGeometry(task); return <div key={row.project.id + task.id} className="relative h-16 border-b border-[#e7ebf2]" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${cellWidth - 1}px, #edf0f5 ${cellWidth - 1}px, #edf0f5 ${cellWidth}px)` }}><button onClick={() => toggleProject(row.project.id)} className="absolute top-[16px] z-20 flex h-8 items-center rounded-lg border px-3 text-sm font-semibold shadow-sm" style={{ left: g.left, width: g.width, color: row.project.color, borderColor: `${row.project.color}66`, background: `${row.project.color}1f` }}><span className="truncate">{row.project.name} · {row.tasks.length} 项</span></button></div>; } if (row.kind === "empty") return <div key={`empty-${row.project.id}`} className="relative h-16 border-b border-dashed border-[#d9e0eb]" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${cellWidth - 1}px, #edf0f5 ${cellWidth - 1}px, #edf0f5 ${cellWidth}px)` }} />; const task = row.task; const g = displayGeometry(task); const activeDrag = drag?.id === task.id ? drag : null; const activeResize = resize?.id === task.id ? resize : null; return <div key={row.project.id + task.id} className="relative h-16 border-b border-[#e7ebf2]" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${cellWidth - 1}px, #edf0f5 ${cellWidth - 1}px, #edf0f5 ${cellWidth}px)` }}>{task.milestone ? <button onMouseEnter={()=>setHoveredTask(task.id)} onMouseLeave={()=>setHoveredTask(null)} onClick={event => selectTask(event, task)} aria-pressed={selectedTask === task.id} onDoubleClick={() => openTask(task)} className="absolute top-[19px] z-20 grid size-7 rotate-45 place-items-center rounded-[4px] border-2 border-white shadow-md" style={{ left: g.left, background: colors[task.type], ...highlight(task.id) }} aria-label={task.title}><Diamond size={13} className="-rotate-45 text-white" /></button> : <button onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ id: task.id, startX: e.clientX, previewCells: 0, moved: false }); }} onPointerMove={e => moveDrag(e, task)} onPointerUp={e => finishDrag(e, task)} onPointerCancel={() => setDrag(null)} onMouseEnter={()=>setHoveredTask(task.id)} onMouseLeave={()=>setHoveredTask(null)} onClick={event => selectTask(event, task)} aria-pressed={selectedTask === task.id} onDoubleClick={() => openTask(task)} className={`group absolute top-[14px] z-20 flex h-9 touch-none select-none items-center overflow-visible rounded-lg px-3 text-left text-sm font-semibold text-white shadow-sm hover:brightness-95 ${activeDrag ? "z-30 cursor-grabbing ring-4 ring-[#1d4ed8]/15 shadow-lg" : activeResize ? "z-30 ring-4 ring-white/35 shadow-lg" : "cursor-grab transition-[filter,box-shadow]"} ${task.status === "已完成" ? "opacity-55" : ""}`} style={{ left: g.left, width: g.width, background: colors[task.type] || colors.其他, ...highlight(task.id) }}><span className="pointer-events-none min-w-0 flex-1 truncate">{task.title}</span><span role="separator" aria-label={`调整${task.title}的开始日期`} onClick={e => e.stopPropagation()} onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setResize({ id: task.id, edge: "start", startX: e.clientX, previewDays: 0, moved: false }); }} onPointerMove={e => moveResize(e, task)} onPointerUp={e => finishResize(e, task)} onPointerCancel={() => setResize(null)} className="absolute inset-y-0 -left-1 z-10 w-3 cursor-ew-resize touch-none rounded-l-lg before:absolute before:inset-y-2 before:left-1/2 before:w-1 before:-translate-x-1/2 before:rounded-full before:bg-white/80 before:opacity-0 before:transition-opacity hover:before:opacity-100 group-hover:before:opacity-70" /><span role="separator" aria-label={`调整${task.title}的结束日期`} onClick={e => e.stopPropagation()} onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setResize({ id: task.id, edge: "end", startX: e.clientX, previewDays: 0, moved: false }); }} onPointerMove={e => moveResize(e, task)} onPointerUp={e => finishResize(e, task)} onPointerCancel={() => setResize(null)} className="absolute inset-y-0 -right-1 z-10 w-3 cursor-ew-resize touch-none rounded-r-lg before:absolute before:inset-y-2 before:left-1/2 before:w-1 before:-translate-x-1/2 before:rounded-full before:bg-white/80 before:opacity-0 before:transition-opacity hover:before:opacity-100 group-hover:before:opacity-70" /></button>}
            {(["top","bottom"] as const).map(side=><span key={side} role="button" tabIndex={0} aria-label={task.title+(side==="top"?"顶部":"底部")+"日期连接点"} title="点击日期位置：先选择输出，再选择输入" onClick={event=>choosePort(event,task,side)} onKeyDown={event=>{if(event.key==="Escape")setPendingPort(null);}} className="absolute z-30 cursor-crosshair rounded-full transition-colors hover:bg-blue-500/60" style={{left:g.left+5,width:Math.max(8,g.width-10),top:side==="top"?9:46,height:9,background:hoveredTask===task.id?"rgba(37,99,235,.18)":undefined}} />)}
          </div>; })}
          <div className="h-14" style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent ${cellWidth - 1}px, #edf0f5 ${cellWidth - 1}px, #edf0f5 ${cellWidth}px)` }} />
        </div>
      </div></div></div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#68738a]">{Object.entries(colors).map(([name, color]) => <span key={name} className="flex items-center gap-1.5"><Circle size={8} fill={color} stroke="none" />{name}</span>)}<span className="flex items-center gap-1.5"><Link2 size={13} />灰色连线：正常依赖</span><span className="flex items-center gap-1.5 text-[#c4610d]"><span className="w-4 border-t-2 border-dashed border-[#e07a19]" />橙色虚线：排期冲突</span></div>
    </section>
    <Dialog open={!!editing} onOpenChange={open => { if (!open) { setEditing(null); setEditingEdges([]); } }}><DialogContent className="border-[#d9e0eb] bg-white max-h-[90vh] overflow-y-auto sm:max-w-[720px]"><DialogHeader><DialogTitle>{tasks.some(task=>task.id===editing?.id) ? "编辑事项" : "新建科研事项"}</DialogTitle><DialogDescription>共享事项的内容与关系会在所有所属项目同步。</DialogDescription></DialogHeader>{editing && <div className="grid gap-4 py-2">
      <div className="grid gap-2"><Label htmlFor="title">事项名称</Label><Input id="title" autoFocus value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="例如：完成真实机器人实验" /></div>
      <div className="grid gap-2"><Label>所属项目</Label><div className="flex flex-wrap gap-4">{projects.map(project=><label key={project.id} className="flex items-center gap-2 text-sm"><Checkbox checked={editing.projectIds.includes(project.id)} disabled={editing.projectIds.length===1&&editing.projectIds.includes(project.id)} onCheckedChange={checked=>setEditing({...editing,projectIds:checked?[...editing.projectIds,project.id]:editing.projectIds.filter(id=>id!==project.id)})}/>{project.name}</label>)}</div></div>
      <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>工作类型</Label><Select value={editing.type} onValueChange={v => setEditing({ ...editing, type: v as TaskType })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(colors).map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>状态</Label><Select value={editing.status} onValueChange={v => setEditing({ ...editing, status: v as Task["status"] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["未开始","进行中","已完成"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div></div>
      <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label htmlFor="start">开始</Label><Input id="start" type="date" value={editing.start} onChange={e => setEditing({ ...editing, start: e.target.value })} /></div><div className="grid gap-2"><Label htmlFor="end">结束</Label><Input id="end" type="date" value={editing.end} onChange={e => setEditing({ ...editing, end: e.target.value })} /></div></div>
      <div className="grid gap-4 sm:grid-cols-2">{relationEditor("source")}{relationEditor("target")}</div>
      {editError&&<p role="alert" className="text-sm text-red-700">{editError}</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.milestone} onChange={e => setEditing({ ...editing, milestone: e.target.checked, end: editing.start })} className="size-4 accent-[#1d4ed8]" />设为里程碑</label>
    </div>}<DialogFooter>{tasks.some(task=>task.id===editing?.id) && <Button variant="ghost" className="mr-auto text-[#b42318] hover:bg-[#fff1f0] hover:text-[#b42318]" onClick={() => { if(!editing)return; deleteTask(editing.id); setEditing(null); setEditingEdges([]); }}>删除事项（所有项目）</Button>}<Button variant="outline" onClick={() => { setEditing(null); setEditingEdges([]); }}>取消</Button><Button onClick={saveTask} className="bg-[#1d4ed8] hover:bg-[#1e40af]">保存</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={newProjectOpen} onOpenChange={open => { setNewProjectOpen(open); if (!open) setNewProjectName(""); }}><DialogContent className="border-[#d9e0eb] bg-white sm:max-w-[420px]"><DialogHeader><DialogTitle>添加项目</DialogTitle><DialogDescription>新项目会立即出现在左侧项目栏中。</DialogDescription></DialogHeader><div className="grid gap-2 py-2"><Label htmlFor="project-name">项目名称</Label><Input id="project-name" autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveProject(); }} placeholder="例如：具身导航论文" /></div><DialogFooter><Button variant="outline" onClick={() => setNewProjectOpen(false)}>取消</Button><Button onClick={saveProject} disabled={!newProjectName.trim() || projects.some(project => project.name.toLocaleLowerCase() === newProjectName.trim().toLocaleLowerCase())} className="bg-[#1d4ed8] hover:bg-[#1e40af]">添加项目</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}><DialogContent className="bg-white sm:max-w-[460px]"><DialogHeader><DialogTitle>设置</DialogTitle><DialogDescription>选择跨项目拖动事项时的操作。同项目拖动始终调整行顺序。</DialogDescription></DialogHeader><Label>跨项目拖动</Label><RadioGroup value={transferMode} onValueChange={value=>setTransferMode(value as TransferMode)}>{[
      ["move","移动","移到目标项目，保留内容和关系。"],
      ["copy","复制","新建独立事项，仅复制内容，不带任何关系。"],
      ["share","共享","两处引用同一事项，内容与前后关系完全同步。"]
    ].map(([value,label,description])=><label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4"><RadioGroupItem value={value} className="mt-1"/><span><span className="block text-sm font-semibold">{label}{value==="move"?"（默认）":""}</span><span className="mt-1 block text-sm text-slate-500">{description}</span></span></label>)}</RadioGroup><p className="text-sm text-slate-500">设置自动保存在当前浏览器。</p><DialogFooter><Button onClick={()=>setSettingsOpen(false)}>完成</Button></DialogFooter></DialogContent></Dialog>
  </main>;
}
