import {test} from "node:test";
import assert from "node:assert/strict";
import type {Task} from "../lib/domain/schedule.ts";
import {copyTaskSnapshot,parseTaskClipboard,taskFromClipboard,type TaskClipboardPayload} from "../lib/domain/task-clipboard.ts";

const task=(id:string,start="2026-09-01",end="2026-09-03"):Task=>({id,rowId:"row-1",title:id,memo:"memo",outputs:[{id:"output-1",text:"result"}],projectIds:["p1"],order:{p1:2},type:"实验",start,end,status:"未开始"});
const ids=()=>{let index=0;return()=>`new-${++index}`;};

test("copy snapshot is detached from mutable task fields",()=>{
  const original=task("source");const snapshot=copyTaskSnapshot(original);
  snapshot.projectIds.push("p2");snapshot.order.p1=9;snapshot.outputs![0].text="changed";
  assert.deepEqual(original.projectIds,["p1"]);assert.equal(original.order.p1,2);assert.equal(original.outputs![0].text,"result");
});

test("copy paste creates fresh task and output identities after the selected task",()=>{
  const source=task("source"),selected=task("selected","2026-09-08","2026-09-10");
  const payload:TaskClipboardPayload={version:1,kind:"copy",sourceDocumentId:"one",task:source};
  const pasted=taskFromClipboard({payload,tasks:[source,selected],selectedTask:selected,projectId:"p1",currentDocumentId:"one",allowOverlap:false,createId:ids()});
  assert.equal(pasted.id,"new-1");assert.equal(pasted.outputs![0].id,"new-2");assert.equal(pasted.rowId,"row-1");assert.equal(pasted.start,"2026-09-11");assert.equal(pasted.end,"2026-09-13");
});

test("cut paste restores identity and original dates in the same timeline",()=>{
  const source=task("source");const payload:TaskClipboardPayload={version:1,kind:"cut",sourceDocumentId:"one",task:source};
  const pasted=taskFromClipboard({payload,tasks:[],projectId:"p1",currentDocumentId:"one",allowOverlap:false,createId:ids()});
  assert.equal(pasted.id,"source");assert.equal(pasted.outputs![0].id,"output-1");assert.equal(pasted.rowId,"row-1");assert.equal(pasted.start,source.start);assert.equal(pasted.end,source.end);
});

test("paste advances to the next open range when overlap is disabled",()=>{
  const source=task("source"),blocker=task("blocker","2026-09-01","2026-09-06");
  const payload:TaskClipboardPayload={version:1,kind:"cut",sourceDocumentId:"one",task:source};
  const pasted=taskFromClipboard({payload,tasks:[blocker],projectId:"p1",currentDocumentId:"one",allowOverlap:false,createId:ids()});
  assert.equal(pasted.start,"2026-09-07");assert.equal(pasted.end,"2026-09-09");
});

test("a blank timeline anchor overrides the selected task and starts at the clicked date",()=>{
  const source=task("source"),selected={...task("selected","2026-09-08","2026-09-10"),rowId:"old-row"};
  const payload:TaskClipboardPayload={version:1,kind:"copy",sourceDocumentId:"one",task:source};
  const pasted=taskFromClipboard({payload,tasks:[source,selected],selectedTask:selected,anchor:{start:"2026-09-20",rowId:"clicked-row",order:5},projectId:"p1",currentDocumentId:"one",allowOverlap:false,createId:ids()});
  assert.equal(pasted.start,"2026-09-20");assert.equal(pasted.end,"2026-09-22");assert.equal(pasted.rowId,"clicked-row");assert.equal(pasted.order.p1,5);
});

test("clipboard parser rejects unrelated or malformed data",()=>{
  assert.equal(parseTaskClipboard(null),null);assert.equal(parseTaskClipboard("{}"),null);assert.equal(parseTaskClipboard("not json"),null);
  const payload:TaskClipboardPayload={version:1,kind:"copy",sourceDocumentId:"one",task:task("source")};
  assert.deepEqual(parseTaskClipboard(JSON.stringify(payload)),payload);
});

test("cut clipboard can retain detached dependency snapshots",()=>{
  const payload:TaskClipboardPayload={version:1,kind:"cut",sourceDocumentId:"one",task:task("source"),edges:[{id:"edge",source:{taskId:"source",day:2,side:"bottom"},target:{taskId:"target",day:0,side:"top"},outputIds:["output-1"]}]};
  assert.deepEqual(parseTaskClipboard(JSON.stringify(payload)),payload);
});
