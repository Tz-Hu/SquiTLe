import type {ScheduleDocument} from "./persistence";
import {ACTIVE_TIMELINE_KEY,TIMELINE_INDEX_KEY,timelineDocumentKey,type KeyValueStorage} from "./storage.ts";

export type TimelineEntry={documentId:string;title:string;updatedAt:string;temporary:boolean;cloudOnly?:boolean;cloudBacked?:boolean};

const validEntry=(value:unknown):value is TimelineEntry=>{
  if(!value||typeof value!=="object")return false;
  const item=value as Partial<TimelineEntry>;
  return typeof item.documentId==="string"&&!!item.documentId&&typeof item.title==="string"&&typeof item.updatedAt==="string"&&typeof item.temporary==="boolean";
};

export function loadTimelineIndex(storage:KeyValueStorage):TimelineEntry[]{
  try{const value=JSON.parse(storage.getItem(TIMELINE_INDEX_KEY)??"[]");return Array.isArray(value)?value.filter(validEntry):[];}catch{return [];}
}

export function saveTimelineIndex(storage:KeyValueStorage,entries:TimelineEntry[]){storage.setItem(TIMELINE_INDEX_KEY,JSON.stringify(entries));}

export function upsertTimeline(storage:KeyValueStorage,entry:TimelineEntry){
  const current=loadTimelineIndex(storage),next=current.some(item=>item.documentId===entry.documentId)?current.map(item=>item.documentId===entry.documentId?{...item,...entry}:item):[...current,entry];
  saveTimelineIndex(storage,next);return next;
}

export function removeTimeline(storage:KeyValueStorage,documentId:string){
  const next=loadTimelineIndex(storage).filter(item=>item.documentId!==documentId);saveTimelineIndex(storage,next);return next;
}

export function activeTimelineId(storage:KeyValueStorage){return storage.getItem(ACTIVE_TIMELINE_KEY);}
export function setActiveTimelineId(storage:KeyValueStorage,documentId:string){storage.setItem(ACTIVE_TIMELINE_KEY,documentId);}
export function readTimelineDocument(storage:KeyValueStorage,documentId:string):ScheduleDocument|null{
  try{const raw=storage.getItem(timelineDocumentKey(documentId));return raw?JSON.parse(raw) as ScheduleDocument:null;}catch{return null;}
}
export function writeTimelineDocument(storage:KeyValueStorage,document:ScheduleDocument){storage.setItem(timelineDocumentKey(document.documentId),JSON.stringify(document));}

export function mergeTimelineEntries(local:TimelineEntry[],cloud:Array<Omit<TimelineEntry,"temporary">>):TimelineEntry[]{
  const merged=new Map(local.map(item=>[item.documentId,item]));
  for(const item of cloud){const existing=merged.get(item.documentId);merged.set(item.documentId,existing?{...existing,title:item.title,updatedAt:item.updatedAt,cloudOnly:false,cloudBacked:true}:{...item,temporary:false,cloudOnly:true,cloudBacked:true});}
  return [...merged.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
}
