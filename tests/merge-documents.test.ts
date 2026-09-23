import test from "node:test";
import assert from "node:assert/strict";
import {DOCUMENT_KIND,type ScheduleDocument} from "../lib/persistence/persistence.ts";
import {mergeScheduleDocuments} from "../lib/sync/merge-documents.ts";

const task=(id:string,title:string,start="2026-09-23",end=start)=>({id,title,start,end,projectIds:["project-a"],order:{"project-a":0},type:"工程",status:"未开始" as const,memo:""});
const document=(updatedAt:string,tasks:ReturnType<typeof task>[],extra:Record<string,unknown>={}):ScheduleDocument=>({
  kind:DOCUMENT_KIND,schemaVersion:6,documentId:"document-1",revision:1,updatedAt,updatedBy:"device",
  data:{dataVersion:6,projects:[{id:"project-a",name:"Project A",color:"#123456"}],tasks,edges:[],tracks:tasks.map(item=>({id:item.id,title:item.title,type:item.type})),inbox:[],...extra},
});

test("document merge keeps unique tasks and removes same-id and semantic duplicates",()=>{
  const local=document("2026-09-23T10:00:00.000Z",[
    task("shared","Shared local"),
    task("local-only","Local only","2026-09-24"),
    task("duplicate-local","Same task","2026-09-25"),
  ]);
  const remote=document("2026-09-23T11:00:00.000Z",[
    task("shared","Shared remote"),
    task("remote-only","Remote only","2026-09-26"),
    task("duplicate-remote","Same task","2026-09-25"),
  ]);
  const result=mergeScheduleDocuments(local,remote,"merged-device",()=>new Date("2026-09-23T12:00:00.000Z"));
  const tasks=result.document.data.tasks as ReturnType<typeof task>[];
  assert.deepEqual(tasks.map(item=>item.title),["Shared remote","Remote only","Same task","Local only"]);
  assert.equal(tasks.filter(item=>item.title==="Same task").length,1);
  assert.deepEqual(result.stats,{totalTasks:4,addedTasks:1,deduplicatedTasks:2});
  assert.equal(result.document.documentId,local.documentId);
  assert.equal(result.document.updatedBy,"merged-device");
});

test("document merge remaps dependencies to the retained duplicate task",()=>{
  const localTasks=[task("duplicate-local","Same task"),task("local-target","Local target","2026-09-24")];
  const remoteTasks=[task("duplicate-remote","Same task"),task("remote-source","Remote source","2026-09-22")];
  const local=document("2026-09-23T10:00:00.000Z",localTasks,{edges:[{id:"local-edge",source:{taskId:"duplicate-local",day:0,side:"bottom"},target:{taskId:"local-target",day:0,side:"top"}}]});
  const remote=document("2026-09-23T11:00:00.000Z",remoteTasks,{edges:[{id:"remote-edge",source:{taskId:"remote-source",day:0,side:"bottom"},target:{taskId:"duplicate-remote",day:0,side:"top"}}]});
  const result=mergeScheduleDocuments(local,remote,"merged-device");
  const tasks=result.document.data.tasks as ReturnType<typeof task>[];
  const edges=result.document.data.edges as Array<{source:{taskId:string};target:{taskId:string}}>;
  const retained=tasks.find(item=>item.title==="Same task")!;
  assert.equal(tasks.filter(item=>item.title==="Same task").length,1);
  assert(edges.some(edge=>edge.source.taskId===retained.id&&edge.target.taskId==="local-target"));
  assert(edges.some(edge=>edge.source.taskId==="remote-source"&&edge.target.taskId===retained.id));
});
