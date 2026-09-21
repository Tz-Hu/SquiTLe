import type {Task} from "./schedule";
export const rowId=(task:Task)=>task.rowId??task.id;
export function hasItemOverlap(tasks:Task[],id:string):boolean {
 const task=tasks.find(item=>item.id===id);
 if(!task||task.milestone)return false;
 return tasks.some(other=>other.id!==id&&!other.milestone&&rowId(other)===rowId(task)&&other.projectIds.some(project=>task.projectIds.includes(project))&&task.start<=other.end&&other.start<=task.end);
}
export const canPlaceItem=(tasks:Task[],id:string,allowOverlap:boolean)=>allowOverlap||!hasItemOverlap(tasks,id);
export function moveRow(tasks:Task[],id:string,from:string,to:string,before?:string):Task[]{
 const source=tasks.find(task=>task.id===id);if(!source)return tasks;
 const key=rowId(source);
 const moving=tasks.filter(task=>task.projectIds.includes(from)&&rowId(task)===key);
 if(!moving.length||moving.some(task=>task.id===before))return tasks;
 const movingIds=new Set(moving.map(task=>task.id));
 const rows=[...new Set(tasks.filter(task=>task.projectIds.includes(to)&&!movingIds.has(task.id)).sort((a,b)=>(a.order[to]??0)-(b.order[to]??0)).map(rowId))];
 const beforeTask=tasks.find(task=>task.id===before);const index=beforeTask?rows.indexOf(rowId(beforeTask)):-1;
 rows.splice(index<0?rows.length:index,0,key);
 return tasks.map(task=>movingIds.has(task.id)?{...task,projectIds:[to],rowId:key,order:{[to]:rows.indexOf(key)}}:task.projectIds.includes(to)?{...task,order:{...task.order,[to]:rows.indexOf(rowId(task))}}:task);
}
export function moveItem(tasks:Task[],id:string,project:string,target?:Task):Task[]{
 return tasks.map(task=>task.id===id?{...task,projectIds:[project],rowId:target?rowId(target):task.id,order:{[project]:target?.order[project]??tasks.length}}:task);
}
export function insertItemRow(tasks:Task[],id:string,project:string,before:string|undefined,newRow:string):Task[]{
 const source=tasks.find(task=>task.id===id);if(!source)return tasks;
 if(before===id){
   const ordered=tasks.filter(task=>task.projectIds.includes(project)).sort((a,b)=>(a.order[project]??0)-(b.order[project]??0));
   before=ordered.find(task=>task.id!==id&&rowId(task)===rowId(source))?.id??ordered.slice(ordered.findIndex(task=>task.id===id)+1).find(task=>rowId(task)!==rowId(source))?.id;
 }
 const moved=moveItem(tasks,id,project).map(task=>task.id===id?{...task,rowId:newRow}:task);
 return moveRow(moved,id,project,project,before);
}
