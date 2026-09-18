import type {Task,TaskType} from "./schedule.ts";
import {rowId} from "./rows.ts";

export type TaskTrack={id:string;title:string;type:TaskType};

export function tracksFromTasks(tasks:Task[]):TaskTrack[]{
  const tracks=new Map<string,TaskTrack>();
  for(const task of tasks){
    const id=rowId(task);
    if(!tracks.has(id))tracks.set(id,{id,title:task.title||"未命名任务轨",type:task.type||"整理"});
  }
  return [...tracks.values()];
}

export function reconcileTracks(tasks:Task[],tracks:TaskTrack[]=[]):TaskTrack[]{
  const required=new Set(tasks.map(rowId));
  const retained=tracks.filter((track,index)=>required.has(track.id)&&tracks.findIndex(item=>item.id===track.id)===index).map(track=>({...track,title:track.title.trim()||"未命名任务轨"}));
  const known=new Set(retained.map(track=>track.id));
  return [...retained,...tracksFromTasks(tasks).filter(track=>!known.has(track.id))];
}

export function taskTypeForTrack(tasks:Task[],tracks:TaskTrack[],trackId:string|undefined,fallback:TaskType):TaskType{
  if(!trackId)return fallback;
  return tracks.find(track=>track.id===trackId)?.type??tasks.find(task=>rowId(task)===trackId)?.type??fallback;
}
