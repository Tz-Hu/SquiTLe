"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, startOfMonth, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import {LocaleProvider,useLocale} from "@/components/locale-provider";
import {visibleMonthSegment} from "@/lib/calendar-header";
import { ChevronDown, ChevronLeft, ChevronRight, Circle, Diamond, GripVertical, Link2, Plus, RotateCcw, Settings, Sun, Moon, Monitor, X, CircleHelp, Ellipsis, Globe, HardDrive, Download, Upload, ExternalLink, Copy, Pencil, Trash2 } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { relatedDepths, hasCycle, deleteProjectContent, dependencyIsCompleted, dependencyOutputs, pruneDependencyOutputs, taskOutputs, type Task, type TaskType, type TaskOutput, type Dependency, type Port } from "@/lib/schedule";
import { historyOf, commit, undo, redo } from "@/lib/history";
import { createPortal, flushSync } from "react-dom";
import { panViewport, windowScrollLimit } from "@/lib/pan";
import { defaultTablePalettes, migrateTablePalettes, tableColorLabels, tableTextColor, type TableColors, type TablePalettes } from "@/lib/table-colors";
import { categoryDefaults, WORK_TYPE_CATALOG_VERSION, layoutTokens, taskBounds, appearanceFields, appearancePresetValues, snapAppearanceValue, defaultAppearance, restoreAppearance, restoreCategories, migrateCategoryCatalog } from "@/lib/appearance";
import { moveRow, moveItem, insertItemRow, rowId, hasItemOverlap } from "@/lib/rows";
import { ManualDateField } from "@/components/manual-date-field";
import { expandedInset, foldedSide, portOffset, visiblePortDays, taskBarWidth } from "@/lib/task-presentation";
import { ExpandingTaskLabel } from "@/components/expanding-task-label";
import {builtInColorPresets,nextCustomPresetName,restoreCustomColorPresets,type ColorPreset} from "@/lib/color-presets";

import {DailyAgenda} from "@/components/daily-agenda";
import {InboxPanel} from "@/components/inbox-panel";
import {restoreInbox,inboxKinds,type InboxItem,type InboxKind,type InboxSort} from "@/lib/inbox";
import {projectTasksToTodo,reconcileTodoList} from "@/lib/todo-projection";
import {Tooltip,TooltipProvider,TooltipTrigger,TooltipContent} from "@/components/ui/tooltip";
import {advanceScheduleDocument,backupFilename, createBackup, CURRENT_DATA_VERSION, loadScheduleDocument, migratePersistedState, parseBackup, type PersistedState,type ScheduleDocument} from "@/lib/persistence";
import {extractMemoLinks} from "@/lib/memo-links";
import {clampSettingsNavWidth,SETTINGS_NAV_MAX,SETTINGS_NAV_MIN} from "@/lib/settings-layout";
import {clampTaskColumnWidth,PROJECT_COLUMN_WIDTH,TASK_COLUMN_DEFAULT,TASK_COLUMN_MAX,TASK_COLUMN_MIN} from "@/lib/timeline-layout";
import {deleteWorkType,renameWorkType,renameWorkTypeColorMap} from "@/lib/work-types";
import {reconcileTracks,tracksFromTasks,type TaskTrack} from "@/lib/tracks";
import {createScheduleStorage,getOrCreateDeviceId,isDesktopRuntime,LEGACY_DOCUMENT_BACKUP_KEY,saveDesktopJson,type ScheduleStorage} from "@/lib/storage";
import {obstaclesNearRoute} from "@/lib/connection-routing";

type Project = { id: string; name: string; color: string };
type VisibleRow = { kind: "task"; project: Project; task: Task; tasks:Task[] } | {kind:"add";project:Project} | {kind:"insert";project:Project;phase:"hint"|"ready"} | { kind: "summary"; project: Project; tasks: Task[] } | { kind: "empty"; project: Project };
type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };
type RenderedConnection = { key:string; edge:Dependency; from:Point; to:Point; path:string; conflicts:boolean };
const projectPalette = Object.values(categoryDefaults);
const SETTINGS_WIDTH_KEY="schedule-timeline-settings-width";
const SETTINGS_NAV_WIDTH_KEY="schedule-timeline-settings-nav-width";
const TASK_COLUMN_WIDTH_KEY="schedule-timeline-task-column-width";
const FOLDED_PLACEHOLDER_FRACTION=1/4;
const iso = (date: Date) => format(date, "yyyy-MM-dd");
const statusForRange=(start:string,end:string):Task["status"]=>{const today=iso(new Date());return end<today?"已完成":start>today?"未开始":"进行中";};
type EdgeLevel="thin"|"regular"|"thick"|"bold";
type ArrowLevel="small"|"regular"|"large"|"xlarge";
const edgeStrokeByLevel:Record<EdgeLevel,number>={thin:.75,regular:1,thick:1.5,bold:2};
const arrowSizeByLevel:Record<ArrowLevel,number>={small:4,regular:5,large:7,xlarge:9};

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

const smoothRoute = (points: Point[], radius = layoutTokens.cornerRadius, arrowSize=layoutTokens.arrowSize) => {
  const route = points.filter((point, i) => i === 0 || point.x !== points[i - 1].x || point.y !== points[i - 1].y);
  if (route.length < 2) return "";
  let path = `M ${route[0].x} ${route[0].y}`;
  for (let i = 1; i < route.length - 1; i++) {
    const previous = route[i - 1]; const corner = route[i]; const next = route[i + 1];
    const incoming = Math.abs(corner.x - previous.x) + Math.abs(corner.y - previous.y);
    const outgoing = Math.abs(next.x - corner.x) + Math.abs(next.y - corner.y);
    const curve = Math.min(radius, incoming / 2, outgoing / 2, i === route.length - 2 ? Math.max(0,outgoing-arrowSize) : radius);
    const entry = { x: corner.x - Math.sign(corner.x - previous.x) * curve, y: corner.y - Math.sign(corner.y - previous.y) * curve };
    const exit = { x: corner.x + Math.sign(next.x - corner.x) * curve, y: corner.y + Math.sign(next.y - corner.y) * curve };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }
  const end = route[route.length - 1];
  return `${path} L ${end.x} ${end.y}`;
};

function initialProjects(): Project[] {
  return [
    { id: "p1", name: "示例项目 A", color: projectPalette[0] },
    { id: "p2", name: "示例项目 B", color: projectPalette[1] },
  ];
}

