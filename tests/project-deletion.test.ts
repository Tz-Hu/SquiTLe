import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteProjectContent,type Task,type Dependency} from '../lib/schedule.ts';

const task=(id:string,projectIds:string[]):Task=>({id,title:id,projectIds,order:Object.fromEntries(projectIds.map((project,index)=>[project,index])),type:'工程',start:'2026-09-16',end:'2026-09-17',status:'未开始'});
const edges:Dependency[]=[{id:'edge',source:{taskId:'a',day:0,side:'bottom'},target:{taskId:'c',day:0,side:'top'}}];

test('deleting a project keeps its tasks and dependencies but removes project membership',()=>{
  const result=deleteProjectContent([task('a',['p1']),task('b',['p1','p2']),task('c',['p2'])],edges,'p1',false);
  assert.deepEqual(result.tasks.map(item=>item.projectIds),[[],['p2'],['p2']]);
  assert.deepEqual(result.tasks[0].order,{});
  assert.deepEqual(result.edges,edges);
  assert.equal(result.unclassifiedCount,1);
});

test('cascade deletion removes project tasks and every dependency connected to them',()=>{
  const result=deleteProjectContent([task('a',['p1']),task('c',['p2'])],edges,'p1',true);
  assert.deepEqual(result.tasks.map(item=>item.id),['c']);
  assert.deepEqual(result.edges,[]);
  assert.equal(result.affectedCount,1);
});
