import test from "node:test";
import assert from "node:assert/strict";
import {completedLast} from "../lib/daily-agenda.ts";

test("daily agenda keeps unfinished items first and completed items at the bottom",()=>{
  const result=completedLast([
    {id:"done-inbox",completed:true},
    {id:"active-task",completed:false},
    {id:"done-task",completed:true},
    {id:"active-inbox",completed:false},
  ]);
  assert.deepEqual(result.map(item=>item.id),["active-task","active-inbox","done-inbox","done-task"]);
});