function initialTasks(): Task[] {
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

const emptyTask = (projectId = "p1"): Task => ({ id: "", title: "", memo: "", outputs:[], projectIds: [projectId], order: {}, type: "算法/仿真", start: iso(new Date()), end: iso(addDays(new Date(), 3)), status: "未开始" });

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
type Schedule = { projects: Project[]; tasks: Task[]; edges: Dependency[]; tracks:TaskTrack[]; inbox:InboxItem[] };
type PersonalDefaults=Partial<{
  general:{editorMode:"panel"|"dialog";wordingStyle:"default"|"humorous"};
  timeline:{weekStart:0|1;dayWidth:number;timelineRowHeight:number;insertionDelay:number;weekends:boolean;weekBoundaries:boolean};
  tasks:{defaultDays:number;defaultTaskType:TaskType;hoverSpeed:"fast"|"medium"|"slow";taskHoverHints:boolean;completedMode:"fade"|"normal"|"hide";barHeight:number;barRadius:number;barFill:number;completedOpacity:number};
  links:{handleGap:number;handleWidth:number;autoConnectionSides:boolean;lineOpacity:number;edgeLevel:EdgeLevel;arrowLevel:ArrowLevel};
  inbox:{inboxKind:InboxKind;inboxCompleted:"show"|"hide"};
  appearance:{theme:"light"|"dark"|"system";primaryColor:string;colors:Record<string,string>;tablePalettes:TablePalettes};
}>;
const nearestPreset=(value:number,options:readonly number[])=>options.reduce((nearest,option)=>Math.abs(option-value)<Math.abs(nearest-value)?option:nearest,options[0]);
const appearancePresetLabels:Record<keyof typeof appearancePresetValues,Array<[string,number]>>={
  barHeight:[["窄",20],["标准",24],["宽",28],["加宽",32]],
  barRadius:[["方正",0],["轻圆",4],["圆润",8]],
  barFill:[["轻淡",8],["标准",16],["醒目",24],["浓郁",32]],
  completedOpacity:[["更淡",30],["标准",55],["清晰",80]],
  lineOpacity:[["很淡",8],["标准",22],["清晰",40]],
};
function PresetTabs({value,options,onChange}:{value:string|number;options:Array<[string,string|number]>;onChange:(value:string)=>void}){
  return <Tabs className="settings-preset-control" value={String(value)} onValueChange={onChange}><TabsList>{options.map(([label,option])=><TabsTrigger key={String(option)} value={String(option)}>{label}</TabsTrigger>)}</TabsList></Tabs>;
}
export default function Home(){return <LocaleProvider><TimelineApp/></LocaleProvider>;}
function TimelineApp() {
  const {language,setLanguage,t}=useLocale();
  const displayWorkType=(type:string)=>t(type);
  const desktop=isDesktopRuntime();
  const [history, setHistory] = useState(() => {const tasks=initialTasks();return historyOf<Schedule>({ projects: initialProjects(), tasks, edges: initialEdges(), tracks:tracksFromTasks(tasks), inbox:[] });});
  const { projects, tasks, edges, tracks, inbox } = history.present;
  const changeSchedule = useCallback((change: (state: Schedule) => Schedule) => setHistory(current => commit(current, state=>{const next=change(state);return {...next,tracks:reconcileTracks(next.tasks,next.tracks)};})), []);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [locatedTask,setLocatedTask]=useState<string|null>(null);
  const locateTaskTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [hoveredEdge,setHoveredEdge]=useState<{id:string;x:number;y:number;above:boolean}|null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  type LinkGesture = { pointerId:number; x:number; y:number; active:boolean; edgeId?:string; movingEnd?:"source"|"target"; source:Port; from:Point; to:Point; target:Port|null; timer:ReturnType<typeof setTimeout> };
  const linkGesture = useRef<LinkGesture|null>(null);
  const linkMoveFrame=useRef<number|null>(null);
  const pendingLinkPointer=useRef<{clientX:number;clientY:number}|null>(null);
  const [linkPreview,setLinkPreview] = useState<{source:Port;from:Point;to:Point;target:Port|null;edgeId?:string;movingEnd?:"source"|"target"}|null>(null);
  const suppressPortClick = useRef(false);
  const pan = useRef<{pointerId:number;startX:number;lastX:number;moved:boolean}|null>(null);
  const panFrame=useRef<number|null>(null);
  const pendingPanX=useRef<number|null>(null);
  const suppressPanClick = useRef(false);
  const [panning,setPanning] = useState(false);
  const [viewportWidth,setViewportWidth] = useState(1400);
  const [taskColumnWidth,setTaskColumnWidth]=useState(()=>{if(typeof window==="undefined")return TASK_COLUMN_DEFAULT;const saved=Number(localStorage.getItem(TASK_COLUMN_WIDTH_KEY));return Number.isFinite(saved)?Math.max(TASK_COLUMN_MIN,Math.min(TASK_COLUMN_MAX,saved)):TASK_COLUMN_DEFAULT;});
  const taskColumnWidthRef=useRef(taskColumnWidth);
  const taskColumnDrag=useRef<{pointerId:number;startX:number;startWidth:number}|null>(null);
  const [ready, setReady] = useState(false);
  const scheduleStorageRef=useRef<ScheduleStorage<unknown>|null>(null);
  const scheduleDocumentRef=useRef<ScheduleDocument|null>(null);
  const deviceIdRef=useRef("");
  const saveQueueRef=useRef<Promise<void>>(Promise.resolve());
  const [zoom, setZoom] = useState<"day" | "week" | "month">("day");
  const [anchor, setAnchor] = useState(() => addDays(startOfDay(new Date()), -7));
  const [scrollOffset,setScrollOffset]=useState(0);
  const [creationMonth,setCreationMonth]=useState<string|null>(null);
  const [endingMonth,setEndingMonth]=useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [editingEdges, setEditingEdges] = useState<Dependency[]>([]);
  const [newTaskOutput,setNewTaskOutput]=useState("");
  const [editingEdge,setEditingEdge]=useState<Dependency|null>(null);
  const [edgeSourceOutputs,setEdgeSourceOutputs]=useState<TaskOutput[]>([]);
  const [newEdgeOutput,setNewEdgeOutput]=useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory,setSettingsCategory]=useState<"general"|"timeline"|"tasks"|"links"|"inbox"|"appearance">("general");
  const [editorMode,setEditorMode]=useState<"panel"|"dialog">("panel");
  const [wideScreen,setWideScreen]=useState(false);
  const headerRef=useRef<HTMLElement>(null);
  const settingsPanelRef=useRef<HTMLDivElement>(null);
  const settingsLayoutRef=useRef<HTMLDivElement>(null);
  const [panelTop,setPanelTop]=useState(88);
  const [settingsWidth,setSettingsWidth]=useState(()=>{if(typeof window==="undefined")return 760;const saved=Number(localStorage.getItem(SETTINGS_WIDTH_KEY));return Number.isFinite(saved)?Math.max(620,Math.min(1040,saved)):760;});
  const [settingsNavWidth,setSettingsNavWidth]=useState(()=>{if(typeof window==="undefined")return 180;const saved=Number(localStorage.getItem(SETTINGS_NAV_WIDTH_KEY));return Number.isFinite(saved)?Math.max(SETTINGS_NAV_MIN,Math.min(SETTINGS_NAV_MAX,saved)):180;});
  const settingsNavWidthRef=useRef(settingsNavWidth);
  const settingsNavDrag=useRef<{pointerId:number}|null>(null);
  const settingsWidthRef=useRef(settingsWidth);
  const [settingsResizing,setSettingsResizing]=useState(false);
  const settingsResizeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [dateErrors,setDateErrors]=useState<Record<string,boolean>>({});
  useEffect(()=>{
    const media=window.matchMedia("(min-width: 900px)");
    const update=()=>setWideScreen(media.matches);update();media.addEventListener("change",update);
    const header=headerRef.current;
    const observer=new ResizeObserver(()=>{if(header)setPanelTop(header.getBoundingClientRect().height+12);});
    if(header)observer.observe(header);
    return ()=>{media.removeEventListener("change",update);observer.disconnect();};
  },[]);
  const panelMode=editorMode==="panel"&&wideScreen;
  const rememberSettingsWidth=useCallback((width:number)=>{const next=Math.max(620,Math.min(1040,Math.round(width)));settingsWidthRef.current=next;setSettingsWidth(next);try{localStorage.setItem(SETTINGS_WIDTH_KEY,String(next));}catch{}return next;},[]);
  const captureSettingsWidth=useCallback(()=>{const element=settingsPanelRef.current;if(panelMode&&element)rememberSettingsWidth(element.getBoundingClientRect().width);},[panelMode,rememberSettingsWidth]);
  const rememberSettingsNavWidth=useCallback((width:number,layoutWidth:number)=>{const next=clampSettingsNavWidth(width,layoutWidth);settingsNavWidthRef.current=next;setSettingsNavWidth(next);try{localStorage.setItem(SETTINGS_NAV_WIDTH_KEY,String(next));}catch{}return next;},[]);
  const resizeSettingsNav=useCallback((clientX:number)=>{const layout=settingsLayoutRef.current;if(!layout)return;const rect=layout.getBoundingClientRect();rememberSettingsNavWidth(clientX-rect.left,rect.width);},[rememberSettingsNavWidth]);
  const startSettingsNavResize=(event:React.PointerEvent<HTMLButtonElement>)=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();settingsNavDrag.current={pointerId:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);resizeSettingsNav(event.clientX);};
  const moveSettingsNavResize=(event:React.PointerEvent<HTMLButtonElement>)=>{if(settingsNavDrag.current?.pointerId!==event.pointerId)return;resizeSettingsNav(event.clientX);};
  const endSettingsNavResize=(event:React.PointerEvent<HTMLButtonElement>)=>{if(settingsNavDrag.current?.pointerId!==event.pointerId)return;settingsNavDrag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  const keySettingsNavResize=(event:React.KeyboardEvent<HTMLButtonElement>)=>{const layout=settingsLayoutRef.current;if(!layout)return;let next=settingsNavWidth;if(event.key==="ArrowLeft")next-=8;else if(event.key==="ArrowRight")next+=8;else if(event.key==="Home")next=SETTINGS_NAV_MIN;else if(event.key==="End")next=SETTINGS_NAV_MAX;else return;event.preventDefault();rememberSettingsNavWidth(next,layout.getBoundingClientRect().width);};
  const rememberTaskColumnWidth=useCallback((width:number,availableWidth=viewport.current?.clientWidth??viewportWidth)=>{const next=clampTaskColumnWidth(width,availableWidth);taskColumnWidthRef.current=next;setTaskColumnWidth(next);try{localStorage.setItem(TASK_COLUMN_WIDTH_KEY,String(next));}catch{}return next;},[viewportWidth]);
  const startTaskColumnResize=(event:React.PointerEvent<HTMLButtonElement>)=>{if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();taskColumnDrag.current={pointerId:event.pointerId,startX:event.clientX,startWidth:taskColumnWidthRef.current};event.currentTarget.setPointerCapture(event.pointerId);};
  const moveTaskColumnResize=(event:React.PointerEvent<HTMLButtonElement>)=>{const active=taskColumnDrag.current;if(!active||active.pointerId!==event.pointerId)return;event.preventDefault();rememberTaskColumnWidth(active.startWidth+event.clientX-active.startX);};
  const endTaskColumnResize=(event:React.PointerEvent<HTMLButtonElement>)=>{if(taskColumnDrag.current?.pointerId!==event.pointerId)return;taskColumnDrag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);};
  const keyTaskColumnResize=(event:React.KeyboardEvent<HTMLButtonElement>)=>{let next=taskColumnWidth;if(event.key==="ArrowLeft")next-=8;else if(event.key==="ArrowRight")next+=8;else if(event.key==="Home")next=TASK_COLUMN_MIN;else if(event.key==="End")next=TASK_COLUMN_MAX;else return;event.preventDefault();rememberTaskColumnWidth(next);};
  const editorPresentation={
    className:panelMode?"side-editor":undefined,
    style:panelMode?{top:panelTop,left:16,translate:"none",transform:"none",width:360,maxWidth:"calc(100vw - 32px)",maxHeight:`calc(100dvh - ${panelTop+16}px)`,overflowY:"auto" as const}:undefined,
    onInteractOutside:(event:Event)=>{if(panelMode&&(event.target as Element)?.closest?.('button,input,select,textarea,[role="menuitem"],[role="option"],[role="button"]'))event.preventDefault();}
  };
  const [theme,setTheme]=useState<"light"|"dark"|"system">("system");
  const [primaryColor,setPrimaryColor]=useState("#4C7EF3");
  const [colors,setColors]=useState<Record<string,string>>(categoryDefaults);
  const workTypes=Object.keys(colors);
  const fallbackType=workTypes[0]??"整理";
  const fallbackColor=colors[fallbackType]??categoryDefaults.整理;
  const [appearance,setAppearance]=useState(defaultAppearance);
  const [categoryFilter,setCategoryFilter]=useState<string|null>(null);
  const [timelineRowHeight,setTimelineRowHeight]=useState(64);
  const [dayWidth,setDayWidth]=useState(54);
  const [weekStart,setWeekStart]=useState<0|1>(1);
  const [defaultTaskType,setDefaultTaskType]=useState<TaskType>("算法/仿真");
  const [hoverSpeed,setHoverSpeed]=useState<"fast"|"medium"|"slow">("medium");
  const [taskHoverHints,setTaskHoverHints]=useState(true);
  const [completedMode,setCompletedMode]=useState<"fade"|"normal"|"hide">("fade");
  const [insertionDelay,setInsertionDelay]=useState(300);
  const [wordingStyle,setWordingStyle]=useState<"default"|"humorous">("default");
  const [inboxCompleted,setInboxCompleted]=useState<"show"|"hide">("show");
  const [inboxSize,setInboxSize]=useState({width:320,height:280});
  const {top:barTop,bottom:barBottom}=taskBounds(appearance.barHeight,timelineRowHeight);
  useEffect(()=>{
    const root=document.documentElement;
    root.style.setProperty("--bar-height",appearance.barHeight+"px");
    root.style.setProperty("--bar-radius",appearance.barRadius+"px");
    root.style.setProperty("--bar-fill",appearance.barFill+"%");
    root.style.setProperty("--bar-hover-fill",Math.min(appearance.barFill+8,40)+"%");
    root.style.setProperty("--completed-opacity",String(appearance.completedOpacity/100));
    root.style.setProperty("--line-opacity",appearance.lineOpacity+"%");
    root.style.setProperty("--task-hover-duration",{fast:160,medium:280,slow:460}[hoverSpeed]+"ms");
    root.style.setProperty("--primary",primaryColor);
    root.style.setProperty("--primary-hover",`color-mix(in srgb, ${primaryColor} 84%, black)`);
    root.style.setProperty("--category-paper",colors.论文??Object.values(colors)[0]);
    root.style.setProperty("--category-experiment",colors["算法/仿真"]??Object.values(colors)[0]);
    root.style.setProperty("--category-engineering",colors.工程??Object.values(colors)[0]);
    root.style.setProperty("--category-other",colors.整理??Object.values(colors)[0]);
  },[appearance,colors,hoverSpeed,primaryColor]);
  const [tablePalettes,setTablePalettes]=useState<TablePalettes>(defaultTablePalettes);
  const [customColorPresets,setCustomColorPresets]=useState<ColorPreset[]>([]);
  const [presetName,setPresetName]=useState("");
  const [resolvedTheme,setResolvedTheme]=useState<"light"|"dark">("light");
  const [handleGap,setHandleGap]=useState(4);
  const lastScroll=useRef(0);
  useEffect(()=>{
    const media=window.matchMedia("(prefers-color-scheme: dark)");
    const apply=()=>{const dark=theme==="dark"||(theme==="system"&&media.matches);const mode=dark?"dark":"light";const root=document.documentElement;root.dataset.theme=mode;root.classList.toggle("dark",dark);setResolvedTheme(mode);for(const [key,color] of Object.entries(tablePalettes[mode])){root.style.setProperty(`--table-${key}`,color);root.style.setProperty(`--table-${key}-text`,tableTextColor(color));}};
    apply();media.addEventListener("change",apply);return()=>media.removeEventListener("change",apply);
  },[theme,tablePalettes]);
  const [handleWidth,setHandleWidth]=useState(6);
  const [edgeLevel,setEdgeLevel]=useState<EdgeLevel>("regular");
  const [arrowLevel,setArrowLevel]=useState<ArrowLevel>("regular");
  const [personalDefaults,setPersonalDefaults]=useState<PersonalDefaults>({});
  const edgeStroke=edgeStrokeByLevel[edgeLevel],arrowSize=arrowSizeByLevel[arrowLevel];
  const [autoConnectionSides,setAutoConnectionSides]=useState(true);
  const [defaultDays,setDefaultDays]=useState(4);
  const [inboxKind,setInboxKind]=useState<InboxKind>("checklist");
  const [inboxSort,setInboxSort]=useState<InboxSort>("manual");
  const [inboxCollapsed,setInboxCollapsed]=useState(false);
  const [inboxDragging,setInboxDragging]=useState<string|null>(null);
  const [inboxDrop,setInboxDrop]=useState<{left:number;top:number;height:number}|null>(null);
  const todoDeleteBackup=useRef<null|{kind:"inbox";item:InboxItem;index:number}|{kind:"task";task:Task;track?:TaskTrack;index:number;edges:Dependency[]}>(null);

  const [hoveredTask, setHoveredTask] = useState<string | null>(null);
  const [taskExpansionScales,setTaskExpansionScales]=useState<Record<string,number>>({});
  const registerTaskExpansion=useCallback((id:string,scale:number)=>setTaskExpansionScales(current=>current[id]===scale?current:{...current,[id]:scale}),[]);
  const [rowPreview,setRowPreview]=useState<Task[]|null>(null);
  const rowPreviewRef=useRef<Task[]|null>(null);
  const rowGesture=useRef<{taskId:string;projectId:string;pointerId:number;startY:number;active:boolean;target:string}|null>(null);
  const rowPositions=useRef(new Map<string,number>());
  const rowAnimations=useRef(new Map<HTMLElement,Animation>());
  const dragCounterAnimations=useRef(new Map<HTMLElement,Animation>());
  const [rowDrag, setRowDrag] = useState<{ taskId: string; projectId: string } | null>(null);
  const [projectPreview,setProjectPreview]=useState<Project[]|null>(null);
  const projectPreviewRef=useRef<Project[]|null>(null);
  const projectGesture=useRef<{projectId:string;pointerId:number;startY:number;active:boolean;target:string}|null>(null);
  const [projectDrag,setProjectDrag]=useState<string|null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [pendingPort, setPendingPort] = useState<Port | null>(null);
  const [notice, setNotice] = useState("");
  const importInputRef=useRef<HTMLInputElement>(null);
  const [pendingImport,setPendingImport]=useState<{name:string;state:PersistedState}|null>(null);
  const [pendingProjectDelete,setPendingProjectDelete]=useState<{project:Project;cascade:boolean}|null>(null);
  type ProjectDeleteBackup={project:Project;index:number;tasks:Array<{task:Task;index:number}>;tracks:TaskTrack[];edges:Dependency[];collapsed:boolean};
  const projectDeleteBackup=useRef<ProjectDeleteBackup|null>(null);
  const [projectUndoSeconds,setProjectUndoSeconds]=useState(0);
  const [noticeHovered,setNoticeHovered]=useState(false);
  useEffect(()=>{if(!notice)setNoticeHovered(false);},[notice]);
  useEffect(()=>{if(!notice||noticeHovered||projectUndoSeconds>0)return;const timer=setTimeout(()=>setNotice(""),2000);return()=>clearTimeout(timer);},[notice,noticeHovered,projectUndoSeconds]);
  useEffect(()=>{if(projectUndoSeconds<=0)return;const timer=setTimeout(()=>setProjectUndoSeconds(value=>Math.max(0,value-1)),1000);return()=>clearTimeout(timer);},[projectUndoSeconds]);
  useEffect(()=>{if(projectUndoSeconds===0)projectDeleteBackup.current=null;},[projectUndoSeconds]);
  const [editError, setEditError] = useState("");
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [editingProjectId,setEditingProjectId]=useState<string|null>(null);
  const pendingRenameProjectRef=useRef<Project|null>(null);
  const projectNameComposing=useRef(false);
  const taskEditorComposing=useRef(false);
  const [customTypeOpen,setCustomTypeOpen]=useState(false);
  const [customTypeName,setCustomTypeName]=useState("");
  const [customTypeColor,setCustomTypeColor]=useState("#6B8AFD");
  const [workTypeDrafts,setWorkTypeDrafts]=useState<Record<string,string>>({});
  const [pendingWorkTypeDelete,setPendingWorkTypeDelete]=useState<string|null>(null);
  const [editingTrack,setEditingTrack]=useState<TaskTrack|null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  type Insertion={projectId:string;before?:string;top:number;phase:"pending"|"hint"|"ready"};
  const [insertion,setInsertion]=useState<Insertion|null>(null);
  const insertionRef=useRef<Insertion|null>(null);
  const insertionTimers=useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearInsertion=()=>{
    insertionTimers.current.forEach(clearTimeout);insertionTimers.current=[];insertionRef.current=null;setInsertion(null);
  };
  useEffect(()=>{
    const cancel=(event?:KeyboardEvent)=>{if(!event||event.key==="Escape"){clearInsertion();if(event)setDrag(null);}};
    const blur=()=>{clearInsertion();setDrag(null);};
    window.addEventListener("keydown",cancel);window.addEventListener("blur",blur);
    return()=>{insertionTimers.current.forEach(clearTimeout);window.removeEventListener("keydown",cancel);window.removeEventListener("blur",blur);};
  },[]);
  const [drag, setDrag] = useState<{ id: string; startX: number; startY:number; startRowTop:number; previewY:number; previewCells: number; moved: boolean } | null>(null);
  const [resize, setResize] = useState<{ id: string; edge: "start" | "end"; startX: number; previewDays: number; moved: boolean } | null>(null);
  const dragFrame=useRef<number|null>(null);
  const pendingDragPointer=useRef<{taskId:string;clientX:number;clientY:number}|null>(null);
  const resizeFrame=useRef<number|null>(null);
  const pendingResizePointer=useRef<{taskId:string;clientX:number}|null>(null);
  const suppressEdit = useRef<string | null>(null);
  useEffect(()=>()=>{
    if(panFrame.current!==null)cancelAnimationFrame(panFrame.current);
    if(dragFrame.current!==null)cancelAnimationFrame(dragFrame.current);
    if(resizeFrame.current!==null)cancelAnimationFrame(resizeFrame.current);
    if(linkMoveFrame.current!==null)cancelAnimationFrame(linkMoveFrame.current);
  },[]);

  useEffect(()=>{
    const element=settingsPanelRef.current;
    if(!element||!panelMode||!settingsOpen)return;
    const observer=new ResizeObserver(()=>{const width=Math.round(element.getBoundingClientRect().width),next=Math.max(620,Math.min(1040,width));if(Math.abs(settingsWidthRef.current-next)<=1)return;settingsWidthRef.current=next;setSettingsWidth(next);setSettingsResizing(true);if(settingsResizeTimer.current)clearTimeout(settingsResizeTimer.current);settingsResizeTimer.current=setTimeout(()=>setSettingsResizing(false),120);try{localStorage.setItem(SETTINGS_WIDTH_KEY,String(next));}catch{}});
    observer.observe(element);return()=>{observer.disconnect();if(settingsResizeTimer.current)clearTimeout(settingsResizeTimer.current);settingsResizeTimer.current=null;setSettingsResizing(false);};
  },[panelMode,settingsOpen]);
  useEffect(()=>{const layout=settingsLayoutRef.current;if(!layout||!settingsOpen)return;const observer=new ResizeObserver(()=>{const next=clampSettingsNavWidth(settingsNavWidthRef.current,layout.getBoundingClientRect().width);if(next!==settingsNavWidthRef.current)rememberSettingsNavWidth(next,layout.getBoundingClientRect().width);});observer.observe(layout);return()=>observer.disconnect();},[settingsOpen,rememberSettingsNavWidth]);

  const applyPersistedState=(state:PersistedState)=>{
        const restoredTasks=state.tasks as Task[];
        const restored:Schedule = { projects: state.projects as Project[], tasks: restoredTasks, edges: state.edges as Dependency[], tracks:reconcileTracks(restoredTasks,state.tracks as TaskTrack[]), inbox:restoreInbox(state.inbox) };
        const restoredColors=migrateCategoryCatalog(state.categoryColors,state.workTypeCatalogVersion);
        for(const task of restored.tasks)if(task.type&&!restoredColors[task.type])restoredColors[task.type]=categoryDefaults["idea与思考"];
        for(const track of restored.tracks)if(track.type&&!restoredColors[track.type])restoredColors[track.type]=categoryDefaults["idea与思考"];
        if(inboxKinds.includes(state.inboxKind))setInboxKind(state.inboxKind);
        if(["manual","urgency","date"].includes(state.inboxSort))setInboxSort(state.inboxSort);
        setInboxCollapsed(state.inboxCollapsed===true);
        setCollapsedProjects(new Set(state.collapsed ?? []));
        if(state.editorMode==="panel"||state.editorMode==="dialog")setEditorMode(state.editorMode);
        if(["light","dark","system"].includes(state.theme))setTheme(state.theme);
        setTablePalettes(migrateTablePalettes(state.tablePalettes,state.paletteVersion));
        if(typeof state.primaryColor==="string"&&/^#[0-9a-f]{6}$/i.test(state.primaryColor))setPrimaryColor(state.primaryColor);
        setColors(restoredColors);
        setCustomColorPresets(restoreCustomColorPresets(state.customColorPresets));
        setAppearance(restoreAppearance(state.appearance));
        if(Number.isFinite(state.handleGap))setHandleGap(nearestPreset(state.handleGap,[2,4,8,12]));
        if(Number.isFinite(state.handleWidth))setHandleWidth(nearestPreset(state.handleWidth,[4,6,8,10]));
        if(["thin","regular","thick","bold"].includes(state.edgeLevel))setEdgeLevel(state.edgeLevel);
        if(["small","regular","large","xlarge"].includes(state.arrowLevel))setArrowLevel(state.arrowLevel);
        if(state.personalDefaults&&typeof state.personalDefaults==="object")setPersonalDefaults(state.personalDefaults);
        if(typeof state.autoConnectionSides==="boolean")setAutoConnectionSides(state.autoConnectionSides);
        if(Number.isFinite(state.defaultDays))setDefaultDays(Math.max(1,Math.min(365,Math.round(state.defaultDays))));
        if(Number.isFinite(state.timelineRowHeight))setTimelineRowHeight(nearestPreset(state.timelineRowHeight,[48,64,76,88]));
        if(Number.isFinite(state.dayWidth))setDayWidth(nearestPreset(state.dayWidth,[36,54,68,80]));
        if(state.weekStart===0||state.weekStart===1)setWeekStart(state.weekStart);
        if(typeof state.defaultTaskType==="string"&&restoredColors[state.defaultTaskType])setDefaultTaskType(state.defaultTaskType);else setDefaultTaskType(Object.keys(restoredColors)[0]);
        if(["fast","medium","slow"].includes(state.hoverSpeed))setHoverSpeed(state.hoverSpeed);
        if(typeof state.taskHoverHints==="boolean")setTaskHoverHints(state.taskHoverHints);
        if(["fade","normal","hide"].includes(state.completedMode))setCompletedMode(state.completedMode);
        if(Number.isFinite(state.insertionDelay))setInsertionDelay(nearestPreset(state.insertionDelay,[150,300,600]));
        if(state.wordingStyle==="default"||state.wordingStyle==="humorous")setWordingStyle(state.wordingStyle);
        if(state.inboxCompleted==="show"||state.inboxCompleted==="hide")setInboxCompleted(state.inboxCompleted);
        {const directWidth=Number(localStorage.getItem(SETTINGS_WIDTH_KEY));if(Number.isFinite(directWidth))rememberSettingsWidth(directWidth);else if(Number.isFinite(state.settingsWidth))rememberSettingsWidth(state.settingsWidth);}
        const savedSize=state.inboxSize as {width?:number;height?:number}|undefined;
        if(Number.isFinite(savedSize?.width)&&Number.isFinite(savedSize?.height))setInboxSize({width:Math.max(260,Math.min(720,savedSize!.width!)),height:Math.max(160,Math.min(720,savedSize!.height!))});
        setHistory(historyOf(restored));
  };
  useEffect(() => {
    let active=true;
    const storage=createScheduleStorage<unknown>(window.localStorage);
    scheduleStorageRef.current=storage;
    deviceIdRef.current=getOrCreateDeviceId(window.localStorage);
    void (async()=>{try {
      const exampleTasks=initialTasks();
      let restored: Schedule = { projects: initialProjects(), tasks: exampleTasks, edges: initialEdges(), tracks:tracksFromTasks(exampleTasks), inbox:[] };
      const unified = (await storage.load()).data;
      if (unified) {
        const loaded=loadScheduleDocument(unified,deviceIdRef.current);
        scheduleDocumentRef.current=loaded.document;
        if(loaded.legacy)try{if(!localStorage.getItem(LEGACY_DOCUMENT_BACKUP_KEY))localStorage.setItem(LEGACY_DOCUMENT_BACKUP_KEY,JSON.stringify(unified));}catch{}
        applyPersistedState(loaded.document.data);
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
              type: (task.type==="其他"?"整理":task.type || task.project || "整理") as TaskType, start: task.start || iso(new Date()), end: task.end || task.start || iso(new Date()), status: task.status || "未开始", milestone: task.milestone };
          });
          restored.tasks = migrated;
          restored.tracks = tracksFromTasks(migrated);
          restored.edges = legacy.flatMap(task => {
            const source = migrated.find(t => t.id === task.dependsOn); const target = migrated.find(t => t.id === task.id);
            return source && target ? [{ id: crypto.randomUUID(), source: { taskId: source.id, day: duration(source), side: "bottom" as const }, target: { taskId: target.id, day: 0, side: "top" as const } }] : [];
          });
        }
        const collapsed = localStorage.getItem("research-gantt-collapsed-projects");
        if (collapsed) setCollapsedProjects(new Set(JSON.parse(collapsed)));
      }
      if(!unified)setHistory(historyOf(restored));
    } catch { if(active)setNotice("保存的数据未能读取，原始数据仍保留在浏览器中。"); return; }
    if(active)setReady(true);
    })();
    return()=>{active=false;};
  }, []);
  const persistedState={ dataVersion:CURRENT_DATA_VERSION, workTypeCatalogVersion:WORK_TYPE_CATALOG_VERSION, projects, tasks, edges, tracks, inbox, inboxKind, inboxSort, inboxCollapsed, collapsed: [...collapsedProjects], defaultDays, autoConnectionSides, handleWidth, handleGap, edgeLevel, arrowLevel, personalDefaults, theme, primaryColor, tablePalettes, paletteVersion:2, categoryColors:colors, customColorPresets, appearance, editorMode, settingsWidth, timelineRowHeight, dayWidth, weekStart, defaultTaskType, hoverSpeed, taskHoverHints, completedMode, insertionDelay, wordingStyle, inboxCompleted, inboxSize };
  useEffect(() => {
    if (!ready) return;
    const storage=scheduleStorageRef.current;
    if(!storage)return;
    const snapshot=persistedState;
    saveQueueRef.current=saveQueueRef.current.catch(()=>undefined).then(async()=>{
      const previous=scheduleDocumentRef.current;
      const next=advanceScheduleDocument(snapshot,previous,deviceIdRef.current);
      await storage.save(next,previous?String(previous.revision):undefined);
      scheduleDocumentRef.current=next;
    }).catch(()=>setNotice(desktop?"应用未能保存本地文档，请检查磁盘权限。":"浏览器未能保存，请检查存储空间。"));
  }, [projects, tasks, edges, tracks, inbox, inboxKind, inboxSort, inboxCollapsed, collapsedProjects, defaultDays, autoConnectionSides, handleWidth, handleGap, edgeLevel, arrowLevel, personalDefaults, theme, primaryColor, tablePalettes, colors, customColorPresets, appearance, editorMode, settingsWidth, timelineRowHeight, dayWidth, weekStart, defaultTaskType, hoverSpeed, taskHoverHints, completedMode, insertionDelay, wordingStyle, inboxCompleted, inboxSize, ready]);
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
          type: { type: "string", enum: Object.keys(colors) },
        },
        required: ["title", "start", "end"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = input as Partial<Task> & { projectId?: string };
        if (value.projectId && !projects.some(project => project.id === value.projectId)) throw new Error("项目不存在");
        if (!value.title?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(value.start || "") || !/^\d{4}-\d{2}-\d{2}$/.test(value.end || "")) throw new Error("事项名称与日期格式无效");
        const normalizedEnd=value.end! < value.start! ? value.start! : value.end!;
        const task: Task = { id: crypto.randomUUID(), title: value.title.trim(), start: value.start!, end: normalizedEnd, projectIds: [value.projectId || projects[0]?.id || "p1"], order: { [value.projectId || projects[0]?.id || "p1"]: tasks.length }, type: value.type || defaultTaskType, status: statusForRange(value.start!,normalizedEnd) };
        changeSchedule(current => ({ ...current, tasks: [...current.tasks, task] }));
        return { id: task.id, status: "created" };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [projects, tasks.length, changeSchedule,defaultTaskType,colors]);

  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const observer = new ResizeObserver(() => {
      const width=element.clientWidth;
      setViewportWidth(width);
      const next=clampTaskColumnWidth(taskColumnWidthRef.current,width);
      if(next!==taskColumnWidthRef.current){taskColumnWidthRef.current=next;setTaskColumnWidth(next);try{localStorage.setItem(TASK_COLUMN_WIDTH_KEY,String(next));}catch{}}
    });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const frozenWidth=PROJECT_COLUMN_WIDTH+taskColumnWidth;
  const cellWidth = zoom === "day" ? dayWidth : zoom==="week"?dayWidth*82/54:dayWidth/9;
  const stepDays = zoom === "week" ? 7 : 1;
  const cellCount = Math.max(zoom === "day" ? 35 : 26, Math.ceil(viewportWidth/cellWidth)+14);
  const dates = useMemo(() => Array.from({ length: cellCount }, (_, i) => addDays(anchor, i * stepDays)), [anchor, cellCount, stepDays]);
  const calendarDays=useMemo(()=>Array.from({length:cellCount*stepDays},(_,i)=>addDays(anchor,i)),[anchor,cellCount,stepDays]);
  const monthGroups = useMemo(() => calendarDays.reduce<Array<{ key: string; date: Date; count: number }>>((groups, date) => {
    const key = format(date, "yyyy-MM");
    const current = groups[groups.length - 1];
    if (current?.key === key) current.count += 1;
    else groups.push({ key, date, count: 1 });
    return groups;
  }, []), [calendarDays]);
  const displayedProjects=projectPreview??projects;
  const trackById=useMemo(()=>new Map(tracks.map(track=>[track.id,track])),[tracks]);
  const trackFor=(task:Task)=>trackById.get(rowId(task))??{id:rowId(task),title:task.title,type:task.type};
  const projectGroups=useMemo(()=>displayedProjects.map(project=>{
    const items=(rowPreview??tasks).filter(task=>task.projectIds.includes(project.id)&&(completedMode!=="hide"||task.status!=="已完成"||task.id===locatedTask)).sort((a,b)=>(a.order[project.id]??0)-(b.order[project.id]??0));
    const groups=new Map<string,Task[]>();for(const task of items){const id=rowId(task);groups.set(id,[...(groups.get(id)??[]),task]);}
    return {project,tasks:items,rows:[...groups.values()]};
  }),[displayedProjects,tasks,rowPreview,completedMode,locatedTask]);
  const baseRows=useMemo<VisibleRow[]>(()=>projectGroups.flatMap<VisibleRow>(group=>{
    if(!group.tasks.length)return [{kind:"empty",project:group.project}];
    if(collapsedProjects.has(group.project.id))return [{kind:"summary",project:group.project,tasks:group.tasks},{kind:"add",project:group.project}];
    return [...group.rows.map(items=>({kind:"task" as const,project:group.project,task:items[0],tasks:items})),{kind:"add" as const,project:group.project}];
  }),[projectGroups,collapsedProjects]);
  const visibleRows=useMemo<VisibleRow[]>(()=>{
    if(!insertion||insertion.phase==="pending")return baseRows;
    const index=baseRows.findIndex(row=>row.project.id===insertion.projectId&&(insertion.before?row.kind==="task"&&row.tasks.some(task=>task.id===insertion.before):row.kind==="add"));
    if(index<0)return baseRows;
    return [...baseRows.slice(0,index),{kind:"insert",project:baseRows[index].project,phase:insertion.phase},...baseRows.slice(index)];
  },[baseRows,insertion]);
  const rowHeight=(row:VisibleRow)=>row.kind==="insert"?(row.phase==="hint"?timelineRowHeight/4:timelineRowHeight):row.kind==="add"?layoutTokens.addRowHeight:row.kind==="empty"&&collapsedProjects.has(row.project.id)?48:timelineRowHeight;
  const rowTops=useMemo(()=>{let y=0;return visibleRows.map(row=>{const top=y;y+=rowHeight(row);return top;});},[visibleRows,timelineRowHeight]);
  const rowsHeight=visibleRows.reduce((sum,row)=>sum+rowHeight(row),0);
  const rowAtY=(y:number)=>visibleRows.findIndex((row,index)=>y>=rowTops[index]&&y<rowTops[index]+rowHeight(row));
  const dragOffset=(id:string)=>{
    if(!drag||drag.id!==id)return 0;
    const index=visibleRows.findIndex(row=>row.kind==="task"&&row.tasks.some(task=>task.id===id));
    return drag.previewY+drag.startRowTop-(rowTops[index]??drag.startRowTop);
  };
  const trackInsertion=(clientY:number)=>{
    if(!timeline.current)return;
    const y=clientY-timeline.current.getBoundingClientRect().top;
    const active=insertionRef.current;
    if(active){
      const height=active.phase==="ready"?timelineRowHeight:active.phase==="hint"?timelineRowHeight/4:0;
      if(y>=active.top-10&&y<=active.top+height+10)return;
      clearInsertion();return;
    }
    const index=visibleRows.findIndex((row,i)=>i>0&&row.kind!=="insert"&&visibleRows[i-1].kind==="task"&&(row.kind==="task"||row.kind==="add")&&row.project.id===visibleRows[i-1].project.id&&Math.abs(y-rowTops[i])<=10);
    if(index<0)return;
    const row=visibleRows[index];
    const candidate:Insertion={projectId:row.project.id,before:row.kind==="task"?row.task.id:undefined,top:rowTops[index],phase:"pending"};
    insertionRef.current=candidate;
    insertionTimers.current.push(setTimeout(()=>{
      if(insertionRef.current!==candidate)return;
      candidate.phase="hint";setInsertion({...candidate});
      insertionTimers.current.push(setTimeout(()=>{
        if(insertionRef.current!==candidate)return;
        candidate.phase="ready";setInsertion({...candidate});
      },insertionDelay));
    },insertionDelay));
  };
  useLayoutEffect(()=>{
    const next=new Map<string,number>();
    if(!drag){for(const animation of dragCounterAnimations.current.values())animation.cancel();dragCounterAnimations.current.clear();}
    const reducedMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll<HTMLElement>("[data-row-key]").forEach(element=>{
      const key=element.dataset.rowKey!;const top=element.offsetTop;next.set(key,top);
      const previous=rowPositions.current.get(key);
      if(previous!==undefined&&previous!==top){
        // The DOM has its new layout position, but an interrupted animation still
        // holds the old visual offset. Preserve that screen position before retargeting.
        const transform=getComputedStyle(element).transform;
        const visualOffset=transform==="none"?0:new DOMMatrixReadOnly(transform).m42;
        const offset=previous+visualOffset-top;
        rowAnimations.current.get(element)?.cancel();
        rowAnimations.current.delete(element);
        if(!reducedMotion&&Math.abs(offset)>.1){
          const animation=element.animate([{transform:`translateY(${offset}px)`},{transform:"translateY(0)"}],{duration:180,easing:"cubic-bezier(.2,.8,.2,1)"});
          rowAnimations.current.set(element,animation);
          // Keep the grabbed block under the pointer while its source row makes room.
          if(drag)element.querySelectorAll<HTMLElement>("[data-task-motion]").forEach(child=>{
            if(child.dataset.taskMotion!==drag.id)return;
            dragCounterAnimations.current.get(child)?.cancel();
            const counter=child.animate([{transform:`translateY(${-offset}px)`},{transform:"translateY(0)"}],{duration:180,easing:"cubic-bezier(.2,.8,.2,1)"});
            dragCounterAnimations.current.set(child,counter);
            counter.onfinish=()=>{if(dragCounterAnimations.current.get(child)===counter)dragCounterAnimations.current.delete(child);};
          });
          animation.onfinish=()=>{if(rowAnimations.current.get(element)===animation)rowAnimations.current.delete(element);};
        }
      }
    });
    for(const [element,animation] of rowAnimations.current)if(!element.isConnected){animation.cancel();rowAnimations.current.delete(element);}
    rowPositions.current=next;
  },[visibleRows,drag?.id]);
  useEffect(()=>()=>{for(const animation of [...rowAnimations.current.values(),...dragCounterAnimations.current.values()])animation.cancel();rowAnimations.current.clear();dragCounterAnimations.current.clear();},[]);
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button,input,select,textarea,[role="button"],[role="separator"]')) return;
    event.preventDefault(); suppressPanClick.current = false;
    pan.current = { pointerId:event.pointerId,startX:event.clientX,lastX:event.clientX,moved:false };
    pendingPanX.current=null;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const applyPanPosition=(clientX:number)=>{
    const active = pan.current; const element = viewport.current;
    if (!active || !element) return;
    if (!active.moved && Math.abs(clientX-active.startX)<4) return;
    active.moved = true; setPanning(true); setHoveredTask(null);
    const next = panViewport(element.scrollLeft,clientX-active.lastX,windowScrollLimit(cellCount*cellWidth,element.clientWidth,frozenWidth),cellWidth);
    active.lastX = clientX;
    lastScroll.current=next.scrollLeft;
    flushSync(()=>{if(next.columns)setAnchor(current=>addDays(current,next.columns*stepDays));setScrollOffset(next.scrollLeft);});
    element.scrollLeft = next.scrollLeft;
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = pan.current;
    if (!active || active.pointerId !== event.pointerId || !viewport.current) return;
    if (!active.moved && Math.abs(event.clientX-active.startX)<4) return;
    event.preventDefault();pendingPanX.current=event.clientX;
    if(panFrame.current!==null)return;
    panFrame.current=requestAnimationFrame(()=>{panFrame.current=null;const x=pendingPanX.current;pendingPanX.current=null;if(x!==null)applyPanPosition(x);});
  };
  const scrollViewport=(event:React.UIEvent<HTMLDivElement>)=>{
    const element=event.currentTarget,left=element.scrollLeft,previous=lastScroll.current;
    lastScroll.current=left;
    const max=windowScrollLimit(cellCount*cellWidth,element.clientWidth,frozenWidth);
    const columns=Math.min(7,Math.floor(max/cellWidth/2));
    if(!pan.current&&columns>0&&left!==previous){
      const direction=left>previous&&left>=max-1?1:left<previous&&left<=1?-1:0;
      if(direction){
        const next=left-direction*columns*cellWidth;
        lastScroll.current=next;
        flushSync(()=>{setAnchor(current=>addDays(current,direction*columns*stepDays));setScrollOffset(next);});
        element.scrollLeft=next;return;
      }
    }
    setScrollOffset(left);
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = pan.current;
    if (!active || active.pointerId !== event.pointerId) return;
    if(panFrame.current!==null){cancelAnimationFrame(panFrame.current);panFrame.current=null;}
    pendingPanX.current=null;applyPanPosition(event.clientX);
    suppressPanClick.current = active.moved;
    pan.current = null; setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    window.setTimeout(()=>{suppressPanClick.current=false;},0);
  };
  const totalWidth = cellCount * cellWidth;
  const focusDate=(date:Date,leadingDays=0)=>{
    lastScroll.current=0;
    flushSync(()=>{setAnchor(addDays(startOfDay(date),-leadingDays));setScrollOffset(0);});
    if(viewport.current)viewport.current.scrollLeft=0;
  };
  const locateTaskFromAgenda=(task:Task)=>{
    setSelectedTask(null);setSelectedEdge(null);setHoveredTask(null);setHoveredEdge(null);
    setCollapsedProjects(current=>{const next=new Set(current);for(const projectId of task.projectIds)next.delete(projectId);return next;});
    setLocatedTask(task.id);
    focusDate(new Date(task.start+"T00:00:00"),zoom==="month"?0:2);
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const root=viewport.current;
      const target=[...document.querySelectorAll<HTMLElement>("button.task-body[data-task-motion]")].find(element=>element.dataset.taskMotion===task.id);
      if(!root||!target)return;
      const rootRect=root.getBoundingClientRect(),targetRect=target.getBoundingClientRect();
      const tokens=getComputedStyle(document.documentElement);
      const stickyHeight=(Number.parseFloat(tokens.getPropertyValue("--timeline-head-height"))||0)+(Number.parseFloat(tokens.getPropertyValue("--agenda-height"))||0);
      const availableHeight=Math.max(0,root.clientHeight-stickyHeight);
      const top=root.scrollTop+targetRect.top-rootRect.top-stickyHeight-Math.max(0,(availableHeight-targetRect.height)/2);
      root.scrollTo({top:Math.max(0,top),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
    }));
    if(locateTaskTimer.current)clearTimeout(locateTaskTimer.current);
    locateTaskTimer.current=setTimeout(()=>setLocatedTask(current=>current===task.id?null:current),1400);
  };
  useEffect(()=>()=>{if(locateTaskTimer.current)clearTimeout(locateTaskTimer.current);},[]);
  const todayOffset = differenceInCalendarDays(startOfDay(new Date()), anchor) / stepDays;
  const taskGeometry=(task:Task)=>{
    const start=differenceInCalendarDays(new Date(task.start+"T00:00:00"),anchor)/stepDays;
    const end=(differenceInCalendarDays(new Date(task.end+"T00:00:00"),anchor)+1)/stepDays;
    const right=scrollOffset+Math.max(0,viewportWidth-frozenWidth);
    const side=foldedSide(start*cellWidth,end*cellWidth,scrollOffset,right,task.status==="已完成",!!task.milestone);
    if(side){
      const row=visibleRows.find(row=>row.kind==="task"&&row.tasks.some(item=>item.id===task.id));
      const hidden=row?.kind==="task"?row.tasks.filter(item=>foldedSide(differenceInCalendarDays(new Date(item.start+"T00:00:00"),anchor)*cellWidth/stepDays,(differenceInCalendarDays(new Date(item.end+"T00:00:00"),anchor)+1)*cellWidth/stepDays,scrollOffset,right,item.status==="已完成",!!item.milestone)===side):[];
      const index=Math.max(0,hidden.findIndex(item=>item.id===task.id));
      const width=cellWidth/stepDays*FOLDED_PLACEHOLDER_FRACTION;
      return {left:side==="past"?scrollOffset+index*width:right-(index+1)*width,width,placeholder:side};
    }
    return {left:start*cellWidth,width:task.milestone?28:taskBarWidth((end-start)*stepDays,cellWidth/stepDays),placeholder:null};
  };
  const saveOnEnter = (event:React.KeyboardEvent<HTMLElement>,save:()=>void) => {
    if(event.key!=="Enter"||event.defaultPrevented||event.repeat||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;
    const target=event.target as HTMLElement;
    if(!event.currentTarget.contains(target)||target.closest('select,[data-enter-action="local"],[role="combobox"],[role="listbox"],[contenteditable="true"]'))return;
    // Actual action buttons retain Enter. Radio/checkbox tiles use Space for
    // selection, so Enter remains the editor-wide save shortcut after a choice.
    const button=target.closest("button");
    if(button&&!button.matches('[role="radio"],[role="checkbox"]'))return;
    event.preventDefault();event.stopPropagation();save();
  };
  const finishSettings=()=>{captureSettingsWidth();setSettingsOpen(false);};
  const saveTask = () => {
    if(dateErrors.start||dateErrors.end||editingEdges.some(edge=>dateErrors[edge.id+"-source"]||dateErrors[edge.id+"-target"])){setEditError("请修正日期输入后再保存。");return;}
    if (!editing || !editing.start || !editing.end) { setEditError("请填写事项名称和起止日期。"); return; }
    const outputs=taskOutputs(editing).map(output=>({...output,text:output.text.trim()}));
    const normalized = { ...editing, outputs, title: editing.title.trim() || t("未命名"), end: editing.end < editing.start ? editing.start : editing.end };
    const allEdges = pruneDependencyOutputs([...edges.filter(edge => edge.source.taskId !== editing.id && edge.target.taskId !== editing.id), ...editingEdges],editing.id,outputs);
    if (hasCycle(allEdges)) { setEditError("这些关系会形成循环依赖，请调整前置或后接任务。"); return; }
    changeSchedule(current => ({ ...current, tasks: current.tasks.some(task => task.id === normalized.id) ? current.tasks.map(task => task.id === normalized.id ? normalized : task) : [...current.tasks, normalized], edges: allEdges }));
    setEditing(null); setEditingEdges([]); setNewTaskOutput(""); setEditError("");
  };
  const saveProject = () => {
    const name = newProjectName.trim();
    if (!name || projects.some(project => project.id!==editingProjectId&&project.name.toLocaleLowerCase() === name.toLocaleLowerCase())) return;
    if(editingProjectId){changeSchedule(current=>({...current,projects:current.projects.map(project=>project.id===editingProjectId?{...project,name}:project)}));setEditingProjectId(null);setNewProjectName("");setNewProjectOpen(false);return;}
    const projectId = crypto.randomUUID();
    changeSchedule(current => ({ ...current, projects: [...current.projects, { id: projectId, name, color: projectPalette[current.projects.length % projectPalette.length] }] }));
    setNewProjectName("");
    setNewProjectOpen(false);
  };
  const openNewProject=()=>{setEditingProjectId(null);setNewProjectName("");setEditing(null);setSettingsOpen(false);setNewProjectOpen(true);};
  const openRenameProject=(project:Project)=>{setEditingProjectId(project.id);setNewProjectName(project.name);setEditing(null);setSettingsOpen(false);setNewProjectOpen(true);};
  const openTrackEditor=(task:Task)=>{setEditingTrack({...trackFor(task)});setEditing(null);setSettingsOpen(false);setNewProjectOpen(false);};
  const saveTrack=()=>{
    if(!editingTrack)return;
    const normalized={...editingTrack,title:editingTrack.title.trim()||t("未命名任务轨")};
    changeSchedule(current=>({...current,tracks:current.tracks.map(track=>track.id===normalized.id?normalized:track)}));
    setEditingTrack(null);
  };
  const finishProjectMenuClose=(event:Event,projectId:string)=>{
    const pending=pendingRenameProjectRef.current;
    if(!pending||pending.id!==projectId)return;
    // Radix restores focus only after its close animation. Opening the editor here
    // keeps that restore from being interpreted as an outside interaction.
    event.preventDefault();pendingRenameProjectRef.current=null;openRenameProject(pending);
  };
  const requestProjectDelete=(project:Project)=>setPendingProjectDelete({project,cascade:false});
  const confirmProjectDelete=()=>{
    if(!pendingProjectDelete)return;
    const {project,cascade}=pendingProjectDelete;
    const result=deleteProjectContent(tasks,edges,project.id,cascade);
    const affectedTasks=tasks.flatMap((task,index)=>task.projectIds.includes(project.id)?[{task,index}]:[]);
    const affectedRows=new Set(affectedTasks.map(({task})=>rowId(task)));
    projectDeleteBackup.current={project,index:projects.findIndex(item=>item.id===project.id),tasks:affectedTasks,tracks:tracks.filter(track=>affectedRows.has(track.id)),edges:cascade?edges.filter(edge=>result.edges.every(item=>item.id!==edge.id)):[],collapsed:collapsedProjects.has(project.id)};
    changeSchedule(current=>{const next=deleteProjectContent(current.tasks,current.edges,project.id,cascade);return {...current,projects:current.projects.filter(item=>item.id!==project.id),tasks:next.tasks,edges:next.edges};});
    setCollapsedProjects(current=>{const next=new Set(current);next.delete(project.id);return next;});
    setSelectedTask(null);setSelectedEdge(null);setPendingProjectDelete(null);setProjectUndoSeconds(5);
    setNotice(cascade?t("已删除“{0}”及其中 {1} 个事项。",project.name,result.affectedCount):t("已删除“{0}”，{1} 个事项已移至未分类。",project.name,result.unclassifiedCount));
  };
  const undoProjectDelete=()=>{
    const backup=projectDeleteBackup.current;if(!backup)return;
    changeSchedule(current=>{
      const projects=current.projects.some(project=>project.id===backup.project.id)?current.projects:[...current.projects.slice(0,Math.max(0,backup.index)),backup.project,...current.projects.slice(Math.max(0,backup.index))];
      const originals=new Map(backup.tasks.map(({task})=>[task.id,task]));
      const tasks=current.tasks.map(task=>originals.get(task.id)??task);
      for(const {task,index} of backup.tasks.sort((a,b)=>a.index-b.index))if(!tasks.some(item=>item.id===task.id))tasks.splice(Math.min(index,tasks.length),0,task);
      const edgeIds=new Set(current.edges.map(edge=>edge.id));
      const trackIds=new Set(current.tracks.map(track=>track.id));
      return {...current,projects,tasks,tracks:[...current.tracks,...backup.tracks.filter(track=>!trackIds.has(track.id))],edges:[...current.edges,...backup.edges.filter(edge=>!edgeIds.has(edge.id))]};
    });
    if(backup.collapsed)setCollapsedProjects(current=>new Set(current).add(backup.project.id));
    projectDeleteBackup.current=null;setProjectUndoSeconds(0);setNotice("已撤回项目删除。");
  };
  const shiftTask = (task: Task, days: number) => ({ ...task, start: iso(addDays(new Date(task.start + "T00:00:00"), days)), end: iso(addDays(new Date(task.end + "T00:00:00"), days)) });
  const startTaskDrag = (event:React.PointerEvent<HTMLElement>,task:Task)=>{
    if(event.button!==0||!event.isPrimary)return;
    clearInsertion();
    if(dragFrame.current!==null){cancelAnimationFrame(dragFrame.current);dragFrame.current=null;}
    event.currentTarget.setPointerCapture(event.pointerId);
    pendingDragPointer.current=null;
    setDrag({id:task.id,startX:event.clientX,startY:event.clientY,startRowTop:(event.currentTarget.closest(".schedule-row") as HTMLElement)?.offsetTop??0,previewY:0,previewCells:0,moved:false});
  };
  const moveDrag = (event: React.PointerEvent, task: Task) => {
    if (!drag || drag.id !== task.id) return;
    pendingDragPointer.current={taskId:task.id,clientX:event.clientX,clientY:event.clientY};
    if(dragFrame.current!==null)return;
    dragFrame.current=requestAnimationFrame(()=>{
      dragFrame.current=null;const pointer=pendingDragPointer.current;pendingDragPointer.current=null;if(!pointer)return;
      trackInsertion(pointer.clientY);
      setDrag(current=>{if(!current||current.id!==pointer.taskId)return current;const distance=pointer.clientX-current.startX;return {...current,previewCells:Math.round(distance/cellWidth),previewY:pointer.clientY-current.startY,moved:current.moved||Math.abs(distance)>4||Math.abs(pointer.clientY-current.startY)>4};});
    });
  };
  const finishDrag = (event: React.PointerEvent, task: Task) => {
    if (!drag || drag.id !== task.id) return;
    if(dragFrame.current!==null){cancelAnimationFrame(dragFrame.current);dragFrame.current=null;}
    pendingDragPointer.current=null;
    const distance = event.clientX - drag.startX;
    const cells = Math.round(distance / cellWidth);
    const slot=insertionRef.current;
    const y=event.clientY-(timeline.current?.getBoundingClientRect().top??0);
    const targetRow=visibleRows[rowAtY(y)];
    let items=tasks;
    if(slot?.phase==="ready"){
      items=insertItemRow(items,task.id,slot.projectId,slot.before,crypto.randomUUID());
    } else if(targetRow&&targetRow.kind!=="insert"&&(Math.abs(event.clientY-drag.startY)>12)){
      items=moveItem(items,task.id,targetRow.project.id,targetRow.kind==="task"?targetRow.task:undefined);
    }
    if(cells)items=items.map(t=>t.id===task.id?shiftTask(t,cells*stepDays):t);
    if(items!==tasks){
      if(hasItemOverlap(items,task.id))setNotice("该位置与其他事项重叠，已回到原位。");
      else changeSchedule(current=>({...current,tasks:items}));
    }
    clearInsertion();
    if (drag.moved || Math.abs(distance) > 4) {
      suppressEdit.current = task.id;
      window.setTimeout(() => { if (suppressEdit.current === task.id) suppressEdit.current = null; }, 0);
    }
    setDrag(null);
  };
  const cancelTaskDrag=()=>{if(dragFrame.current!==null){cancelAnimationFrame(dragFrame.current);dragFrame.current=null;}pendingDragPointer.current=null;clearInsertion();setDrag(null);};
  const moveResize = (event: React.PointerEvent, task: Task) => {
    if (!resize || resize.id !== task.id) return;
    pendingResizePointer.current={taskId:task.id,clientX:event.clientX};
    if(resizeFrame.current!==null)return;
    resizeFrame.current=requestAnimationFrame(()=>{
      resizeFrame.current=null;const pointer=pendingResizePointer.current;pendingResizePointer.current=null;if(!pointer)return;
      setResize(current=>{if(!current||current.id!==pointer.taskId)return current;const distance=pointer.clientX-current.startX;const snappedDays=Math.round(distance/cellWidth)*stepDays;const durationDays=differenceInCalendarDays(new Date(task.end+"T00:00:00"),new Date(task.start+"T00:00:00"));const previewDays=current.edge==="start"?Math.min(snappedDays,durationDays):Math.max(snappedDays,-durationDays);return {...current,previewDays,moved:current.moved||Math.abs(distance)>4};});
    });
  };
  const finishResize = (event: React.PointerEvent, task: Task) => {
    if (!resize || resize.id !== task.id) return;
    if(resizeFrame.current!==null){cancelAnimationFrame(resizeFrame.current);resizeFrame.current=null;}
    pendingResizePointer.current=null;
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
  const cancelTaskResize=()=>{if(resizeFrame.current!==null){cancelAnimationFrame(resizeFrame.current);resizeFrame.current=null;}pendingResizePointer.current=null;setResize(null);};
  const selectTask = (event: React.MouseEvent, task: Task) => {
    event.stopPropagation();
    if (suppressEdit.current === task.id || rowDrag || drag?.moved || resize?.moved) return;
    setSelectedTask(task.id); setSelectedEdge(null);
  };
  const deleteTask = useCallback((id: string) => {
    changeSchedule(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id), edges: current.edges.filter(edge => edge.source.taskId !== id && edge.target.taskId !== id) }));
    setSelectedTask(null); setHoveredTask(null); setPendingPort(null);
    setNotice("事项及其关系已删除。Ctrl+Z 可撤销。");
  }, [changeSchedule]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.defaultPrevented || event.isComposing || target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="dialog"],[role="menu"],[role="listbox"]') || editing || newProjectOpen || settingsOpen || !ready) return;
      if (drag || resize || rowDrag || pan.current || linkGesture.current) return;
      const key = event.key.toLowerCase();
      if(target?.closest(".inbox-panel")&&(key==="delete"||key==="backspace"))return;
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
    setSelectedTask(task.id); setSelectedEdge(null);setCreationMonth(null);setDateErrors({});setSettingsOpen(false);setNewProjectOpen(false);
    setEditing({ ...task, outputs:taskOutputs(task).map(output=>({...output})) });
    setNewTaskOutput("");
    setEditingEdges(edges.filter(edge => edge.source.taskId === task.id || edge.target.taskId === task.id)); setEditError("");
  };
  const openEdgeEditor=(edge:Dependency)=>{
    const source=tasks.find(task=>task.id===edge.source.taskId);
    if(!source)return;
    setSelectedEdge(edge.id);setSelectedTask(null);setHoveredTask(null);setEditing(null);setSettingsOpen(false);setNewProjectOpen(false);
    setEditingEdge({...edge,outputIds:[...new Set(edge.outputIds??[])]});
    setEdgeSourceOutputs(taskOutputs(source).map(output=>({...output})));
    setNewEdgeOutput("");
  };
  const addTaskOutput=()=>{
    const text=newTaskOutput.trim();
    if(!editing||!text)return;
    setEditing({...editing,outputs:[...taskOutputs(editing),{id:crypto.randomUUID(),text}]});
    setNewTaskOutput("");
  };
  const addEdgeOutput=()=>{
    const text=newEdgeOutput.trim();
    if(!editingEdge||!text)return;
    const output={id:crypto.randomUUID(),text};
    setEdgeSourceOutputs(current=>[...current,output]);
    setEditingEdge(current=>current?{...current,outputIds:[...new Set([...(current.outputIds??[]),output.id])]}:current);
    setNewEdgeOutput("");
  };
  const saveEdge=()=>{
    if(!editingEdge)return;
    const outputIds=new Set(editingEdge.outputIds??[]);
    const normalizedOutputs=edgeSourceOutputs.map(output=>({...output,text:output.text.trim()})).filter(output=>output.text);
    const validIds=new Set(normalizedOutputs.map(output=>output.id));
    const normalizedEdge={...editingEdge,outputIds:[...outputIds].filter(id=>validIds.has(id))};
    changeSchedule(current=>({
      ...current,
      tasks:current.tasks.map(task=>task.id===normalizedEdge.source.taskId?{...task,outputs:normalizedOutputs}:task),
      edges:current.edges.map(edge=>edge.id===normalizedEdge.id?normalizedEdge:edge),
    }));
    setEditingEdge(null);setEdgeSourceOutputs([]);setNewEdgeOutput("");
  };
  const monthRange=(month:string,endMonth="")=>{
    const base=new Date(month+"-01T00:00:00");
    const sixteenth=addDays(base,15),today=startOfDay(new Date());
    const endBase=endMonth?new Date(endMonth+"-01T00:00:00"):addMonths(base,1);
    return {start:iso(today<sixteenth?today:sixteenth),end:iso(addDays(endBase,14))};
  };
  const addTaskToProject = (projectId: string, start=iso(zoom==="month"?addDays(anchor,Math.floor(scrollOffset/cellWidth)):new Date()), targetRowId?:string, exact=false) => {
    setCollapsedProjects(current => { const next = new Set(current); next.delete(projectId); return next; });
    setDateErrors({});setSettingsOpen(false);setNewProjectOpen(false);
    const month=start.slice(0,7);
    setCreationMonth(zoom==="month"&&!exact?month:null);setEndingMonth("");
    const range=zoom==="month"&&!exact?monthRange(month):{start,end:iso(addDays(new Date(start+"T00:00:00"),defaultDays-1))};
    setEditing({ ...emptyTask(projectId), ...range, type:defaultTaskType, status:statusForRange(range.start,range.end), rowId:targetRowId, id: crypto.randomUUID(), order: { [projectId]:targetRowId?(tasks.find(task=>rowId(task)===targetRowId)?.order[projectId]??tasks.length):tasks.length } }); setNewTaskOutput(""); setEditError("");
    setEditingEdges([]);
  };
  const createAtPoint=(event:React.MouseEvent<HTMLDivElement>)=>{
    if((event.target as Element).closest('button,input,select,textarea,[role="button"],[role="separator"]')||suppressPanClick.current||linkGesture.current)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const index=rowAtY(event.clientY-rect.top);
    const projectId=visibleRows[index]?.project.id??visibleRows.at(-1)?.project.id??projects[0]?.id;
    if(!projectId)return;
    event.preventDefault();event.stopPropagation();
    const day=Math.floor((event.clientX-rect.left)/cellWidth*stepDays);
    addTaskToProject(projectId,iso(addDays(anchor,day)),visibleRows[index]?.kind==="task"?rowId((visibleRows[index] as Extract<VisibleRow,{kind:"task"}>).task):undefined,true);
  };
  const toggleProject = (projectId: string) => setCollapsedProjects(current => {
    const next = new Set(current);
    if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
    return next;
  });
  const reset = () => { const freshProjects = initialProjects(); const freshTasks = initialTasks(); changeSchedule(current => ({ ...current, projects: freshProjects, tasks: freshTasks, edges: initialEdges(),tracks:tracksFromTasks(freshTasks) })); setSelectedTask(null); setCollapsedProjects(new Set()); };
  const displayGeometry = (task: Task) => {
    const activeResize = resize?.id === task.id ? resize : null;
    const previewTask = activeResize ? activeResize.edge === "start"
      ? { ...task, start: iso(addDays(new Date(task.start + "T00:00:00"), activeResize.previewDays)) }
      : { ...task, end: iso(addDays(new Date(task.end + "T00:00:00"), activeResize.previewDays)) }
      : task;
    return taskGeometry(drag?.id===task.id?shiftTask(previewTask,drag.previewCells*stepDays):previewTask);
  };
  const summaryTask = (row: Extract<VisibleRow, { kind: "summary" }>): Task => ({
    id: `summary-${row.project.id}`, title: row.project.name, projectIds: [row.project.id], order: {}, type: fallbackType,
    start: row.tasks.reduce((earliest, task) => task.start < earliest ? task.start : earliest, row.tasks[0].start),
    end: row.tasks.reduce((latest, task) => task.end > latest ? task.end : latest, row.tasks[0].end),
    status: row.tasks.every(task => task.status === "已完成") ? "已完成" : row.tasks.some(task => task.status === "进行中") ? "进行中" : "未开始",
  });
  const connectionCache=useRef(new Map<string,RenderedConnection>());
  const connections = useMemo(() => {
    const geometry = (row: VisibleRow, taskId?:string) => row.kind === "task" ? displayGeometry(row.tasks.find(task=>task.id===taskId)??row.task) : row.kind === "summary" ? taskGeometry(summaryTask(row)) : { left: 0, width: 0 };
    const clearance = layoutTokens.routeClearance;
    const obstacles=visibleRows.flatMap((row,i)=>row.kind==="task"?row.tasks.map(task=>{const g=displayGeometry(task);return {left:g.left-clearance,right:g.left+g.width+clearance,top:rowTops[i]+barTop-clearance+dragOffset(task.id),bottom:rowTops[i]+barBottom+clearance+dragOffset(task.id)};}):row.kind==="summary"?[{left:geometry(row).left-clearance,right:geometry(row).left+geometry(row).width+clearance,top:rowTops[i]+barTop-clearance,bottom:rowTops[i]+barBottom+clearance}]:[]);
    const rowsFor = (id: string) => visibleRows.flatMap((row, i) => (row.kind === "task" ? row.tasks.some(task=>task.id===id) : row.kind === "summary" && row.tasks.some(t => t.id === id)) ? [i] : []);
    const pointFor = (port: Port, rowIndex: number) => {
      const row = visibleRows[rowIndex]; const g = geometry(row,port.taskId);
      const task = row.kind === "task" ? row.tasks.find(task=>task.id===port.taskId) : row.kind === "summary" ? summaryTask(row) : undefined;
      const original = tasks.find(t => t.id === port.taskId);
      const days = task && original ? differenceInCalendarDays(new Date(portDate(port, original) + "T00:00:00"), new Date(task.start + "T00:00:00")) : 0;
      const x = g.left + portOffset(days,cellWidth/stepDays,g.width,task?.milestone);
      const y = rowTops[rowIndex] + (port.side === "top" ? barTop : barBottom)+dragOffset(port.taskId);
      return { x, y };
    };
    const previousCache=connectionCache.current;
    const nextCache=new Map<string,RenderedConnection>();
    const renderedConnections=edges.flatMap(edge => {
      const sources = rowsFor(edge.source.taskId); const targets = rowsFor(edge.target.taskId);
      const source = tasks.find(t => t.id === edge.source.taskId); const target = tasks.find(t => t.id === edge.target.taskId);
      if (!source || !target) return [];
      const pairs = new Map<string, [number, number]>();
      const nearest = (i: number, options: number[]) => [...options].sort((a,b) => Number(visibleRows[b].project.id === visibleRows[i].project.id) - Number(visibleRows[a].project.id === visibleRows[i].project.id) || Math.abs(a-i)-Math.abs(b-i))[0];
      sources.forEach(i => { const j = nearest(i,targets); if(j !== undefined) pairs.set(i+"-"+j,[i,j]); });
      targets.forEach(j => { const i = nearest(j,sources); if(i !== undefined) pairs.set(i+"-"+j,[i,j]); });
      return [...pairs].map(([key,[i,j]]) => {
        const renderKey=edge.id+"-"+key;
        const activeTaskId=drag?.id??resize?.id;
        if(activeTaskId&&edge.source.taskId!==activeTaskId&&edge.target.taskId!==activeTaskId){
          const cached=previousCache.get(renderKey);
          if(cached){nextCache.set(renderKey,cached);return cached;}
        }
        // Presentation-only routing: preserve manually stored ports when the option is disabled.
        const displayedEdge:Dependency=autoConnectionSides?{...edge,source:{...edge.source,side:j>i?"bottom":"top"},target:{...edge.target,side:j>=i?"top":"bottom"}}:edge;
        const routedEdge=displayedEdge;
        const from = pointFor(routedEdge.source,i); const to = pointFor(routedEdge.target,j);
        const outsideFrom = { x: from.x, y: from.y + (routedEdge.source.side === "top" ? -clearance : clearance) };
        const outsideTo = { x: to.x, y: to.y + (routedEdge.target.side === "top" ? -clearance : clearance) };
        const nearbyObstacles=obstaclesNearRoute(outsideFrom,outsideTo,obstacles,Math.max(cellWidth*2,timelineRowHeight*2));
        const route = routeAroundTasks(outsideFrom,outsideTo,nearbyObstacles);
        const rendered:RenderedConnection={ key:renderKey, edge:displayedEdge, from, to, path: smoothRoute([from,...route,to],layoutTokens.cornerRadius,arrowSize), conflicts: portDate(edge.target,target) < portDate(edge.source,source) };
        nextCache.set(renderKey,rendered);
        return rendered;
      });
    });
    connectionCache.current=nextCache;
    return renderedConnections;
  }, [visibleRows, tasks, edges, drag, resize, anchor, cellWidth, stepDays, autoConnectionSides, scrollOffset, barTop, barBottom, rowTops, arrowSize, timelineRowHeight]);
  const focusTask=hoveredTask??selectedTask;
  const depths = useMemo(() => relatedDepths(focusTask, edges), [focusTask, edges]);
  const highlight = (id: string) => {
    const task=tasks.find(task=>task.id===id);
    return { opacity:(task?.status==="已完成"&&completedMode==="fade"?appearance.completedOpacity/100:1)*(categoryFilter&&task?.type!==categoryFilter? .2:1) };
  };
  const startRowDrag=(event:React.PointerEvent,task:Task,projectId:string)=>{
    if(event.button!==0)return;event.preventDefault();event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    rowGesture.current={taskId:task.id,projectId,pointerId:event.pointerId,startY:event.clientY,active:false,target:""};
    setRowDrag({taskId:task.id,projectId});rowPreviewRef.current=null;
  };
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      const gesture=rowGesture.current;if(!gesture||gesture.pointerId!==event.pointerId||!timeline.current)return;
      if(!gesture.active&&Math.abs(event.clientY-gesture.startY)<5)return;
      gesture.active=true;event.preventDefault();
      const index=rowAtY(event.clientY-timeline.current.getBoundingClientRect().top);const target=visibleRows[index];if(!target)return;
      const source=tasks.find(task=>task.id===gesture.taskId);if(target.kind==="task"&&source&&rowId(target.task)===rowId(source))return;
      const after=event.clientY-timeline.current.getBoundingClientRect().top>rowTops[index]+rowHeight(target)/2;
      let before=target.kind==="task"?target.task.id:undefined;
      if(after&&target.kind==="task")before=visibleRows[index+1]?.kind==="task"&&visibleRows[index+1].project.id===target.project.id?(visibleRows[index+1] as Extract<VisibleRow,{kind:"task"}>).task.id:undefined;
      const beforeTask=tasks.find(task=>task.id===before);if(source&&beforeTask&&rowId(beforeTask)===rowId(source))return;
      const key=target.project.id+":"+before;if(key===gesture.target)return;gesture.target=key;
      const next=moveRow(tasks,gesture.taskId,gesture.projectId,target.project.id,before);rowPreviewRef.current=next;setRowPreview(next);
    };
    const finish=()=>{const gesture=rowGesture.current;if(!gesture)return;if(gesture.active&&rowPreviewRef.current){const items=rowPreviewRef.current;changeSchedule(current=>({...current,tasks:items}));suppressEdit.current=gesture.taskId;window.setTimeout(()=>{suppressEdit.current=null;},0);}rowGesture.current=null;rowPreviewRef.current=null;setRowPreview(null);setRowDrag(null);};
    const cancel=()=>{rowGesture.current=null;rowPreviewRef.current=null;setRowPreview(null);setRowDrag(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",finish);window.addEventListener("pointercancel",cancel);window.addEventListener("blur",cancel);window.addEventListener("keydown",key);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",key);};
  },[tasks,visibleRows,rowTops,changeSchedule]);
  const startProjectDrag=(event:React.PointerEvent,projectId:string)=>{
    if(event.button!==0||!event.isPrimary)return;
    event.preventDefault();event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    projectGesture.current={projectId,pointerId:event.pointerId,startY:event.clientY,active:false,target:""};
    projectPreviewRef.current=null;setProjectDrag(projectId);
  };
  useEffect(()=>{
    const move=(event:PointerEvent)=>{
      const gesture=projectGesture.current;
      if(!gesture||gesture.pointerId!==event.pointerId)return;
      if(!gesture.active&&Math.abs(event.clientY-gesture.startY)<5)return;
      gesture.active=true;event.preventDefault();
      const cards=Array.from(document.querySelectorAll<HTMLElement>("[data-project-card]"));
      const target=cards.find(card=>{const rect=card.getBoundingClientRect();return event.clientY>=rect.top&&event.clientY<=rect.bottom;})
        ??cards.reduce<HTMLElement|null>((nearest,card)=>!nearest||Math.abs(card.getBoundingClientRect().top+card.offsetHeight/2-event.clientY)<Math.abs(nearest.getBoundingClientRect().top+nearest.offsetHeight/2-event.clientY)?card:nearest,null);
      const targetId=target?.dataset.projectCard;
      if(!targetId||targetId===gesture.projectId)return;
      const rect=target.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2;
      const targetKey=`${targetId}:${after}`;
      if(targetKey===gesture.target)return;
      gesture.target=targetKey;
      const current=projectPreviewRef.current??projects;
      const moving=current.find(project=>project.id===gesture.projectId);
      if(!moving)return;
      const remaining=current.filter(project=>project.id!==gesture.projectId);
      const targetIndex=remaining.findIndex(project=>project.id===targetId);
      if(targetIndex<0)return;
      const insertionIndex=targetIndex+(after?1:0);
      const next=[...remaining.slice(0,insertionIndex),moving,...remaining.slice(insertionIndex)];
      projectPreviewRef.current=next;setProjectPreview(next);
    };
    const finish=()=>{
      const gesture=projectGesture.current;if(!gesture)return;
      const preview=projectPreviewRef.current;
      if(gesture.active&&preview){
        const order=new Map(preview.map((project,index)=>[project.id,index]));
        changeSchedule(current=>({...current,projects:[...current.projects].sort((a,b)=>(order.get(a.id)??Number.MAX_SAFE_INTEGER)-(order.get(b.id)??Number.MAX_SAFE_INTEGER))}));
      }
      projectGesture.current=null;projectPreviewRef.current=null;setProjectPreview(null);setProjectDrag(null);
    };
    const cancel=()=>{projectGesture.current=null;projectPreviewRef.current=null;setProjectPreview(null);setProjectDrag(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==="Escape")cancel();};
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",finish);window.addEventListener("pointercancel",cancel);window.addEventListener("blur",cancel);window.addEventListener("keydown",key);
    return()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",key);};
  },[projects,changeSchedule]);
  const linkPortAt = (element:HTMLElement, task:Task, side:Port["side"], clientX:number) => {
    const rect=element.getBoundingClientRect(), canvas=timeline.current!.getBoundingClientRect();
    const day=Number(element.dataset.linkDay);
    return { port:{taskId:task.id,day,side}, point:{x:rect.left-canvas.left+rect.width/2,y:rect.top-canvas.top+(side==="top"?rect.height+handleGap:-handleGap)} };
  };
  const startLink = (event:React.PointerEvent<HTMLElement>,task:Task,side:Port["side"]) => {
    if(event.button!==0||!event.isPrimary)return;
    event.stopPropagation(); event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const {port,point}=linkPortAt(event.currentTarget,task,side,event.clientX);
    suppressPortClick.current=false;
    const gesture:LinkGesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:true,source:port,from:point,to:point,target:null,timer:setTimeout(()=>{},0)};
    linkGesture.current=gesture;suppressPortClick.current=true;setPendingPort(null);setHoveredTask(null);setLinkPreview({...gesture});
  };
  const startEndpoint = (event:React.PointerEvent<SVGCircleElement>, connection:(typeof connections)[number], movingEnd:"source"|"target") => {
    if(event.button!==0||!event.isPrimary)return;
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    const fixedEnd=movingEnd==="source"?"target":"source";
    const gesture:LinkGesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:true,edgeId:connection.edge.id,movingEnd,source:connection.edge[fixedEnd],from:movingEnd==="source"?connection.to:connection.from,to:movingEnd==="source"?connection.from:connection.to,target:connection.edge[movingEnd],timer:setTimeout(()=>{},0)};
    linkGesture.current=gesture;suppressPortClick.current=true;setPendingPort(null);setHoveredTask(null);setLinkPreview({...gesture});
  };
  useEffect(()=>{
    const cancel=()=>{
      const current=linkGesture.current;
      if(current)clearTimeout(current.timer);
      if(linkMoveFrame.current!==null){cancelAnimationFrame(linkMoveFrame.current);linkMoveFrame.current=null;}
      pendingLinkPointer.current=null;
      linkGesture.current=null; setLinkPreview(null);
      window.setTimeout(()=>{suppressPortClick.current=false;},0);
    };
    const update=(clientX:number,clientY:number)=>{
      const current=linkGesture.current;
      if(!current||!current.active||!timeline.current)return;
      const canvas=timeline.current.getBoundingClientRect();
      current.to={x:clientX-canvas.left,y:clientY-canvas.top}; current.target=null;
      let nearest=20;
      for(const element of Array.from(timeline.current.querySelectorAll<HTMLElement>("[data-link-task]"))){
        const task=tasks.find(item=>item.id===element.dataset.linkTask);
        if(!task||task.id===current.source.taskId)continue;
        const side=element.dataset.linkSide as Port["side"];
        const {port,point}=linkPortAt(element,task,side,clientX);
        const distance=Math.hypot(point.x-current.to.x,point.y-current.to.y);
        if(distance<nearest){nearest=distance;current.target=port;}
      }
      if(current.target){
        const target=current.target;
        const candidates=Array.from(timeline.current.querySelectorAll<HTMLElement>("[data-link-task]")).filter(el=>el.dataset.linkTask===target.taskId&&el.dataset.linkSide===target.side&&Number(el.dataset.linkDay)===target.day);
        const task=tasks.find(t=>t.id===target.taskId)!;
        const points=candidates.map(el=>linkPortAt(el,task,target.side,clientX).point);
        current.to=points.sort((a,b)=>Math.hypot(a.x-current.to.x,a.y-current.to.y)-Math.hypot(b.x-current.to.x,b.y-current.to.y))[0];
      }
      setLinkPreview({...current});
    };
    const move=(event:PointerEvent)=>{
      const current=linkGesture.current;
      if(!current||current.pointerId!==event.pointerId||!timeline.current)return;
      if(!current.active) {
        if(Math.hypot(event.clientX-current.x,event.clientY-current.y)>8){suppressPortClick.current=true;clearTimeout(current.timer);}
        return;
      }
      event.preventDefault();pendingLinkPointer.current={clientX:event.clientX,clientY:event.clientY};
      if(linkMoveFrame.current!==null)return;
      linkMoveFrame.current=requestAnimationFrame(()=>{linkMoveFrame.current=null;const pointer=pendingLinkPointer.current;pendingLinkPointer.current=null;if(pointer)update(pointer.clientX,pointer.clientY);});
    };
    const finish=(event:PointerEvent)=>{
      const current=linkGesture.current;if(!current||current.pointerId!==event.pointerId)return;
      if(linkMoveFrame.current!==null){cancelAnimationFrame(linkMoveFrame.current);linkMoveFrame.current=null;}
      pendingLinkPointer.current=null;update(event.clientX,event.clientY);
      if(current.active&&current.target){
        const previousEdge=edges.find(item=>item.id===current.edgeId);
        const source=current.movingEnd==="source"?current.target:current.source;
        const edge:Dependency={id:current.edgeId??crypto.randomUUID(),source,target:current.movingEnd==="source"?current.source:current.target,outputIds:previousEdge?.source.taskId===source.taskId?[...(previousEdge.outputIds??[])]:[]};
        const otherEdges=edges.filter(item=>item.id!==current.edgeId);
        if(hasCycle([...otherEdges,edge]))setNotice("这条连线会形成循环依赖，请选择其他事项。");
        else if(otherEdges.some(item=>JSON.stringify(item.source)===JSON.stringify(edge.source)&&JSON.stringify(item.target)===JSON.stringify(edge.target)))setNotice("这两个节点已经连接。");
        else {changeSchedule(state=>{
          if(current.edgeId){
            const existing=state.edges.find(item=>item.id===current.edgeId);
            if(JSON.stringify(existing)===JSON.stringify(edge))return state;
            return {...state,edges:state.edges.map(item=>item.id===current.edgeId?edge:item)};
          }
          return {...state,edges:[...state.edges,edge]};
        });setSelectedEdge(edge.id);setSelectedTask(null);setNotice("");}
      }
      cancel();
    };
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"&&linkGesture.current){event.preventDefault();suppressPortClick.current=true;cancel();}};
    window.addEventListener("pointermove",move,{passive:false});window.addEventListener("pointerup",finish);window.addEventListener("pointercancel",cancel);window.addEventListener("blur",cancel);window.addEventListener("keydown",escape);
    return ()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",finish);window.removeEventListener("pointercancel",cancel);window.removeEventListener("blur",cancel);window.removeEventListener("keydown",escape);};
  },[tasks,edges,anchor,cellWidth,stepDays,changeSchedule,handleWidth,handleGap]);
  useEffect(()=>()=>{if(linkGesture.current)clearTimeout(linkGesture.current.timer);},[]);
  const previewPath = useMemo(()=>{
    if(!linkPreview)return "";
    const {from,to,source,target}=linkPreview;
    const clearance=layoutTokens.routeClearance;
    const outsideFrom={x:from.x,y:from.y+(source.side==="top"?-clearance:clearance)};
    const outsideTo=target?{x:to.x,y:to.y+(target.side==="top"?-clearance:clearance)}:to;
    const obstacles=visibleRows.flatMap((row,i)=>{
      const items=row.kind==="task"?row.tasks:row.kind==="summary"?[summaryTask(row)]:[];
      return items.map(task=>{const g=taskGeometry(task);return {left:g.left-clearance,right:g.left+g.width+clearance,top:rowTops[i]+barTop-clearance,bottom:rowTops[i]+barBottom+clearance};});
    });
    const nearbyObstacles=obstaclesNearRoute(outsideFrom,outsideTo,obstacles,Math.max(cellWidth*2,timelineRowHeight*2));
    return smoothRoute([from,...routeAroundTasks(outsideFrom,outsideTo,nearbyObstacles),to],layoutTokens.cornerRadius,arrowSize);
  },[linkPreview,visibleRows,anchor,cellWidth,stepDays,barTop,barBottom,arrowSize,rowTops,timelineRowHeight]);

  const relationEditor = (direction: "source" | "target") => {
    if (!editing) return null;
    const own = direction === "source" ? "target" : "source";
    const selected = editingEdges.filter(edge => edge[own].taskId === editing.id);
    return <div className="grid gap-2"><Label>{direction === "source" ? t("前置任务（多选）") : t("后接任务（多选）")}</Label>
      <Select value="" onValueChange={id => {
        const other = tasks.find(task => task.id === id)!;
        const source = direction === "source" ? other : editing; const target = direction === "source" ? editing : other;
        setEditingEdges(current => [...current,{ id: crypto.randomUUID(),source: {taskId:source.id,day:duration(source),side:"bottom"},target:{taskId:target.id,day:0,side:"top"} }]);
      }}><SelectTrigger><SelectValue placeholder={t("＋ 添加关联任务")} /></SelectTrigger><SelectContent>{tasks.filter(task => task.id !== editing.id).map(task => <SelectItem key={task.id} value={task.id} className="choice-tile my-1 rounded-md" style={{"--choice-color":colors[task.type]||fallbackColor} as React.CSSProperties}><span className="mr-2 inline-block size-2 rounded-full" style={{background:colors[task.type]||fallbackColor}}/>{t(task.title)}</SelectItem>)}</SelectContent></Select>
      {selected.map(edge => <div key={edge.id} className="choice-tile rounded-lg border p-3 text-sm" style={{"--choice-color":colors[tasks.find(task=>task.id===edge[direction].taskId)?.type||fallbackType]||fallbackColor} as React.CSSProperties}>
        <div className="mb-2 flex items-center justify-between"><span>{t(tasks.find(task => task.id === edge[direction].taskId)?.title??"")}</span><button aria-label={t("移除关系")} onClick={() => setEditingEdges(current => current.filter(item => item.id !== edge.id))}><X size={15}/></button></div>
        {(["source","target"] as const).map(end => { const task = edge[end].taskId === editing.id ? editing : tasks.find(t => t.id === edge[end].taskId); if(!task) return null; return <div key={end} className="mb-2 grid grid-cols-[64px_minmax(0,1fr)] items-start gap-2">
          <span className="pt-2 text-sm">{end === "source" ? t("输出时间") : t("输入时间")}</span>
          <ManualDateField label={end==="source" ? t("输出时间") : t("输入时间")} min={task.start} max={task.end} value={portDate(edge[end],task)} onInvalid={invalid=>setDateErrors(current=>({...current,[edge.id+"-"+end]:invalid}))} onValid={value=>{const day=differenceInCalendarDays(new Date(value+"T00:00:00"),new Date(task.start+"T00:00:00"));setEditingEdges(current=>current.map(item=>item.id===edge.id?{...item,[end]:{...item[end],day}}:item));}}/>
        </div>; })}
      </div>)}
    </div>;
  };

  const renderTask=(task:Task)=>{
    const g=displayGeometry(task);
    const activeDrag=drag?.id===task.id?drag:null;
    const color=colors[task.type]||fallbackColor;
    const taskStyle={"--task-color":color,left:g.left,top:barTop,width:g.width,height:appearance.barHeight,...highlight(task.id)} as React.CSSProperties;
    if(g.placeholder&&!activeDrag)return <button data-task-motion={task.id} data-located={locatedTask===task.id||undefined} className="task-body absolute overflow-hidden" aria-label={t(g.placeholder==="future"?"{0}，晚于当前视图":"{0}，早于当前视图", t(task.title))} title={t(task.title)+" · "+task.start+"—"+task.end} aria-pressed={selectedTask===task.id} style={{...taskStyle,zIndex:task.milestone?45:20}} onClick={event=>selectTask(event,task)} onDoubleClick={event=>{event.stopPropagation();focusDate(new Date(task.start+"T00:00:00"));setSelectedTask(task.id);}} onMouseEnter={()=>setHoveredTask(task.id)} onMouseLeave={()=>setHoveredTask(null)}>{g.placeholder==="future"?"›":"‹"}</button>;
    const milestoneSize=appearance.barHeight/Math.SQRT2;
    const pixelsPerDay=cellWidth/stepDays;
    const nodeWidth=Math.min(pixelsPerDay,Math.max(handleWidth,8));
    const nodeDays=task.milestone?[0]:visiblePortDays(duration(task),g.left,pixelsPerDay,scrollOffset,scrollOffset+Math.max(0,viewportWidth-frozenWidth));
    const expanding=hoveredTask===task.id&&!drag&&!resize&&!linkPreview;
    const expansionScale=expanding?(task.milestone?1.3:Math.max(taskExpansionScales[task.id]??1,1.06)):1;
    const expansionX=expandedInset(task.milestone?milestoneSize:g.width,expansionScale);
    const expansionY=expandedInset(task.milestone?milestoneSize:appearance.barHeight,expansionScale);
    const baseTop=task.milestone?(timelineRowHeight-milestoneSize)/2:barTop;
    const baseBottom=task.milestone?baseTop+milestoneSize:barBottom;
    return <TooltipProvider><Tooltip open={taskHoverHints&&hoveredTask===task.id&&!drag&&!resize&&!linkPreview}><TooltipTrigger asChild>
      <button data-task-motion={task.id} data-located={locatedTask===task.id||undefined} aria-label={t(task.title)} aria-pressed={selectedTask===task.id}
        onPointerDown={event=>startTaskDrag(event,task)} onPointerMove={event=>moveDrag(event,task)} onPointerUp={event=>finishDrag(event,task)}
        onPointerCancel={cancelTaskDrag} onMouseEnter={()=>setHoveredTask(task.id)} onMouseLeave={()=>setHoveredTask(null)}
        onClick={event=>selectTask(event,task)} onDoubleClick={()=>openTask(task)}
        className={`task-body absolute flex touch-none select-none items-center text-left ${task.milestone?"milestone justify-center rotate-45":"px-2"} ${activeDrag?"cursor-grabbing":"cursor-grab"}`}
        style={{...taskStyle,scale:task.milestone&&expanding?1.3:1,...(task.milestone?{width:milestoneSize,height:milestoneSize,left:g.left+(g.width-milestoneSize)/2,top:(timelineRowHeight-milestoneSize)/2}:{}),translate:activeDrag?`0 ${dragOffset(task.id)}px`:undefined,zIndex:task.milestone?45:hoveredTask===task.id&&!linkPreview?40:20}}>
        {task.milestone ? <Diamond size={layoutTokens.arrowSize*2} className="-rotate-45"/> : <>
          <ExpandingTaskLabel title={t(task.title)} width={g.width} height={appearance.barHeight} active={expanding} completed={task.status==="已完成"} onScaleChange={scale=>registerTaskExpansion(task.id,scale)}/>
          {(["start","end"] as const).map(edge=><span key={edge} role="separator" aria-label={t("调整{0}的{1}日期", t(task.title), edge==="start" ? t("开始") : t("结束"))}
            onClick={event=>event.stopPropagation()} onPointerDown={event=>{event.stopPropagation();if(resizeFrame.current!==null){cancelAnimationFrame(resizeFrame.current);resizeFrame.current=null;}pendingResizePointer.current=null;event.currentTarget.setPointerCapture(event.pointerId);setResize({id:task.id,edge,startX:event.clientX,previewDays:0,moved:false});}}
            onPointerMove={event=>moveResize(event,task)} onPointerUp={event=>finishResize(event,task)} onPointerCancel={cancelTaskResize}
            className="task-resize-edge absolute inset-y-0 z-10 cursor-ew-resize touch-none" style={{[edge==="start"?"left":"right"]:-expansionX-5,width:10}}/>)}
        </>}
      </button></TooltipTrigger><TooltipContent side="top" sideOffset={12} className="task-action-tip">
        {task.milestone&&<div className="task-tip-milestone"><span className="meta">{t("里程碑")}</span><strong>{t(task.title)}</strong><span className="meta">{task.start}</span></div>}
        <div className="task-tip-title">{t("可执行操作")}</div>
        <div className="task-tip-actions">
          <span><kbd>{t("单击")}</kbd>{t("选中事项")}</span>
          <span><kbd>{t("双击")}</kbd>{t("编辑事项")}</span>
          <span><kbd>{t("拖动事项")}</kbd>{t("移动日期或换行")}</span>
          {!task.milestone&&<span><kbd>{t("左右边缘")}</kbd>{t("调整起止日期")}</span>}
          <span><kbd>{t("上下节点")}</kbd>{t("拖动建立连线")}</span>
        </div>
        <span className="task-tip-setting">{t("可在设置中关闭此提示")}</span>
      </TooltipContent>
      {(["top","bottom"] as const).flatMap(side=>nodeDays.map(day=><span key={side+"-"+day} data-task-motion={task.id} role="button" tabIndex={-1}
        aria-label={t("{0} {1}{2}连接点", t(task.title), iso(addDays(new Date(task.start+"T00:00:00"),day)), (side==="top"?t("顶部"):t("底部")))}
        data-link-task={task.id} data-link-side={side} data-link-day={day} title={t("{0} · 拖动建立连线", iso(addDays(new Date(task.start+"T00:00:00"),day)))}
        onPointerDown={event=>startLink(event,task,side)} onClick={event=>{event.preventDefault();event.stopPropagation();}}
        className="date-node absolute z-50 cursor-crosshair"
        data-connecting={!!linkPreview}
        style={{left:g.left+portOffset(day,pixelsPerDay,g.width,task.milestone)-nodeWidth/2,width:nodeWidth,top:(side==="top"?baseTop-expansionY-handleGap-handleWidth:baseBottom+expansionY+handleGap)+dragOffset(task.id),height:handleWidth,"--node-size":Math.min(handleWidth,pixelsPerDay*.6)+"px"} as React.CSSProperties}/>))}

    </Tooltip></TooltipProvider>;
  };
  const inboxTarget=(event:React.DragEvent)=>{
    if(!inboxDragging||!timeline.current||!viewport.current)return null;
    const rect=timeline.current.getBoundingClientRect(),view=viewport.current.getBoundingClientRect();
    if(event.clientX<view.left+frozenWidth||event.clientX>view.right||event.clientY<view.top||event.clientY>view.bottom)return null;
    const index=rowAtY(event.clientY-rect.top),row=visibleRows[index];
    const day=Math.floor((event.clientX-rect.left)/cellWidth*stepDays);
    return {day,left:day*cellWidth/stepDays,top:row?rowTops[index]:0,height:row?rowHeight(row):timelineRowHeight,row};
  };
  const todoItems=useMemo(()=>[...inbox,...projectTasksToTodo(tasks)],[inbox,tasks]);
  const scheduleInbox=(date:string)=>{
    const id=inboxDragging;
    setInboxDrop(null);setInboxDragging(null);clearInsertion();
    if(!id)return;
    const item=todoItems.find(entry=>entry.id===id);if(!item)return;
    changeSchedule(current=>item.taskId?{...current,tasks:current.tasks.map(task=>task.id!==item.taskId?task:shiftTask(task,differenceInCalendarDays(new Date(date+"T00:00:00"),new Date(task.start+"T00:00:00"))))}:{...current,inbox:current.inbox.map(entry=>entry.id===id?{...entry,date}:entry)});
    setNotice("已加入当日待办。Ctrl+Z 可撤销。");
  };
  const placeTodoInTimeline=(id:string,date:string,target:Extract<VisibleRow,{kind:"task"}>|null,slot:Insertion|null)=>{
    const item=todoItems.find(entry=>entry.id===id);if(!item)return;
    const projectId=slot?.projectId??target?.project.id;if(!projectId)return;
    const taskId=item.taskId??item.id;
    let nextTasks=tasks;
    let nextInbox=inbox;
    if(item.taskId){
      nextTasks=nextTasks.map(task=>task.id===item.taskId?{...task,start:date,end:date,status:statusForRange(date,date),urgency:item.urgency,todoKind:item.kind}:task);
    }else{
      const task:Task={id:taskId,title:item.text,projectIds:[projectId],order:{[projectId]:tasks.length},type:defaultTaskType,start:date,end:date,status:statusForRange(date,date),urgency:item.urgency,todoKind:item.kind};
      nextTasks=[...nextTasks,task];nextInbox=nextInbox.filter(entry=>entry.id!==item.id);
    }
    nextTasks=slot?.phase==="ready"?insertItemRow(nextTasks,taskId,projectId,slot.before,crypto.randomUUID()):moveItem(nextTasks,taskId,projectId,target?.task);
    if(hasItemOverlap(nextTasks,taskId)){setNotice("该位置与其他事项重叠，已回到原位。");return;}
    changeSchedule(current=>({...current,tasks:nextTasks,inbox:nextInbox}));
    setNotice(slot?.phase==="ready"?"已在新行建立一日事项。Ctrl+Z 可撤销。":"已在该行建立一日事项。Ctrl+Z 可撤销。");
  };
  const dropInbox=(event:React.DragEvent)=>{
    const target=inboxTarget(event);
    if(!target)return;
    event.preventDefault();event.stopPropagation();
    const id=inboxDragging,date=iso(addDays(anchor,target.day)),slot=insertionRef.current;
    setInboxDrop(null);setInboxDragging(null);
    if(id&&(slot?.phase==="ready"||target.row?.kind==="task"))placeTodoInTimeline(id,date,target.row?.kind==="task"?target.row:null,slot);
    else if(id)scheduleInbox(date);
    clearInsertion();
  };
  const updateTodoItems=(items:InboxItem[])=>changeSchedule(current=>({...current,...reconcileTodoList(current.tasks,current.edges,items,iso(new Date()))}));
  const deleteTodoItem=(item:InboxItem)=>{
    if(item.taskId){
      const index=tasks.findIndex(task=>task.id===item.taskId),task=tasks[index];if(!task)return;
      todoDeleteBackup.current={kind:"task",task,track:trackById.get(rowId(task)),index,edges:edges.filter(edge=>edge.source.taskId===task.id||edge.target.taskId===task.id)};
      changeSchedule(current=>({...current,tasks:current.tasks.filter(entry=>entry.id!==task.id),edges:current.edges.filter(edge=>edge.source.taskId!==task.id&&edge.target.taskId!==task.id)}));
      if(selectedTask===task.id)setSelectedTask(null);if(hoveredTask===task.id)setHoveredTask(null);
    }else{
      const index=inbox.findIndex(entry=>entry.id===item.id),source=inbox[index];if(!source)return;
      todoDeleteBackup.current={kind:"inbox",item:source,index};
      changeSchedule(current=>({...current,inbox:current.inbox.filter(entry=>entry.id!==source.id)}));
    }
  };
  const undoTodoDelete=()=>{
    const backup=todoDeleteBackup.current;if(!backup)return;todoDeleteBackup.current=null;
    changeSchedule(current=>{
      if(backup.kind==="inbox"){
        if(current.inbox.some(item=>item.id===backup.item.id))return current;
        const next=[...current.inbox];next.splice(Math.min(backup.index,next.length),0,backup.item);return {...current,inbox:next};
      }
      if(current.tasks.some(task=>task.id===backup.task.id))return current;
      const next=[...current.tasks];next.splice(Math.min(backup.index,next.length),0,backup.task);
      const edgeIds=new Set(current.edges.map(edge=>edge.id)),trackIds=new Set(current.tracks.map(track=>track.id));return {...current,tasks:next,tracks:backup.track&&!trackIds.has(backup.track.id)?[...current.tracks,backup.track]:current.tracks,edges:[...current.edges,...backup.edges.filter(edge=>!edgeIds.has(edge.id))]};
    });
    setNotice("已撤回删除。");
  };
  const timelineTitle=wordingStyle==="humorous"?t("怎么上个大学那么多事儿"):"TimeLine";
  const inboxTitle=wordingStyle==="humorous"?t("嗯哼⚡️啊哈哈还有这么多活🔥要干💦"):"TodoList";
  const addWorkType=(selectForEditing=false)=>{
    const name=customTypeName.trim().slice(0,24);if(!name){setNotice("请输入工作类型名称。");return;}
    if(colors[name]){setNotice("这个工作类型已经存在。");return;}
    setColors(current=>({...current,[name]:customTypeColor}));
    if(selectForEditing&&editing)setEditing({...editing,type:name});
    setCustomTypeName("");setCustomTypeOpen(false);setNotice("工作类型已添加。");
  };
  const commitWorkTypeRename=(from:string,requestedName:string)=>{
    const result=renameWorkType(tasks,colors,from,requestedName);
    setWorkTypeDrafts(current=>{const next={...current};delete next[from];return next;});
    if(result.error==="empty"){setNotice("工作类型名称不能为空。");return;}
    if(result.error==="duplicate"){setNotice("这个工作类型已经存在。");return;}
    if(!result.renamed)return;
    const name=result.name;
    changeSchedule(current=>({...current,tasks:current.tasks.map(task=>task.type===from?{...task,type:name}:task),tracks:current.tracks.map(track=>track.type===from?{...track,type:name}:track)}));
    setColors(result.colors);
    if(defaultTaskType===from)setDefaultTaskType(name);
    if(categoryFilter===from)setCategoryFilter(name);
    if(editing?.type===from)setEditing({...editing,type:name});
    if(editingTrack?.type===from)setEditingTrack({...editingTrack,type:name});
    setPersonalDefaults(current=>({
      ...current,
      tasks:current.tasks?{...current.tasks,defaultTaskType:current.tasks.defaultTaskType===from?name:current.tasks.defaultTaskType}:current.tasks,
      appearance:current.appearance?{...current.appearance,colors:renameWorkTypeColorMap(current.appearance.colors,from,name)}:current.appearance,
    }));
    setCustomColorPresets(current=>current.map(preset=>({...preset,categories:renameWorkTypeColorMap(preset.categories,from,name)})));
    setNotice("工作类型名称已更新。");
  };
  const confirmWorkTypeDelete=()=>{
    const name=pendingWorkTypeDelete;if(!name)return;
    const result=deleteWorkType(tasks,colors,name),replacement=result.replacement;
    if(!replacement){setPendingWorkTypeDelete(null);return;}
    changeSchedule(current=>({...current,tasks:deleteWorkType(current.tasks,colors,name).tasks,tracks:current.tracks.map(track=>track.type===name?{...track,type:replacement}:track)}));
    setColors(result.colors);
    if(defaultTaskType===name)setDefaultTaskType(replacement);
    if(categoryFilter===name)setCategoryFilter(null);
    if(editing?.type===name)setEditing({...editing,type:replacement});
    if(editingTrack?.type===name)setEditingTrack({...editingTrack,type:replacement});
    setPendingWorkTypeDelete(null);setNotice(t("工作类型已删除，相关事项已转入“{0}”。",t(replacement)));
  };
  const resetSettings=(category= settingsCategory)=>{
    if(category==="general"){const d=personalDefaults.general;setEditorMode(d?.editorMode??"panel");setWordingStyle(d?.wordingStyle??"default");}
    if(category==="timeline"){const d=personalDefaults.timeline;setWeekStart(d?.weekStart??1);setDayWidth(nearestPreset(d?.dayWidth??54,[36,54,68,80]));setTimelineRowHeight(nearestPreset(d?.timelineRowHeight??64,[48,64,76,88]));setInsertionDelay(nearestPreset(d?.insertionDelay??300,[150,300,600]));setAppearance(current=>({...current,weekends:d?.weekends??true,weekBoundaries:d?.weekBoundaries??true}));}
    if(category==="tasks"){const d=personalDefaults.tasks;setDefaultDays(d?.defaultDays??4);setDefaultTaskType(d?.defaultTaskType&&colors[d.defaultTaskType]?d.defaultTaskType:fallbackType);setHoverSpeed(d?.hoverSpeed??"medium");setTaskHoverHints(d?.taskHoverHints??true);setCompletedMode(d?.completedMode??"fade");setAppearance(current=>({...current,barHeight:snapAppearanceValue("barHeight",d?.barHeight??24),barRadius:snapAppearanceValue("barRadius",d?.barRadius??4),barFill:snapAppearanceValue("barFill",d?.barFill??16),completedOpacity:snapAppearanceValue("completedOpacity",d?.completedOpacity??55)}));}
    if(category==="links"){const d=personalDefaults.links;setHandleGap(nearestPreset(d?.handleGap??4,[2,4,8,12]));setHandleWidth(nearestPreset(d?.handleWidth??6,[4,6,8,10]));setAutoConnectionSides(d?.autoConnectionSides??true);setEdgeLevel(d?.edgeLevel??"regular");setArrowLevel(d?.arrowLevel??"regular");setAppearance(current=>({...current,lineOpacity:snapAppearanceValue("lineOpacity",d?.lineOpacity??22)}));}
    if(category==="inbox"){const d=personalDefaults.inbox;setInboxKind(d?.inboxKind??"checklist");setInboxCompleted(d?.inboxCompleted??"show");}
    if(category==="appearance"){const d=personalDefaults.appearance;setTheme(d?.theme??"system");setPrimaryColor(d?.primaryColor??"#4C7EF3");setColors(d?.colors?restoreCategories(d.colors):categoryDefaults);setTablePalettes(d?.tablePalettes?migrateTablePalettes(d.tablePalettes,2):defaultTablePalettes);}
  };
  const saveCategoryDefault=()=>{
    const value=settingsCategory==="general"?{editorMode,wordingStyle}:settingsCategory==="timeline"?{weekStart,dayWidth,timelineRowHeight,insertionDelay,weekends:appearance.weekends,weekBoundaries:appearance.weekBoundaries}:settingsCategory==="tasks"?{defaultDays,defaultTaskType,hoverSpeed,taskHoverHints,completedMode,barHeight:appearance.barHeight,barRadius:appearance.barRadius,barFill:appearance.barFill,completedOpacity:appearance.completedOpacity}:settingsCategory==="links"?{handleGap,handleWidth,autoConnectionSides,lineOpacity:appearance.lineOpacity,edgeLevel,arrowLevel}:settingsCategory==="inbox"?{inboxKind,inboxCompleted}:{theme,primaryColor,colors:{...colors},tablePalettes:structuredClone(tablePalettes)};
    setPersonalDefaults(current=>({...current,[settingsCategory]:value} as PersonalDefaults));setNotice("当前选项已设为个人默认。");
  };
  const applyColorPreset=(preset:ColorPreset)=>{setPrimaryColor(preset.primary);setColors(current=>{const palette=Object.values(preset.categories);return Object.fromEntries(Object.keys(current).map((name,index)=>[name,preset.categories[name]??palette[index%palette.length]??fallbackColor]));});setTablePalettes(current=>({...current,[preset.mode]:{...preset.table}}));if(theme!==preset.mode)setTheme(preset.mode);};
  const saveColorPreset=()=>{
    const requestedName=presetName.trim();
    setCustomColorPresets(current=>{const name=requestedName||nextCustomPresetName(current,language==="zh"?"自定义":"Custom");const existing=current.find(item=>item.mode===resolvedTheme&&item.name.toLocaleLowerCase()===name.toLocaleLowerCase());const saved:ColorPreset={id:existing?.id??crypto.randomUUID(),name,mode:resolvedTheme,primary:primaryColor,categories:{...colors},table:{...tablePalettes[resolvedTheme]}};return existing?current.map(item=>item.id===existing.id?saved:item):[...current,saved];});
    setPresetName("");setNotice("颜色预设已保存。");
  };
  const exportJson=async()=>{
    const contents=JSON.stringify(createBackup(persistedState),null,2);
    if(desktop){
      try{const result=await saveDesktopJson(contents,backupFilename());if(result==="saved")setNotice("JSON 备份已导出。");return;}
      catch{setNotice("无法写入这个备份文件。");return;}
    }
    const blob=new Blob([contents],{type:"application/json"});
    const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=backupFilename();link.click();URL.revokeObjectURL(url);
    setNotice("JSON 备份已导出。");
  };
  const chooseJsonImport=()=>importInputRef.current?.click();
  const readJsonImport=async(event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];event.target.value="";if(!file)return;
    try{setPendingImport({name:file.name,state:parseBackup(await file.text())});}
    catch(error){setNotice(error instanceof Error&&error.message==="future_backup"?"备份版本高于当前应用，请先更新应用。":"无法读取这个备份文件。");}
  };
  const confirmJsonImport=()=>{
    if(!pendingImport)return;
    try{localStorage.setItem("research-gantt-before-import",JSON.stringify(createBackup(persistedState)));}catch{}
    applyPersistedState(pendingImport.state);setPendingImport(null);setSelectedTask(null);setSelectedEdge(null);setEditing(null);setNotice("数据已导入并迁移到最新版本。");
  };
  const resetAllSettings=()=>{(["general","timeline","tasks","links","inbox","appearance"] as const).forEach(resetSettings);};
  const onInboxSizeChange=useCallback((size:{width:number;height:number})=>setInboxSize(size),[]);
  const settingsPresentation=panelMode?{...editorPresentation,style:{...editorPresentation.style,width:settingsWidth,minWidth:"min(620px, calc(100vw - 32px))",maxWidth:"min(1040px, calc(100vw - 32px))"}}:editorPresentation;
  const workspaceInset=panelMode?(settingsOpen?`min(${settingsWidth+16}px, calc(100vw - 16px))`:(editing||newProjectOpen?"376px":"0px")):"0px";
  const taskColumnDivider=(tabIndex=-1)=><button type="button" role="separator" aria-orientation="vertical" aria-label={t("拖动调整事项列宽度")} aria-valuemin={TASK_COLUMN_MIN} aria-valuemax={TASK_COLUMN_MAX} aria-valuenow={taskColumnWidth} tabIndex={tabIndex} className="timeline-column-divider" onPointerDown={startTaskColumnResize} onPointerMove={moveTaskColumnResize} onPointerUp={endTaskColumnResize} onPointerCancel={endTaskColumnResize} onLostPointerCapture={endTaskColumnResize} onKeyDown={keyTaskColumnResize}/>;
  const hoveredDependency=hoveredEdge?edges.find(edge=>edge.id===hoveredEdge.id):undefined;
  const hoveredSource=hoveredDependency?tasks.find(task=>task.id===hoveredDependency.source.taskId):undefined;
  const hoveredTarget=hoveredDependency?tasks.find(task=>task.id===hoveredDependency.target.taskId):undefined;
  const hoveredOutputs=hoveredDependency&&hoveredSource?dependencyOutputs(hoveredDependency,hoveredSource):[];
  return <main onClick={event => { if (!(event.target as Element).closest("button,input,select,textarea,[role]")) {setSelectedTask(null);setSelectedEdge(null);} }} className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
    <input ref={importInputRef} className="sr-only" type="file" accept="application/json,.json" onChange={readJsonImport}/>
    {notice&&<div role="status" className="app-toast fixed left-1/2 top-3 z-[150] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg" onMouseEnter={()=>setNoticeHovered(true)} onMouseLeave={()=>setNoticeHovered(false)} onFocusCapture={()=>setNoticeHovered(true)} onBlurCapture={()=>setNoticeHovered(false)}><span>{t(notice)}</span>{projectUndoSeconds>0&&<button className="toast-undo" onClick={undoProjectDelete}>{t("撤回")} <span>{projectUndoSeconds}s</span></button>}<button aria-label={t("关闭提示")} onClick={()=>{setNotice("");setNoticeHovered(false);projectDeleteBackup.current=null;setProjectUndoSeconds(0);}}><X size={15}/></button></div>}
    <header ref={headerRef} className="toolbar border-b border-[var(--border)] bg-[var(--card)]">
      <div className="toolbar-brand">
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="squitle-menu" aria-label={t("展开菜单")} title="Squitle"><img src="/brand/squitle-pixel.png" alt="" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={()=>{setEditing(null);setNewProjectOpen(false);setSettingsOpen(true);}}><Settings/>{t("设置")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={()=>setEditorMode(editorMode==="panel"?"dialog":"panel")}>{editorMode==="panel" ? t("切换为弹窗模式") : t("切换为左侧展开模式")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={chooseJsonImport}><Upload/>{t("导入 JSON")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={exportJson}><Download/>{t("导出 JSON")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
        <Tabs className="zoom-control" value={theme} onValueChange={value=>setTheme(value as "light"|"dark"|"system")} aria-label={t("主题切换")}><TabsList>{([["light","白天",Sun],["dark","晚上",Moon],["system","跟随系统",Monitor]] as const).map(([value,label,Icon])=><TabsTrigger key={value} value={value} aria-label={t(label)} title={t(label)}><Icon className="size-4"/></TabsTrigger>)}</TabsList></Tabs>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("切换语言")} title={t("切换语言")}><Globe className="size-4"/></Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onSelect={()=>setLanguage("zh")}>中文<span className="ml-auto">{language==="zh"?"✓":""}</span></DropdownMenuItem><DropdownMenuItem onSelect={()=>setLanguage("en")}>English<span className="ml-auto">{language==="en"?"✓":""}</span></DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        <h1 title="TimeLine">TimeLine</h1>
      </div>
      <p className="toolbar-slogan" aria-hidden="true">Squitle: Schedule quickly in TimeLine (^_^)</p>
      <div className="toolbar-actions flex-wrap">
        <div className="hidden items-center gap-1.5 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted-foreground)] xl:flex" title={t(desktop?"项目、事项和设置保存在此 Mac 的本地文档中。":"项目、事项和设置保存在当前浏览器；更换设备不会自动同步。")}><HardDrive className="size-3.5"/><span>{t(desktop?"数据保存在此 Mac":"数据保存在此浏览器")}</span></div>
        <div className="date-navigation" role="group" aria-label={t("日期导航")}>
          <Button variant="ghost" size="icon" onClick={()=>setAnchor(addDays(anchor,zoom==="day"?-7:-28))} aria-label={t("上一段")}><ChevronLeft/></Button>
          <Button variant="ghost" onClick={()=>focusDate(new Date(),7)}>{t("今天")}</Button>
          <Button variant="ghost" size="icon" onClick={()=>setAnchor(addDays(anchor,zoom==="day"?7:28))} aria-label={t("下一段")}><ChevronRight/></Button>
        </div>
        <Tabs className="zoom-control" value={zoom} onValueChange={v=>{const visibleDate=addDays(anchor,Math.floor(scrollOffset/cellWidth*stepDays));setAnchor(v==="month"?startOfMonth(visibleDate):visibleDate);setZoom(v as "day"|"week"|"month");setScrollOffset(0);lastScroll.current=0;if(viewport.current)viewport.current.scrollLeft=0;}}><TabsList><TabsTrigger value="day">{t("日")}</TabsTrigger><TabsTrigger value="week">{t("周")}</TabsTrigger><TabsTrigger value="month">{t("月")}</TabsTrigger></TabsList></Tabs>

        <Popover><PopoverTrigger asChild><Button variant="ghost" size="icon" aria-label={t("操作帮助")}><CircleHelp/></Button></PopoverTrigger><PopoverContent align="end"><div className="help-list"><strong>{t("操作帮助")}</strong>{["拖动事项边缘：调整日期或拉出连线","拖动空白处：平移时间","单击事项或连线：选中","双击事项：编辑；双击空白：新建","Delete / Backspace：删除选中项","Ctrl / ⌘ + Z：撤销","编辑和设置中 Enter：保存"].map(item=><p key={item}>{t(item)}</p>)}</div></PopoverContent></Popover>
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={t("外观与更多设置")}><Ellipsis/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={()=>{setEditing(null);setNewProjectOpen(false);setSettingsOpen(true);}}><Settings/>{t("外观与设置")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={reset}><RotateCcw/>{t("恢复示例")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
      </div>
    </header>
    <section className={`workspace-shell px-4 py-4 duration-200 motion-reduce:transition-none lg:px-6 ${settingsResizing?"transition-none":"transition-[margin,width]"}`} style={{"--workspace-inset":workspaceInset} as React.CSSProperties}>

      <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]"><div ref={viewport} onDragOver={event=>{const target=inboxTarget(event);if(target){event.preventDefault();event.dataTransfer.dropEffect="link";trackInsertion(event.clientY);setInboxDrop({left:target.left,top:target.top,height:target.height});}else{setInboxDrop(null);clearInsertion();}}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node)){setInboxDrop(null);clearInsertion();}}} onDrop={dropInbox} onScroll={scrollViewport} className="overflow-auto timeline-viewport" style={{overflowAnchor:"none"}}><div className="grid min-w-max" style={{ gridTemplateColumns: `${PROJECT_COLUMN_WIDTH}px ${taskColumnWidth}px ${totalWidth}px` }}>
        <div className="sticky top-0 left-0 z-[95] flex h-24 items-end border-b border-r border-[var(--border)] table-project bg-[var(--table-project)] px-4 pb-3 text-sm font-semibold">{t("项目")}</div>
        <div className="sticky top-0 z-[95] flex h-24 items-end border-b border-r border-[var(--border)] table-task bg-[var(--table-task)] px-4 pb-3 text-sm font-semibold" style={{left:PROJECT_COLUMN_WIDTH}}>{t("任务轨")}{taskColumnDivider(0)}</div>
        <div className="sticky top-0 z-[70] h-24 overflow-clip border-b border-[var(--border)] table-date bg-[var(--table-date)] date-header">
          <div className="flex h-8 border-b border-[var(--border)] table-month bg-[var(--table-month)]">
            {monthGroups.map((group,index)=>{const width=group.count*cellWidth/stepDays;const start=monthGroups.slice(0,index).reduce((sum,item)=>sum+item.count*cellWidth/stepDays,0);const segment=visibleMonthSegment(start,width,scrollOffset,viewportWidth-frozenWidth);return <div key={group.key} className="relative shrink-0 border-r border-[var(--border)]" style={{width}}><span className="month-label" style={segment}>{format(group.date,language==="zh"?"yyyy年M月":"MMMM yyyy",{locale:language==="zh"?zhCN:enUS})}</span></div>;})}
          </div>
          <div className="flex h-16">{dates.map(date=><div key={date.toISOString()} className="relative shrink-0 px-2 py-2" style={{width:cellWidth}}>
            <div className="weekday-label">{zoom==="month" ? "" : zoom==="day" ? format(date,"EEE",{locale:language==="zh"?zhCN:enUS}) : t("周")}</div>
            {zoom!=="month" ? <span className="date-number" data-today={iso(date)===iso(new Date())}>{zoom==="day"?format(date,"d"):format(date,"M/d")}</span> : (date.getDate()===1||date.getDate()===16)&&<span className="date-number absolute left-0">{date.getDate()}</span>}
          </div>)}</div>
        </div>
        <button className="daily-label new-project-cell sticky left-0" style={{gridColumn:1,gridRow:2}} onClick={openNewProject}><Plus size={14}/><span>{t("新建项目")}</span></button>
        <div className="daily-label sticky" style={{gridColumn:2,gridRow:2,left:PROJECT_COLUMN_WIDTH}}>{t("当日待办")}{taskColumnDivider()}</div>
        <div className="daily-header" style={{gridColumn:3,gridRow:2}}><DailyAgenda dates={calendarDays.map(iso)} width={cellWidth/stepDays} tasks={tasks} inbox={inbox} colors={colors} onLocate={locateTaskFromAgenda} onComplete={(id,done)=>changeSchedule(current=>({...current,inbox:current.inbox.map(item=>item.id===id?{...item,done}:item)}))} onReturn={id=>changeSchedule(current=>({...current,inbox:current.inbox.map(item=>item.id===id?{...item,date:undefined}:item)}))} dragging={!!inboxDragging} onDrop={scheduleInbox}/></div>
        <div className="sticky left-0 z-[90] table-project bg-[var(--table-project)]" style={{gridColumn:1,gridRow:3}}>{projectGroups.map(group=>{
          const height=visibleRows.filter(row=>row.project.id===group.project.id).reduce((sum,row)=>sum+rowHeight(row),0);
          return <div key={group.project.id} data-row-key={`project-${group.project.id}`} data-project-card={group.project.id} data-dragging={projectDrag===group.project.id||undefined} data-empty={group.tasks.length===0||undefined} data-collapsed={collapsedProjects.has(group.project.id)||undefined} className="project-card relative border-b border-r border-[var(--border)] table-project bg-[var(--table-project)] px-2 py-3" style={{height,borderBottomColor:"var(--table-projectLine)"}}>
            <div className="flex min-w-0 items-start gap-1 pr-7">
              <button aria-label={t("拖动整行：{0}",t(group.project.name))} onPointerDown={event=>startProjectDrag(event,group.project.id)} onClick={event=>event.stopPropagation()} className="project-handle grid h-8 w-4 shrink-0 cursor-grab touch-none place-items-center text-slate-400"><GripVertical size={15}/></button>
              <button onClick={()=>toggleProject(group.project.id)} className="flex min-w-0 flex-1 items-start gap-1.5 text-left"><ChevronDown size={15} className={`shrink-0 transition-transform ${collapsedProjects.has(group.project.id) ? "rotate-[-90deg]" : ""}`}/><span className="min-w-0"><span className="project-name block">{t(group.project.name)}</span>{!(group.tasks.length===0&&collapsedProjects.has(group.project.id))&&<span className="meta mt-1 block">{group.tasks.length} {t("项")}</span>}</span></button>
            </div>
            <DropdownMenu><DropdownMenuTrigger asChild><button className="project-actions absolute right-1 top-3 grid size-8 place-items-center rounded-lg" aria-label={t("{0}项目操作",t(group.project.name))}><Ellipsis size={17}/></button></DropdownMenuTrigger><DropdownMenuContent align="start" onCloseAutoFocus={event=>finishProjectMenuClose(event,group.project.id)}><DropdownMenuItem onSelect={()=>{pendingRenameProjectRef.current=group.project;}}><Pencil/>{t("重命名项目")}</DropdownMenuItem><DropdownMenuItem className="text-[var(--destructive)]" onSelect={()=>requestProjectDelete(group.project)}><Trash2/>{t("删除项目")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
          </div>;
        })}</div>
        <div className="sticky z-[80] table-task bg-[var(--table-task)]" style={{gridColumn:2,gridRow:3,height:rowsHeight,left:PROJECT_COLUMN_WIDTH}}>
          {visibleRows.map((row,index)=>{
            const key=row.kind==="task"?rowId(row.task):row.kind+row.project.id;
            const projectEnd=visibleRows[index+1]?.project.id!==row.project.id;
            return <div key={row.project.id+key} data-row-key={"label-"+key} data-row-kind={row.kind} className="schedule-row absolute left-0 w-full border-b border-r border-[var(--border)] table-task bg-[var(--table-task)]" style={{opacity:row.kind==="task"&&row.tasks.every(task=>task.status==="已完成")&&completedMode==="fade"?appearance.completedOpacity/100:1,top:rowTops[index],height:rowHeight(row),transition:"height 180ms ease",backgroundColor:row.kind==="add"?"var(--table-add)":row.kind==="task"&&rowDrag&&rowId(row.task)===rowId(tasks.find(task=>task.id===rowDrag.taskId)??row.task)?"var(--accent)":undefined,color:row.kind==="add"?"var(--table-add-text)":undefined,borderBottomColor:projectEnd?"var(--table-projectLine)":undefined}}>
              {row.kind==="insert" ? <div className="insertion-slot flex h-full items-center overflow-hidden px-4 text-xs text-blue-700">{row.phase==="ready" ? t("松开放入新行") : ""}</div> : row.kind==="task" ? (()=>{const track=trackFor(row.task);return <div className="flex h-full items-center gap-2 px-3">
                <button aria-label={t("拖动整行：{0}", t(track.title))} onPointerDown={event=>startRowDrag(event,row.task,row.project.id)} onClick={event=>event.stopPropagation()} className="row-handle grid h-10 w-5 shrink-0 cursor-grab touch-none place-items-center text-slate-400"><GripVertical size={16}/></button>
                <button onDoubleClick={()=>openTrackEditor(row.task)} className="min-w-0 flex-1 text-left" title={t("双击编辑任务轨")}><span className="task-row-name block truncate">{t(track.title)}</span><span className="row-details"><span className="category-dot" title={t(track.type)} style={{"--task-color":colors[track.type]??fallbackColor} as React.CSSProperties}/><span className="meta track-type">{t(track.type)}</span><span className="meta track-count">{row.tasks.length} {" "}{t("项")}</span></span></button>
                <button type="button" className="track-edit grid size-7 shrink-0 place-items-center" aria-label={t("编辑任务轨：{0}",t(track.title))} onClick={()=>openTrackEditor(row.task)}><Pencil size={14}/></button>
              </div>;})() : row.kind==="summary" ? <button className="h-full w-full px-4 text-left text-sm" onClick={()=>toggleProject(row.project.id)}>{t("项目摘要 ·")}{" "}{row.tasks.length} {" "}{t("项")}</button> : row.kind==="empty"&&collapsedProjects.has(row.project.id)?<button className="h-full w-full px-4 text-left text-xs text-[var(--muted-foreground)]" onClick={()=>toggleProject(row.project.id)}>{t("0 项")}</button>:<button className="add-task-link flex h-full w-full items-center gap-2 px-4 text-left text-xs" onClick={()=>addTaskToProject(row.project.id)}><Plus size={14}/>{row.kind==="add" ? t("此项目中的新事项") : t("添加第一个事项")}</button>}
            </div>;
          })}{taskColumnDivider()}
        </div>
        <div aria-hidden="true" className="pointer-events-none sticky left-0 z-10" style={{gridColumn:"1 / -1",gridRow:3,width:viewportWidth,height:0,alignSelf:"start"}}>
          {visibleRows.map((row,index)=>row.kind==="add"?<div key={row.project.id} style={{position:"absolute",left:frozenWidth,right:0,top:rowTops[index],height:layoutTokens.addRowHeight,background:"var(--table-add)",borderBottom:`1px solid ${visibleRows[index+1]?.project.id!==row.project.id?"var(--table-projectLine)":"var(--border)"}`}}/>:null)}
        </div>
        {todayOffset>=0&&todayOffset<=cellCount&&<div aria-hidden="true" className="pointer-events-none relative z-[15]" style={{gridColumn:3,gridRow:3,width:totalWidth,height:rowsHeight}}><div className="today-line" style={{left:todayOffset*cellWidth}}/></div>}
<div ref={timeline} onDoubleClick={createAtPoint} className={`relative select-none ${panning ? "cursor-grabbing" : "cursor-grab"}`} style={{ gridColumn:3,gridRow:3,backgroundColor:"var(--table-canvas)",width: totalWidth, height:rowsHeight, touchAction:"pan-y",isolation:"isolate",overflow:"clip",zIndex:0,clipPath:`inset(0 0 0 ${scrollOffset}px)` }} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} onClickCapture={event=>{if(suppressPanClick.current){event.preventDefault();event.stopPropagation();suppressPanClick.current=false;}}}>
          <div className="calendar-grid" aria-hidden="true">{calendarDays.map(date=><div key={date.toISOString()} className="calendar-column" style={{width:cellWidth/stepDays}} data-week={appearance.weekBoundaries&&date.getDay()===weekStart} data-month={date.getDate()===1} data-weekend={appearance.weekends&&(date.getDay()===0||date.getDay()===6)}/>)}</div>
          {linkPreview&&<svg className="pointer-events-none absolute inset-0 z-50 h-full w-full overflow-visible" aria-hidden="true">
            <path d={previewPath} fill="none" stroke="var(--primary)" strokeWidth={edgeStroke} strokeLinecap="round"/>
            <circle cx={linkPreview.from.x} cy={linkPreview.from.y} r="4" fill="var(--card)" stroke="var(--primary)" strokeWidth="2"/>
            <circle cx={linkPreview.to.x} cy={linkPreview.to.y} r={linkPreview.target ? 7 : 4} fill={linkPreview.target ? "var(--accent)" : "var(--card)"} stroke="var(--primary)" strokeWidth="2"/>
            {linkPreview.target&&<text x={linkPreview.to.x+12} y={linkPreview.to.y-12} fill="var(--muted-foreground)" fontSize="12">{t("松开建立链接")}</text>}
          </svg>}
          {selectedEdge&&<svg className="dependency-layer pointer-events-none absolute inset-0 z-[60] h-full w-full overflow-visible" aria-label={t("调整连线端点")}>
            {connections.filter(connection=>connection.edge.id===selectedEdge).map(connection=><g key={connection.key}>
              {(["source","target"] as const).map(end=>{const point=end==="source"?connection.from:connection.to;return <g key={end}>
                <circle cx={point.x} cy={point.y} r="5" opacity={linkPreview ? 0 : 1} fill="var(--card)" stroke="var(--muted-foreground)" strokeWidth="1.8"/>
                <circle cx={point.x} cy={point.y} r="11" fill="transparent" pointerEvents={linkPreview ? "none" : "all"} role="button" aria-label={end==="source" ? t("拖动修改连线起点") : t("拖动修改连线终点")} className="cursor-grab touch-none"
                  onPointerDown={event=>startEndpoint(event,connection,end)} onClick={event=>{event.preventDefault();event.stopPropagation();}}/>
              </g>;})}
            </g>)}
          </svg>}
          {inboxDrop&&<div className="inbox-drop" style={{left:inboxDrop.left,top:inboxDrop.top,width:cellWidth/stepDays,height:inboxDrop.height}}/>}
          <svg className="dependency-layer pointer-events-none absolute inset-0 z-[25] h-full w-full overflow-visible" aria-label={t("事项依赖关系")}>
            {[...connections].sort((a,b)=>Number(a.edge.id===selectedEdge)-Number(b.edge.id===selectedEdge)).map(connection=>{
              const related=!!focusTask&&depths.has(connection.edge.source.taskId)&&depths.has(connection.edge.target.taskId);
              const isSelected=selectedEdge===connection.edge.id;
              const isHovered=hoveredEdge?.id===connection.edge.id;
              const focused=tasks.find(task=>task.id===(focusTask??connection.edge.source.taskId));
              const stroke=related||isSelected||isHovered?(colors[focused?.type??fallbackType]??fallbackColor):"var(--dependency-color)";
              const arrow=arrowSize;
              const direction=connection.edge.target.side==="top"?-1:1;
              const filtered=categoryFilter&&!([connection.edge.source.taskId,connection.edge.target.taskId].some(id=>tasks.find(task=>task.id===id)?.type===categoryFilter));
              const completed=dependencyIsCompleted(connection.edge,tasks);
              return <g key={connection.key} style={{visibility:linkPreview?.edgeId===connection.edge.id?"hidden":undefined}} opacity={filtered?.2:completed&&!isSelected&&!isHovered?appearance.completedOpacity/100:1}>
                <path d={connection.path} fill="none" stroke="var(--table-canvas)" strokeWidth={edgeStroke+2} strokeLinecap="round" strokeLinejoin="round"/>
                <path className="dependency-stroke" d={connection.path} fill="none" stroke={stroke} strokeWidth={edgeStroke} strokeLinecap="round" strokeLinejoin="round"/>
                <path d={`M ${connection.to.x-arrow/2} ${connection.to.y+direction*arrow} L ${connection.to.x} ${connection.to.y} L ${connection.to.x+arrow/2} ${connection.to.y+direction*arrow} Z`} fill={stroke}/>
                <path d={connection.path} fill="none" stroke="transparent" strokeWidth={layoutTokens.edgeHit} pointerEvents="stroke" className="cursor-pointer" role="button" tabIndex={0} aria-label={t("双击编辑连接线")} aria-pressed={isSelected}
                  onPointerEnter={event=>setHoveredEdge({id:connection.edge.id,x:event.clientX,y:event.clientY,above:event.clientY>window.innerHeight-180})}
                  onPointerLeave={()=>setHoveredEdge(current=>current?.id===connection.edge.id?null:current)}
                  onClick={event=>{event.stopPropagation();setSelectedEdge(connection.edge.id);setSelectedTask(null);setHoveredTask(null);setHoveredEdge(null);}}
                  onDoubleClick={event=>{event.preventDefault();event.stopPropagation();setHoveredEdge(null);openEdgeEditor(connection.edge);}}
                  onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();isSelected?openEdgeEditor(connection.edge):(setSelectedEdge(connection.edge.id),setSelectedTask(null),setHoveredTask(null));}else if(event.key===" "){event.preventDefault();setSelectedEdge(connection.edge.id);setSelectedTask(null);setHoveredTask(null);}}}/>
              </g>;
            })}
          </svg>
          {typeof document!=="undefined"&&hoveredEdge&&hoveredDependency&&hoveredSource&&hoveredTarget&&createPortal(<div role="tooltip" className="dependency-output-preview" style={{left:Math.max(8,Math.min(hoveredEdge.x+12,window.innerWidth-292)),top:hoveredEdge.above?hoveredEdge.y-12:hoveredEdge.y+12,transform:hoveredEdge.above?"translateY(-100%)":undefined}}><strong>{t("输出")}</strong><span className="meta">{t(hoveredSource.title)} → {t(hoveredTarget.title)}</span>{hoveredOutputs.length?<ol>{hoveredOutputs.map(output=><li key={output.id}><span>{output.number}.</span><span>{output.text}</span></li>)}</ol>:<p>{t("尚未选择要传递的输出")}</p>}</div>,document.body)}
          {visibleRows.map((row,index)=>{
            const key=row.kind==="task"?rowId(row.task):row.kind+row.project.id;
            const projectEnd=visibleRows[index+1]?.project.id!==row.project.id;
            return <div key={row.project.id+key} data-row-key={"timeline-"+key} onDoubleClick={event=>{if(row.kind==="add")event.stopPropagation();}} className="schedule-row task-interaction-row absolute left-0 w-full border-b border-[var(--border)]" style={{top:rowTops[index],height:rowHeight(row),transition:"height 180ms ease",backgroundColor:row.kind==="add"?"var(--table-add)":row.kind==="task"&&rowDrag&&rowId(row.task)===rowId(tasks.find(task=>task.id===rowDrag.taskId)??row.task)?"var(--accent)":undefined,borderBottomColor:projectEnd?"var(--table-projectLine)":undefined}}>
              {row.kind==="insert" ? <div className="insertion-slot h-full" aria-label={row.phase==="ready" ? t("松开放入新行") : t("正在展开新行")}/> : row.kind==="task" ? row.tasks.map(task=><div key={task.id} className="task-instance contents">{renderTask(task)}</div>) : row.kind==="summary" ? (()=>{const task=summaryTask(row),g=taskGeometry(task);return <button onClick={()=>toggleProject(row.project.id)} className="task-body absolute px-2" style={{left:g.left,width:g.width,top:barTop,height:appearance.barHeight,"--task-color":fallbackColor} as React.CSSProperties}>{t(row.project.name)} · {row.tasks.length} {" "}{t("项")}</button>;})() : null}
            </div>;
          })}

        </div>
      </div></div></div>
      <div className="legend-filters" role="group" aria-label={t("按工作类型筛选")}>{Object.entries(colors).map(([name,color])=><button key={name} aria-pressed={categoryFilter===name} onClick={()=>setCategoryFilter(current=>current===name?null:name)} style={{"--task-color":color} as React.CSSProperties}><span className="category-dot"/>{t(name)}</button>)}{categoryFilter&&<button onClick={()=>setCategoryFilter(null)}>{t("显示全部")}</button>}</div>
    </section>
    <Dialog modal={!panelMode} open={!!editing} onOpenChange={open => { if (!open&&editing) saveTask(); }}><DialogContent onCompositionStartCapture={()=>{taskEditorComposing.current=true;}} onCompositionEndCapture={()=>{window.setTimeout(()=>{taskEditorComposing.current=false;},0);}} onKeyDownCapture={event=>{if(taskEditorComposing.current||event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;saveOnEnter(event,saveTask);}} {...editorPresentation} data-panel={panelMode ? "true" : undefined} data-language={language} className="task-editor border-[var(--border)] bg-[var(--card)] max-h-[90vh] overflow-y-auto sm:max-w-[720px]"><DialogHeader><DialogTitle>{tasks.some(task=>task.id===editing?.id) ? t("编辑事项") : t("新建科研事项")}</DialogTitle><DialogDescription>{t("同一行可放多个事项；拖动六点手柄可移动整行。")}</DialogDescription></DialogHeader>{editing && <div className="grid gap-4 py-2">
      <div className="grid gap-2"><Label htmlFor="title">{t("事项名称")}</Label><Input id="title" autoFocus value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder={t("例如：整理本周资料")} /></div>
      <Collapsible key={editing.id||"new"} defaultOpen={!!editing.memo} className="group rounded-lg border border-[var(--border)] bg-[var(--accent)]/25">
        <div className="flex items-center px-3"><CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"><span className="text-sm font-medium">{t("备忘")}</span><span className="flex-1"/><ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180"/></CollapsibleTrigger><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="memo-info size-7" aria-label={t("备忘填写说明")}><CircleHelp className="size-4"/></button></TooltipTrigger><TooltipContent className="memo-help"><strong>{t("需要做什么/怎么样算结束/交付是什么？")}</strong><span>{t("可粘贴网页链接或本地文件路径；本地跳转受浏览器权限限制，无法打开时可复制路径。")}</span></TooltipContent></Tooltip></TooltipProvider></div>
        <CollapsibleContent className="overflow-hidden px-3 pb-3 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <Textarea value={editing.memo??""} onChange={event=>setEditing({...editing,memo:event.target.value})} placeholder={t("输入备忘…")} className="min-h-28 resize-y"/>
          {extractMemoLinks(editing.memo??"").length>0&&<div className="mt-2 grid gap-1">{extractMemoLinks(editing.memo??"").map(link=><div key={link.href} className="flex min-w-0 items-center gap-1.5 text-xs"><a href={link.href} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[var(--primary)] underline-offset-2 hover:underline"><ExternalLink className="mr-1 inline size-3"/>{link.label}</a>{link.local&&<Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" title={t("复制路径")} onClick={async()=>{await navigator.clipboard.writeText(link.label);setNotice("已复制路径。");}}><Copy className="size-3"/></Button>}</div>)}</div>}
        </CollapsibleContent>
      </Collapsible>
      <Collapsible key={`${editing.id||"new"}-outputs`} defaultOpen={(editing.outputs?.length??0)>0} className="group rounded-lg border border-[var(--border)] bg-[var(--accent)]/25">
        <div className="flex items-center px-3"><CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"><span className="text-sm font-medium">{t("输出是什么")}</span><span className="flex-1"/><ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180"/></CollapsibleTrigger><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="memo-info size-7" aria-label={t("输出填写说明")}><CircleHelp className="size-4"/></button></TooltipTrigger><TooltipContent className="memo-help"><strong>{t("列出完成此事项后可交付或复用的结果。")}</strong><span>{t("连接线可按编号引用这些输出；修改此处后，引用内容会同步更新。")}</span></TooltipContent></Tooltip></TooltipProvider></div>
        <CollapsibleContent className="overflow-hidden px-3 pb-3 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <ol className="grid gap-2">
            {(editing.outputs??[]).map((output,index)=><li key={output.id} className="grid grid-cols-[24px_minmax(0,1fr)_32px] items-center gap-2"><span className="text-right text-xs tabular-nums text-[var(--muted-foreground)]">{index+1}.</span><Input data-enter-action="local" value={output.text} onChange={event=>setEditing({...editing,outputs:(editing.outputs??[]).map(item=>item.id===output.id?{...item,text:event.target.value}:item)})} placeholder={t("例如：可复用的数据集、图表或结论")}/><Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t("删除输出 {0}",index+1)} onClick={()=>{const outputs=(editing.outputs??[]).filter(item=>item.id!==output.id);setEditing({...editing,outputs});setEditingEdges(current=>pruneDependencyOutputs(current,editing.id,outputs));}}><X className="size-4"/></Button></li>)}
          </ol>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Input data-enter-action="local" value={newTaskOutput} onChange={event=>setNewTaskOutput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();addTaskOutput();}}} placeholder={t("添加一项输出…")}/><Button type="button" variant="outline" onClick={addTaskOutput} disabled={!newTaskOutput.trim()}><Plus className="size-4"/>{t("添加")}</Button></div>
        </CollapsibleContent>
      </Collapsible>
      <div className="grid gap-2"><Label>{t("所属项目")}</Label><Select value={editing.projectIds[0]??"__unclassified__"} onValueChange={value=>setEditing({...editing,projectIds:value==="__unclassified__"?[]:[value],rowId:editing.id})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__unclassified__">{t("未分类")}</SelectItem>{projects.map(project=><SelectItem key={project.id} value={project.id}>{t(project.name)}</SelectItem>)}</SelectContent></Select></div>
      {creationMonth&&<div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3"><div className="grid gap-2"><Label htmlFor="creation-month">{t("起始月份")}</Label><Input id="creation-month" type="month" value={creationMonth} onChange={e=>{if(!e.target.value)return;const value=e.target.value;setCreationMonth(value);const end=endingMonth&&endingMonth>value?endingMonth:"";setEndingMonth(end);setEditing({...editing,...monthRange(value,end)});}}/></div><div className="grid gap-2"><Label htmlFor="ending-month">{t("结束月份（可选）")}</Label><Input id="ending-month" type="month" min={format(addMonths(new Date(creationMonth+"-01T00:00:00"),1),"yyyy-MM")} value={endingMonth} onChange={e=>{const value=e.target.value;if(value&&value<=creationMonth)return;setEndingMonth(value);setEditing({...editing,...monthRange(creationMonth,value)});}}/></div><p className="col-span-2 text-xs text-slate-500">{t("起点取今天与指定月 16 日中较早的一天；终点为结束月份 15 日，留空默认次月。")}</p></div>}
      <div className="grid grid-cols-2 gap-3"><div className="col-span-2 grid gap-2"><Label>{t("工作类型")}</Label><RadioGroup className="task-choice-grid grid gap-2" value={editing.type} onValueChange={value=>setEditing({...editing,type:value as TaskType})}>{Object.entries(colors).map(([type,color])=><label key={type} className="choice-tile flex min-w-0 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm transition-colors" data-active={editing.type===type} style={{"--choice-color":color} as React.CSSProperties}><RadioGroupItem className="sr-only" value={type}/><span className="break-words">{t(type)}</span></label>)}</RadioGroup><button type="button" className="choice-tile rounded-lg border px-3 py-2 text-sm" style={{"--choice-color":fallbackColor} as React.CSSProperties} onClick={()=>setCustomTypeOpen(value=>!value)}>{t("＋ 自定义")}</button>{customTypeOpen&&<div className="custom-type-editor"><Input data-enter-action="local" autoFocus maxLength={24} value={customTypeName} onChange={event=>setCustomTypeName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();addWorkType(true);}}} placeholder={t("工作类型名称")}/><input type="color" value={customTypeColor} aria-label={t("自定义工作类型颜色")} onChange={event=>setCustomTypeColor(event.target.value)}/><Button type="button" variant="outline" onClick={()=>addWorkType(true)}>{t("添加")}</Button></div>}</div><div className="col-span-2 grid gap-2"><Label>{t("状态")}</Label><RadioGroup className="status-choice-grid grid gap-2" value={editing.status} onValueChange={value=>setEditing({...editing,status:value as Task["status"]})}>{(["未开始","进行中","已完成"] as const).map((status,index)=><label key={status} className="choice-tile flex min-w-0 cursor-pointer items-center justify-center gap-1 rounded-lg border px-2 py-3 text-center text-sm transition-colors" data-active={editing.status===status} style={{"--choice-color":["var(--muted-foreground)","var(--status-progress)","var(--muted-foreground)"][index]} as React.CSSProperties}><RadioGroupItem className="sr-only" value={status}/><span>{["⭕️","➡️","✅"][index]} {t(status)}</span></label>)}</RadioGroup></div></div>
      <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>{t("开始时间")}</Label><ManualDateField label={t("开始时间")} value={editing.start} min="1000-01-01" max="9999-12-31" onInvalid={invalid=>setDateErrors(current=>({...current,start:invalid}))} onValid={value=>setEditing({...editing,start:value})}/></div><div className="grid gap-2"><Label>{t("结束时间")}</Label><ManualDateField label={t("结束时间")} value={editing.end} min={editing.start} max="9999-12-31" onInvalid={invalid=>setDateErrors(current=>({...current,end:invalid}))} onValid={value=>setEditing({...editing,end:value})}/></div></div>
      <div className={panelMode ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>{relationEditor("source")}{relationEditor("target")}</div>
      {editError&&<p role="alert" className="text-sm text-red-700">{t(editError)}</p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!editing.milestone} onChange={e => setEditing({ ...editing, milestone: e.target.checked, end: editing.start })} className="size-4 accent-[var(--primary)]" />{t("设为里程碑")}</label>
    </div>}<DialogFooter>{tasks.some(task=>task.id===editing?.id) && <Button variant="ghost" className="mr-auto text-[var(--destructive)] hover:bg-[var(--accent)] hover:text-[var(--destructive)]" onClick={() => { if(!editing)return; deleteTask(editing.id); setEditing(null); setEditingEdges([]); }}>{t("删除事项")}</Button>}<Button variant="outline" onClick={() => { setEditing(null); setEditingEdges([]); setNewTaskOutput(""); }}>{t("取消")}</Button><Button onClick={saveTask} className="bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--accent)]">{t("保存")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!editingEdge} onOpenChange={open=>{if(!open&&editingEdge)saveEdge();}}><DialogContent onKeyDownCapture={event=>saveOnEnter(event,saveEdge)} className="border-[var(--border)] bg-[var(--card)] sm:max-w-[560px]"><DialogHeader><DialogTitle>{t("编辑连接线")}</DialogTitle><DialogDescription>{editingEdge?t("{0} → {1}",t(tasks.find(task=>task.id===editingEdge.source.taskId)?.title??""),t(tasks.find(task=>task.id===editingEdge.target.taskId)?.title??"")):""}</DialogDescription></DialogHeader>{editingEdge&&<div className="grid gap-4 py-2">
      <div className="grid gap-2"><div className="flex items-center gap-1.5"><Label>{t("连接线备忘")}</Label><TooltipProvider><Tooltip><TooltipTrigger asChild><button type="button" className="memo-info size-7" aria-label={t("连接线输出说明")}><CircleHelp className="size-4"/></button></TooltipTrigger><TooltipContent className="memo-help"><strong>{t("选择前置事项要交付给后置事项的输出。")}</strong><span>{t("这里引用的是前置事项中的原始内容，不会生成重复副本。")}</span></TooltipContent></Tooltip></TooltipProvider></div><p className="text-xs text-[var(--muted-foreground)]">{t("从前置事项的编号输出中选择。")}</p>
        {edgeSourceOutputs.length?<ol className="grid gap-2">{edgeSourceOutputs.map((output,index)=><li key={output.id}><label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5 text-sm hover:bg-[var(--accent)]"><Checkbox checked={(editingEdge.outputIds??[]).includes(output.id)} onCheckedChange={checked=>setEditingEdge(current=>current?{...current,outputIds:checked?[...new Set([...(current.outputIds??[]),output.id])]:(current.outputIds??[]).filter(id=>id!==output.id)}:current)}/><span className="min-w-0"><span className="mr-2 tabular-nums text-[var(--muted-foreground)]">{index+1}.</span><span className="break-words">{output.text}</span></span></label></li>)}</ol>:<p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--muted-foreground)]">{t("前置事项还没有输出，可在下方直接新增。")}</p>}
      </div>
      <div className="grid gap-2"><Label>{t("新增备忘并传递")}</Label><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Input data-enter-action="local" value={newEdgeOutput} onChange={event=>setNewEdgeOutput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();addEdgeOutput();}}} placeholder={t("输入新的输出内容…")}/><Button type="button" variant="outline" onClick={addEdgeOutput} disabled={!newEdgeOutput.trim()}><Plus className="size-4"/>{t("添加")}</Button></div><p className="text-xs text-[var(--muted-foreground)]">{t("保存后，这一项也会加入前置事项的编号输出。")}</p></div>
    </div>}<DialogFooter><Button variant="outline" onClick={()=>{setEditingEdge(null);setEdgeSourceOutputs([]);setNewEdgeOutput("");}}>{t("取消")}</Button><Button onClick={saveEdge} className="bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--accent)]">{t("保存")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!editingTrack} onOpenChange={open=>{if(!open&&editingTrack)saveTrack();}}><DialogContent onKeyDownCapture={event=>saveOnEnter(event,saveTrack)} className="border-[var(--border)] bg-[var(--card)] sm:max-w-[480px]"><DialogHeader><DialogTitle>{t("编辑任务轨")}</DialogTitle><DialogDescription>{t("任务轨用于组织同一行中的一个或多个事项。")}</DialogDescription></DialogHeader>{editingTrack&&<div className="grid gap-4 py-2"><div className="grid gap-2"><Label htmlFor="track-title">{t("任务轨名称")}</Label><Input id="track-title" autoFocus value={editingTrack.title} onChange={event=>setEditingTrack({...editingTrack,title:event.target.value})}/></div><div className="grid gap-2"><Label>{t("工作分类")}</Label><RadioGroup className="task-choice-grid grid gap-2" value={editingTrack.type} onValueChange={value=>setEditingTrack({...editingTrack,type:value})}>{Object.entries(colors).map(([type,color])=><label key={type} className="choice-tile flex min-w-0 cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-center text-sm" data-active={editingTrack.type===type} style={{"--choice-color":color} as React.CSSProperties}><RadioGroupItem className="sr-only" value={type}/><span>{t(type)}</span></label>)}</RadioGroup></div></div>}<DialogFooter><Button variant="outline" onClick={()=>setEditingTrack(null)}>{t("取消")}</Button><Button onClick={saveTrack}>{t("保存")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog modal={!panelMode} open={newProjectOpen} onOpenChange={open => { setNewProjectOpen(open); if (!open) {setNewProjectName("");setEditingProjectId(null);} }}><DialogContent {...editorPresentation} data-panel={panelMode ? "true" : undefined} className="border-[var(--border)] bg-[var(--card)] sm:max-w-[420px]"><DialogHeader><DialogTitle>{t(editingProjectId?"重命名项目":"添加项目")}</DialogTitle><DialogDescription>{t(editingProjectId?"修改项目名称，不会影响其中的事项。":"新项目会立即出现在左侧项目栏中。")}</DialogDescription></DialogHeader><div className="grid gap-2 py-2"><Label htmlFor="project-name">{t("项目名称")}</Label><Input id="project-name" autoFocus value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onCompositionStart={()=>{projectNameComposing.current=true;}} onCompositionEnd={()=>{window.setTimeout(()=>{projectNameComposing.current=false;},0);}} onKeyDown={e=>{if(projectNameComposing.current||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;saveOnEnter(e,saveProject);}} placeholder={t("例如：研究项目 A")} /></div><DialogFooter><Button variant="outline" onClick={() => setNewProjectOpen(false)}>{t("取消")}</Button><Button onClick={saveProject} disabled={!newProjectName.trim() || projects.some(project => project.id!==editingProjectId&&project.name.toLocaleLowerCase() === newProjectName.trim().toLocaleLowerCase())} className="bg-[var(--secondary)] text-[var(--foreground)] hover:bg-[var(--accent)]">{t(editingProjectId?"保存":"添加项目")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog modal={!panelMode} open={settingsOpen} onOpenChange={open=>{if(!open)captureSettingsWidth();setSettingsOpen(open);}}><DialogContent ref={settingsPanelRef} onKeyDown={event=>saveOnEnter(event,finishSettings)} {...settingsPresentation} data-panel={panelMode ? "true" : undefined} className={`max-h-[90vh] bg-[var(--card)] sm:max-w-[900px] ${panelMode?"settings-resizable":""}`}><DialogHeader><DialogTitle>{t("设置")}</DialogTitle><DialogDescription>{t("按类别调整 TimeLine、事项和 TodoList。")}</DialogDescription></DialogHeader>
      <div ref={settingsLayoutRef} className="settings-layout" style={{"--settings-nav-width":`${settingsNavWidth}px`} as React.CSSProperties}>
        <nav className="settings-nav" aria-label={t("设置分类")}>{([['general',t('通用')],['timeline',timelineTitle],['tasks',t('事项')],['links',t('连线与操作')],['inbox',inboxTitle],['appearance',t('外观与颜色')]] as const).map(([value,label])=><button key={value} aria-current={settingsCategory===value?"page":undefined} onClick={()=>setSettingsCategory(value)}>{label}</button>)}</nav>
        <button type="button" className="settings-nav-divider" role="separator" aria-orientation="vertical" aria-label={t("拖动调整设置导航宽度")} aria-valuemin={SETTINGS_NAV_MIN} aria-valuemax={SETTINGS_NAV_MAX} aria-valuenow={settingsNavWidth} title={t("拖动调整设置导航宽度")} onPointerDown={startSettingsNavResize} onPointerMove={moveSettingsNavResize} onPointerUp={endSettingsNavResize} onPointerCancel={endSettingsNavResize} onLostPointerCapture={endSettingsNavResize} onKeyDown={keySettingsNavResize}/>
        <div className="settings-detail">
          {settingsCategory==="general"&&<>
            <h3>{t("通用")}</h3>
            <div className="setting-row"><div><strong>{t("编辑展示方式")}</strong><p>{t("选择编辑事项和新建内容的展示方式。")}</p></div><Tabs value={editorMode} onValueChange={value=>setEditorMode(value as "panel"|"dialog")}><TabsList><TabsTrigger value="panel">{t("左侧展开")}</TabsTrigger><TabsTrigger value="dialog">{t("弹窗")}</TabsTrigger></TabsList></Tabs></div>
            <div className="setting-row"><div><div className="setting-title-line"><strong>{t("表述风格")}</strong><span>{t("测试功能")}</span></div><p>{t("调整主要区域的名称，功能保持一致。")}</p></div><Tabs value={wordingStyle} onValueChange={value=>setWordingStyle(value as "default"|"humorous")}><TabsList><TabsTrigger value="default">{t("默认")}</TabsTrigger><TabsTrigger value="humorous">{t("幽默")}</TabsTrigger></TabsList></Tabs></div>
            {wordingStyle==="humorous"&&<p className="meta">TimeLine：{t("怎么上个大学那么多事儿")} · TodoList：{t("嗯哼⚡️啊哈哈还有这么多活🔥要干💦")}</p>}
            <div className="setting-row"><div><strong>{t("数据存储")}</strong><p>{t(desktop?"项目、事项和设置自动保存到此 Mac 的 Squitle 本地文档；仍建议定期导出 JSON 备份。":"项目、事项和设置保存在当前浏览器。请定期导出 JSON 备份；清除浏览器数据或更换设备不会自动同步。")}</p></div><div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={chooseJsonImport}><Upload className="size-4"/>{t("导入 JSON")}</Button><Button variant="outline" onClick={exportJson}><Download className="size-4"/>{t("导出 JSON")}</Button></div></div>
          </>}
          {settingsCategory==="timeline"&&<>
            <h3>{timelineTitle}</h3>
            <div className="setting-row"><div><strong>{t("每周起始日")}</strong></div><Tabs value={String(weekStart)} onValueChange={value=>setWeekStart(Number(value) as 0|1)}><TabsList><TabsTrigger value="1">{t("周一")}</TabsTrigger><TabsTrigger value="0">{t("周日")}</TabsTrigger></TabsList></Tabs></div>
            <div className="setting-row"><div><strong>{t("日期显示密度")}</strong><p>{t("调整每天在时间轴上的宽度。")}</p></div><PresetTabs value={dayWidth} onChange={value=>setDayWidth(Number(value))} options={[[t("紧凑"),36],[t("标准"),54],[t("宽松"),68],[t("宽敞"),80]]}/></div>
            <div className="setting-row"><div><strong>{t("事项行高")}</strong></div><PresetTabs value={timelineRowHeight} onChange={value=>setTimelineRowHeight(Number(value))} options={[[t("紧凑"),48],[t("标准"),64],[t("宽松"),76],[t("宽敞"),88]]}/></div>
            <div className="setting-row"><div><strong>{t("插入新行等待时间")}</strong><p>{t("事项停在两行之间后，提示和完整行依次展开。")}</p></div><PresetTabs value={insertionDelay} onChange={value=>setInsertionDelay(Number(value))} options={[[t("快"),150],[t("中"),300],[t("慢"),600]]}/></div>
            <div className="setting-row"><div><strong>{t("时间结构")}</strong></div><div className="grid gap-2"><label className="flex items-center gap-2"><Checkbox checked={appearance.weekends} onCheckedChange={value=>setAppearance(current=>({...current,weekends:value===true}))}/>{t("周末列底色")}</label><label className="flex items-center gap-2"><Checkbox checked={appearance.weekBoundaries} onCheckedChange={value=>setAppearance(current=>({...current,weekBoundaries:value===true}))}/>{t("加重每周起始日分隔线")}</label></div></div>
          </>}
          {settingsCategory==="tasks"&&<>
            <h3>{t("事项")}</h3>
            <div className="setting-row"><div><strong>{t("新事项默认工作类型")}</strong></div><Select value={defaultTaskType} onValueChange={value=>setDefaultTaskType(value as TaskType)}><SelectTrigger className="w-40"><SelectValue/></SelectTrigger><SelectContent>{workTypes.map(type=><SelectItem key={type} value={type}>{t(type)}</SelectItem>)}</SelectContent></Select></div>
            <fieldset className="settings-section"><legend>{t("工作类型")}</legend><div className="work-type-list">{Object.entries(colors).map(([type,color])=><div key={type} className="work-type-item"><input className="work-type-name" maxLength={24} value={workTypeDrafts[type]??displayWorkType(type)} aria-label={t("编辑工作类型名称：{0}",t(type))} onChange={event=>setWorkTypeDrafts(current=>({...current,[type]:event.target.value}))} onBlur={()=>{const draft=workTypeDrafts[type];if(draft!==undefined)commitWorkTypeRename(type,draft);}} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.currentTarget.blur();}else if(event.key==="Escape"){event.preventDefault();setWorkTypeDrafts(current=>{const next={...current};delete next[type];return next;});event.currentTarget.blur();}}}/><label className="work-type-color"><span className="sr-only">{t("{0}分类色",t(type))}</span><input type="color" value={color} aria-label={t("{0}分类色",t(type))} onChange={event=>setColors(current=>({...current,[type]:event.target.value}))}/><span aria-hidden="true">{color.toUpperCase()}</span></label><button type="button" disabled={workTypes.length<=1} aria-label={t("删除工作类型：{0}",t(type))} onClick={()=>setPendingWorkTypeDelete(type)}><X size={14}/></button></div>)}</div><div className="custom-type-editor"><Input maxLength={24} value={customTypeName} onChange={event=>setCustomTypeName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();addWorkType();}}} placeholder={t("工作类型名称")}/><input type="color" value={customTypeColor} aria-label={t("自定义工作类型颜色")} onChange={event=>setCustomTypeColor(event.target.value)}/><Button type="button" variant="outline" onClick={()=>addWorkType()}>{t("添加")}</Button></div></fieldset>
            <div className="setting-row"><div><strong>{t("新事项默认长度（天）")}</strong></div><Input className="w-28" type="number" min={1} max={365} value={defaultDays} onChange={event=>setDefaultDays(Math.max(1,Math.min(365,Number(event.target.value)||1)))}/></div>
            <div className="setting-row"><div><strong>{t("悬停扩张速度")}</strong></div><Tabs value={hoverSpeed} onValueChange={value=>setHoverSpeed(value as typeof hoverSpeed)}><TabsList><TabsTrigger value="fast">{t("快")}</TabsTrigger><TabsTrigger value="medium">{t("中")}</TabsTrigger><TabsTrigger value="slow">{t("慢")}</TabsTrigger></TabsList></Tabs></div>
            <div className="setting-row"><div><strong>{t("事项悬停操作提示")}</strong><p>{t("悬停事项时显示可执行操作。")}</p></div><Switch checked={taskHoverHints} onCheckedChange={setTaskHoverHints} aria-label={t("事项悬停操作提示")}/></div>
            <div className="setting-row"><div><strong>{t("已完成事项显示")}</strong></div><Tabs value={completedMode} onValueChange={value=>setCompletedMode(value as typeof completedMode)}><TabsList><TabsTrigger value="fade">{t("淡化")}</TabsTrigger><TabsTrigger value="normal">{t("正常显示")}</TabsTrigger><TabsTrigger value="hide">{t("隐藏")}</TabsTrigger></TabsList></Tabs></div>
            {Object.entries(appearanceFields).filter(([key])=>key!=="lineOpacity").map(([key,field])=>{const name=key as keyof typeof appearancePresetValues;return <div key={key} className="setting-row"><div><strong>{t(field.label)}</strong></div><PresetTabs value={appearance[name]} onChange={value=>setAppearance(current=>({...current,[name]:Number(value)}))} options={appearancePresetLabels[name].map(([label,value])=>[t(label),value])}/></div>;})}
          </>}
          {settingsCategory==="links"&&<>
            <h3>{t("连线与操作")}</h3>
            <div className="setting-row"><div><strong>{t("自动选择连接边缘")}</strong><p>{t("按事项相对位置选择更自然的连接边缘。")}</p></div><Checkbox checked={autoConnectionSides} onCheckedChange={value=>setAutoConnectionSides(value===true)}/></div>
            <div className="setting-row"><div><strong>{t("连接点与事项边缘距离（像素）")}</strong><p>{t("控制上下日期连接点与悬停展开后事项边缘的距离。")}</p></div><PresetTabs value={handleGap} onChange={value=>setHandleGap(Number(value))} options={[[t("近"),2],[t("标准"),4],[t("远"),8],[t("最远"),12]]}/></div>
            <div className="setting-row"><div><strong>{t("连接点大小（像素）")}</strong></div><PresetTabs value={handleWidth} onChange={value=>setHandleWidth(Number(value))} options={[[t("小"),4],[t("标准"),6],[t("大"),8],[t("特大"),10]]}/></div>
            <div className="setting-row"><div><strong>{t("默认连线不透明度")}</strong></div><PresetTabs value={appearance.lineOpacity} onChange={value=>setAppearance(current=>({...current,lineOpacity:Number(value)}))} options={appearancePresetLabels.lineOpacity.map(([label,value])=>[t(label),value])}/></div>
            <div className="setting-row"><div><strong>{t("连线粗细")}</strong></div><Tabs value={edgeLevel} onValueChange={value=>setEdgeLevel(value as EdgeLevel)}><TabsList>{([['thin','细'],['regular','标准'],['thick','粗'],['bold','加粗']] as const).map(([value,label])=><TabsTrigger key={value} value={value}>{t(label)}</TabsTrigger>)}</TabsList></Tabs></div>
            <div className="setting-row"><div><strong>{t("箭头大小")}</strong></div><Tabs value={arrowLevel} onValueChange={value=>setArrowLevel(value as ArrowLevel)}><TabsList>{([['small','小'],['regular','标准'],['large','大'],['xlarge','特大']] as const).map(([value,label])=><TabsTrigger key={value} value={value}>{t(label)}</TabsTrigger>)}</TabsList></Tabs></div>
          </>}
          {settingsCategory==="inbox"&&<>
            <h3>{inboxTitle}</h3>
            <div className="setting-row"><div><strong>{t("默认条目格式")}</strong></div><div className="flex gap-2">{inboxKinds.map(kind=><Button key={kind} variant={inboxKind===kind?"default":"outline"} aria-pressed={inboxKind===kind} onClick={()=>setInboxKind(kind)}>{t(kind==="checklist"?"勾选":kind==="numbered"?"编号":"圆点")}</Button>)}</div></div>
            <div className="setting-row"><div><strong>{t("已完成条目")}</strong><p>{t("已完成条目始终移动到底部。")}</p></div><Tabs value={inboxCompleted} onValueChange={value=>setInboxCompleted(value as typeof inboxCompleted)}><TabsList><TabsTrigger value="show">{t("显示保留")}</TabsTrigger><TabsTrigger value="hide">{t("隐藏")}</TabsTrigger></TabsList></Tabs></div>
          </>}
          {settingsCategory==="appearance"&&<>
            <h3>{t("外观与颜色")}</h3>
            <div className="setting-row"><div><strong>{t("主题")}</strong></div><Tabs value={theme} onValueChange={value=>setTheme(value as typeof theme)}><TabsList><TabsTrigger value="light">{t("白天")}</TabsTrigger><TabsTrigger value="dark">{t("晚上")}</TabsTrigger><TabsTrigger value="system">{t("跟随系统")}</TabsTrigger></TabsList></Tabs></div>
            <fieldset className="settings-section"><legend>{resolvedTheme==="light"?t("白天颜色预设"):t("晚上颜色预设")}</legend><div className="preset-grid">{[...builtInColorPresets,...customColorPresets].filter(preset=>preset.mode===resolvedTheme).map(preset=><div key={preset.id} className="color-preset-card"><button onClick={()=>applyColorPreset(preset)}><span>{preset.builtin?t(preset.name):preset.name}</span><span className="preset-swatches" aria-hidden="true"><i style={{background:preset.primary}}/><i style={{background:preset.table.canvas}}/><i style={{background:preset.table.project}}/>{Object.values(preset.categories).map((color,index)=><i key={index} style={{background:color}}/>)}</span></button>{!preset.builtin&&<button className="preset-delete" aria-label={t("删除颜色预设：{0}",preset.name)} onClick={()=>setCustomColorPresets(current=>current.filter(item=>item.id!==preset.id))}><X size={14}/></button>}</div>)}</div>
              <div className="flex items-center gap-2"><Input value={presetName} maxLength={40} onChange={event=>setPresetName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();saveColorPreset();}}} placeholder={t("预设名称（可选）")}/><Button variant="outline" onClick={saveColorPreset}>{t("保存当前配色")}</Button></div><p className="meta">{t("留空时自动命名为“自定义#编号”；同名预设会更新。")}</p>
            </fieldset>
            <fieldset className="settings-section"><legend>{t("新建项目颜色")}</legend><label className="flex items-center justify-between gap-3"><span>{t("文字颜色")}</span><span className="flex items-center gap-2"><span className="meta font-mono">{primaryColor.toUpperCase()}</span><input type="color" value={primaryColor} aria-label={t("新建项目颜色")} onChange={event=>setPrimaryColor(event.target.value)}/></span></label></fieldset>
            <fieldset className="settings-section"><legend>{t("分类颜色")}</legend>{Object.entries(colors).map(([name,color])=><label key={name} className="flex items-center justify-between"><span>{t(name)}</span><input type="color" value={color} aria-label={t("{0}分类色",t(name))} onChange={event=>setColors(current=>({...current,[name]:event.target.value}))}/></label>)}</fieldset>
            <fieldset className="settings-section"><legend>{t("表格颜色")}</legend><p className="meta">{t("当前调整")}{resolvedTheme==="light"?t("白天"):t("晚上")}{t("配色，实时预览并自动保存。两种模式分别记忆。")}</p>{(Object.entries(tableColorLabels) as [keyof TableColors,string][]).map(([key,label])=><label key={key} className="flex items-center justify-between gap-3"><span>{t(label)}</span><span className="flex items-center gap-2"><span className="meta font-mono">{tablePalettes[resolvedTheme][key].toUpperCase()}</span><input type="color" value={tablePalettes[resolvedTheme][key]} aria-label={t("{0}颜色",t(label))} onChange={event=>{const color=event.target.value;setTablePalettes(current=>({...current,[resolvedTheme]:{...current[resolvedTheme],[key]:color}}));}}/></span></label>)}</fieldset>
          </>}
        </div>
      </div>
      <DialogFooter><Button variant="ghost" onClick={saveCategoryDefault}>{t("将当前选项设为默认")}</Button><Button variant="ghost" onClick={()=>resetSettings()}>{t("恢复当前分类")}</Button><Button variant="outline" onClick={resetAllSettings}>{t("恢复全部设置")}</Button><Button variant="secondary" onClick={finishSettings}>{t("完成")}</Button></DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={!!pendingImport} onOpenChange={open=>{if(!open)setPendingImport(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("导入并覆盖当前数据？")}</AlertDialogTitle><AlertDialogDescription>{t("将使用 {0} 中的项目、事项和设置覆盖当前浏览器数据。导入前会在此浏览器保留一份临时恢复副本。",pendingImport?.name??"")}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("取消")}</AlertDialogCancel><AlertDialogAction onClick={confirmJsonImport}>{t("继续导入")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!pendingWorkTypeDelete} onOpenChange={open=>{if(!open)setPendingWorkTypeDelete(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("删除工作类型“{0}”？",t(pendingWorkTypeDelete??""))}</AlertDialogTitle><AlertDialogDescription>{t("使用此类型的事项将统一改为“{0}”，日期、状态和关系保持不变。",t(workTypes.find(type=>type!==pendingWorkTypeDelete)??fallbackType))}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>{t("取消")}</AlertDialogCancel><AlertDialogAction className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90" onClick={confirmWorkTypeDelete}>{t("删除工作类型")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!pendingProjectDelete} onOpenChange={open=>{if(!open)setPendingProjectDelete(null);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t("删除项目“{0}”？",pendingProjectDelete?.project.name??"")}</AlertDialogTitle><AlertDialogDescription>{pendingProjectDelete?.cascade?t("该项目及其中的事项、里程碑和相关连线将被删除。删除后可在 5 秒内撤回。") : t("项目中的事项将移至未分类，日期、状态、备忘和任务关系都会保留。")}</AlertDialogDescription></AlertDialogHeader><label className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3"><Checkbox checked={pendingProjectDelete?.cascade??false} onCheckedChange={value=>setPendingProjectDelete(current=>current?{...current,cascade:value===true}:null)}/><span><strong>{t("同时永久删除项目中的全部事项")}</strong><span className="meta mt-1 block">{t("这会一并删除里程碑和与这些事项相连的依赖关系。")}</span></span></label><AlertDialogFooter><AlertDialogCancel>{t("取消")}</AlertDialogCancel><AlertDialogAction className="bg-[var(--destructive)] text-white hover:bg-[var(--destructive)]/90" onClick={confirmProjectDelete}>{t(pendingProjectDelete?.cascade?"确认全部删除":"删除项目")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {ready&&<InboxPanel items={todoItems} defaultKind={inboxKind} sort={inboxSort} collapsed={inboxCollapsed} title={inboxTitle} size={inboxSize} completedVisibility={inboxCompleted} onSortChange={setInboxSort} onCollapse={setInboxCollapsed} onSizeChange={onInboxSizeChange} onChange={updateTodoItems} onDelete={deleteTodoItem} onUndoDelete={undoTodoDelete} onDrag={id=>{setInboxDragging(id);if(!id){setInboxDrop(null);clearInsertion();}}}/>} 
  </main>;
}
