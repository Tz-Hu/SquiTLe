import type {Dependency,Task} from "./schedule.ts";
import {canPlaceItem,rowId} from "./rows.ts";

export const TASK_CLIPBOARD_STORAGE_KEY="squitle-task-clipboard-v1";

export type TaskClipboardPayload={
  version:1;
  kind:"copy"|"cut";
  sourceDocumentId:string;
  task:Task;
  edges?:Dependency[];
};

const shiftIsoDate=(value:string,days:number)=>{
  const date=new Date(value+"T00:00:00Z");
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
};

const taskDuration=(task:Pick<Task,"start"|"end">)=>Math.max(0,Math.round((Date.parse(task.end+"T00:00:00Z")-Date.parse(task.start+"T00:00:00Z"))/86_400_000));

export const copyTaskSnapshot=(task:Task):Task=>({
  ...task,
  projectIds:[...task.projectIds],
  order:{...task.order},
  outputs:task.outputs?.map(output=>({...output})),
});

export function parseTaskClipboard(raw:string|null):TaskClipboardPayload|null{
  if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Partial<TaskClipboardPayload>;
    const task=value.task as Partial<Task>|undefined;
    if(value.version!==1||(value.kind!=="copy"&&value.kind!=="cut")||typeof value.sourceDocumentId!=="string"||!task||typeof task.id!=="string"||typeof task.title!=="string"||!Array.isArray(task.projectIds)||typeof task.order!=="object"||typeof task.start!=="string"||typeof task.end!=="string")return null;
    return value as TaskClipboardPayload;
  }catch{return null;}
}

type PasteTaskOptions={
  payload:TaskClipboardPayload;
  tasks:Task[];
  selectedTask?:Task;
  anchor?:{start:string;rowId?:string;order?:number};
  projectId:string;
  currentDocumentId:string;
  allowOverlap:boolean;
  createId:()=>string;
};

export function taskFromClipboard({payload,tasks,selectedTask,anchor,projectId,currentDocumentId,allowOverlap,createId}:PasteTaskOptions):Task{
  const source=payload.task;
  const reuseIdentity=payload.kind==="cut"&&!tasks.some(task=>task.id===source.id);
  const id=reuseIdentity?source.id:createId();
  const sameTimelineCut=reuseIdentity&&payload.sourceDocumentId===currentDocumentId;
  const targetRow=anchor?anchor.rowId??id:selectedTask?rowId(selectedTask):sameTimelineCut?rowId(source):id;
  const order=anchor?.order??(!anchor?selectedTask?.order[projectId]:undefined)??(!anchor&&sameTimelineCut?source.order[projectId]:undefined)??tasks.filter(task=>task.projectIds.includes(projectId)).reduce((maximum,task)=>Math.max(maximum,task.order[projectId]??0),-1)+1;
  const start=anchor?.start??(selectedTask?shiftIsoDate(selectedTask.end,1):source.start);
  const days=taskDuration(source);
  let candidate:Task={
    ...copyTaskSnapshot(source),
    id,
    rowId:targetRow,
    projectIds:[projectId],
    order:{[projectId]:order},
    start,
    end:shiftIsoDate(start,days),
    outputs:reuseIdentity?source.outputs?.map(output=>({...output})):source.outputs?.map(output=>({id:createId(),text:output.text})),
  };
  if(allowOverlap||candidate.milestone)return candidate;
  for(let attempts=0;attempts<tasks.length+1&&!canPlaceItem([...tasks,candidate],candidate.id,false);attempts++){
    const latestConflict=tasks.filter(task=>!task.milestone&&rowId(task)===targetRow&&task.projectIds.includes(projectId)&&candidate.start<=task.end&&task.start<=candidate.end).reduce((latest,task)=>task.end>latest?task.end:latest,candidate.start);
    candidate={...candidate,start:shiftIsoDate(latestConflict,1),end:shiftIsoDate(shiftIsoDate(latestConflict,1),days)};
  }
  return candidate;
}
