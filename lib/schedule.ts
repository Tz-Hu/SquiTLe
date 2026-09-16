export type TaskType = string;
import type {InboxKind,InboxUrgency} from "./inbox";

export type Task = { id: string; rowId?: string; title: string; memo?: string; projectIds: string[]; order: Record<string, number>; type: TaskType; start: string; end: string; status: "未开始" | "进行中" | "已完成"; milestone?: boolean; urgency?:InboxUrgency; todoKind?:InboxKind };
export type TransferMode = "move" | "copy" | "share";
export type Port = { taskId: string; day: number; side: "top" | "bottom" };
export type Dependency = { id: string; source: Port; target: Port };

export function deleteProjectContent(tasks:Task[],edges:Dependency[],projectId:string,cascade:boolean){
  const affected=tasks.filter(task=>task.projectIds.includes(projectId));
  const unclassifiedCount=affected.filter(task=>task.projectIds.length===1).length;
  if(cascade){
    const removed=new Set(affected.map(task=>task.id));
    return {tasks:tasks.filter(task=>!removed.has(task.id)),edges:edges.filter(edge=>!removed.has(edge.source.taskId)&&!removed.has(edge.target.taskId)),affectedCount:affected.length,unclassifiedCount};
  }
  return {
    tasks:tasks.map(task=>{
      if(!task.projectIds.includes(projectId))return task;
      const {[projectId]:_,...order}=task.order;
      return {...task,projectIds:task.projectIds.filter(id=>id!==projectId),order};
    }),
    edges,
    affectedCount:affected.length,
    unclassifiedCount,
  };
}

// Membership and ordering belong to each project; content and edges belong to task identity.
export function transferTask(tasks: Task[], id: string, from: string, to: string, before: string | undefined, mode: TransferMode, copyId: string): Task[] {
  const original = tasks.find(task => task.id === id);
  if (!original || !original.projectIds.includes(from) || (from === to && before === id)) return tasks;
  let result = tasks;
  let insertedId = id;
  if (from !== to && mode === "copy") {
    insertedId = copyId;
    result = [...tasks, { ...original, id: copyId, projectIds: [to], order: { [to]: 0 } }];
  } else {
    result = tasks.map(task => task.id !== id ? task : { ...task, projectIds: [...new Set([...(mode === "move" && from !== to ? task.projectIds.filter(project => project !== from) : task.projectIds), to])] });
  }
  const ordered = result.filter(task => task.projectIds.includes(to) && task.id !== insertedId).sort((a, b) => (a.order[to] ?? 0) - (b.order[to] ?? 0)).map(task => task.id);
  const index = before ? ordered.indexOf(before) : -1;
  ordered.splice(index < 0 ? ordered.length : index, 0, insertedId);
  return result.map(task => ({ ...task, order: Object.fromEntries(task.projectIds.map(project => [project, project === to ? ordered.indexOf(task.id) : task.order[project] ?? 0])) }));
}

export function relatedDepths(id: string | null, edges: Dependency[]): Map<string, number> {
  const distances = new Map<string, number>();
  if (!id) return distances;
  distances.set(id, 0);
  // Traverse upstream and downstream separately: siblings are not predecessors or successors.
  for (const direction of ["source", "target"] as const) {
    const visited = new Set([id]); const queue: Array<[string, number]> = [[id, 0]];
    for (let i = 0; i < queue.length; i++) {
      const [current, depth] = queue[i];
      for (const edge of edges) {
        const match = direction === "source" ? edge.target.taskId : edge.source.taskId;
        const next = edge[direction].taskId;
        if (match !== current || visited.has(next)) continue;
        visited.add(next); queue.push([next, depth + 1]);
        distances.set(next, Math.min(distances.get(next) ?? Infinity, depth + 1));
      }
    }
  }
  return distances;
}

export function hasCycle(edges: Dependency[]): boolean {
  const next = new Map<string, string[]>();
  for (const edge of edges) next.set(edge.source.taskId, [...(next.get(edge.source.taskId) ?? []), edge.target.taskId]);
  const active = new Set<string>(); const done = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return true;
    if (done.has(id)) return false;
    active.add(id);
    if ((next.get(id) ?? []).some(visit)) return true;
    active.delete(id); done.add(id); return false;
  }
  return [...next.keys()].some(visit);
}
