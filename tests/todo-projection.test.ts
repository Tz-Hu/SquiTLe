import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectTasksToTodo,reconcileTodoList} from '../lib/domain/todo-projection.ts';
import type {Task,Dependency} from '../lib/domain/schedule.ts';

const tasks:Task[]=[{id:'task-1',title:'实验',projectIds:['p1'],order:{p1:0},type:'实验',start:'2026-09-16',end:'2026-09-18',status:'进行中'}];
test('timeline tasks are projected into TodoList without duplicating inbox records',()=>{
  const projection=projectTasksToTodo(tasks);
  assert.deepEqual(projection[0],{id:'timeline:task-1',taskId:'task-1',text:'实验',kind:'checklist',done:false,urgency:'none',date:'2026-09-16',endDate:'2026-09-18',status:'进行中'});
  const synced=reconcileTodoList(tasks,[],[{...projection[0],text:'更新实验',done:true,urgency:'high'}],'2026-09-16');
  assert.equal(synced.tasks[0].title,'更新实验');
  assert.equal(synced.tasks[0].status,'已完成');
  assert.equal(synced.tasks[0].urgency,'high');
  assert.deepEqual(synced.inbox,[]);
});
test('deleting a timeline projection deletes the same task and its relationships',()=>{
  const edges:Dependency[]=[{id:'edge',source:{taskId:'task-1',day:0,side:'bottom'},target:{taskId:'task-2',day:0,side:'top'}}];
  const result=reconcileTodoList(tasks,edges,[],'2026-09-16');
  assert.deepEqual(result.tasks,[]);
  assert.deepEqual(result.edges,[]);
});
