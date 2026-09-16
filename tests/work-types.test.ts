import test from "node:test";
import assert from "node:assert/strict";
import type {Task} from "../lib/schedule.ts";
import {deleteWorkType} from "../lib/work-types.ts";

const task=(id:string,type:string):Task=>({id,title:id,type,projectIds:["p"],order:{p:0},start:"2026-09-01",end:"2026-09-02",status:"未开始"});

test("deleting a work type reassigns its tasks and removes its color",()=>{
  const result=deleteWorkType([task("a","论文"),task("b","整理")],{论文:"#111111",整理:"#222222"},"论文");
  assert.equal(result.replacement,"整理");
  assert.deepEqual(result.tasks.map(item=>item.type),["整理","整理"]);
  assert.deepEqual(result.colors,{整理:"#222222"});
});

test("the final work type cannot be deleted",()=>{
  const tasks=[task("a","论文")],colors={论文:"#111111"};
  const result=deleteWorkType(tasks,colors,"论文");
  assert.equal(result.replacement,null);
  assert.equal(result.tasks,tasks);
  assert.equal(result.colors,colors);
});
