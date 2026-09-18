import test from "node:test";
import assert from "node:assert/strict";
import type {Task} from "../lib/schedule.ts";
import {reconcileTracks,taskTypeForTrack,tracksFromTasks} from "../lib/tracks.ts";

const task=(id:string,rowId:string,title=id,type="论文"):Task=>({id,rowId,title,type,projectIds:["p"],order:{p:0},start:"2026-09-01",end:"2026-09-02",status:"未开始"});

test("one track is created for every task row",()=>{
  assert.deepEqual(tracksFromTasks([task("a","row","轨道"),task("b","row","另一事项")]),[{id:"row",title:"轨道",type:"论文"}]);
});

test("reconciliation preserves edited metadata and removes orphan tracks",()=>{
  const tasks=[task("a","row","事项")];
  assert.deepEqual(reconcileTracks(tasks,[{id:"row",title:"我的任务轨",type:"工程"},{id:"gone",title:"旧轨",type:"整理"}]),[{id:"row",title:"我的任务轨",type:"工程"}]);
});

test("a task added to a track inherits the track work type",()=>{
  const tasks=[task("a","row","事项","论文")];
  const tracks=[{id:"row",title:"我的任务轨",type:"工程"}];
  assert.equal(taskTypeForTrack(tasks,tracks,"row","整理"),"工程");
});

test("new tasks outside a track keep the global default work type",()=>{
  assert.equal(taskTypeForTrack([],[],undefined,"整理"),"整理");
  assert.equal(taskTypeForTrack([],[],"missing","论文"),"论文");
});
