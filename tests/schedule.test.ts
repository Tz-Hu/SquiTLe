import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendDependencyOutput, dependencyIsCompleted, dependencyOutputs, pruneDependencyOutputs, transferTask, relatedDepths, hasCycle, type Task, type Dependency } from '../lib/schedule.ts';

const task = (id: string, project: string, order = 0): Task => ({ id, title: id, projectIds: [project], order: { [project]: order }, type: '实验', start: '2026-09-01', end: '2026-09-12', status: '未开始' });
const edge = (source: string, target: string): Dependency => ({ id: source+target, source: { taskId: source, day: 3, side: 'bottom' }, target: { taskId: target, day: 4, side: 'top' } });
test('move preserves identity, copy isolates, share keeps one content record', () => {
  const tasks = [task('a','p1'),task('b','p2')];
  const moved = transferTask(tasks,'a','p1','p2','b','move','copy');
  assert.deepEqual(moved[0].projectIds,['p2']); assert.equal(moved[0].order.p2,0); assert.equal(moved[1].order.p2,1);
  const copied = transferTask(tasks,'a','p1','p2',undefined,'copy','copy');
  assert.equal(copied.length,3); assert.deepEqual(copied[0].projectIds,['p1']); assert.equal(copied[2].title,'a');
  assert.equal([edge('a','b')].some(e=>e.source.taskId===copied[2].id||e.target.taskId===copied[2].id),false);
  const shared = transferTask(tasks,'a','p1','p2',undefined,'share','copy');
  assert.equal(shared.length,2); assert.deepEqual(shared[0].projectIds,['p1','p2']);
  const again = transferTask(shared,'a','p1','p2',undefined,'share','copy');
  assert.equal(again.length,2); assert.deepEqual(again[0].projectIds,['p1','p2']);
});
test('same-project sorting ignores cross-project copy setting; shared order stays independent', () => {
  const tasks = [task('a','p1'),task('b','p1',1),task('c','p1',2)];
  const ordered = transferTask(tasks,'c','p1','p1','a','copy','copy');
  assert.equal(ordered.length,3); assert.equal(ordered[2].order.p1,0);
  const shared = transferTask(ordered,'c','p1','p2',undefined,'share','copy');
  const reordered = transferTask(shared,'c','p1','p1',undefined,'move','copy');
  assert.equal(reordered[2].order.p2,0); assert.equal(reordered[2].order.p1,2);
});
test('multi-input/output traversal fades by distance without including siblings; cycles terminate', () => {
  const edges = [edge('a','b'),edge('x','b'),edge('b','c'),edge('b','d'),edge('c','e')];
  const fromB = relatedDepths('b',edges);
  assert.equal(fromB.get('a'),1); assert.equal(fromB.get('x'),1); assert.equal(fromB.get('d'),1); assert.equal(fromB.get('e'),2);
  assert.equal(relatedDepths('c',edges).has('d'),false);
  assert.equal(hasCycle(edges),false); assert.equal(hasCycle([...edges,edge('e','a')]),true);
  assert.equal(relatedDepths('a',[...edges,edge('e','a')]).get('a'),0);
});
test('dependency outputs reference stable source output ids',()=>{
  const tasks=[task('a','p1'),task('b','p1')];
  const edges=[edge('a','b')];
  const appended=appendDependencyOutput(tasks,edges,'ab','Dataset ready','output-1');
  assert.deepEqual(appended.tasks[0].outputs,[{id:'output-1',text:'Dataset ready'}]);
  assert.deepEqual(appended.edges[0].outputIds,['output-1']);
  const renamed={...appended.tasks[0],outputs:[{id:'output-1',text:'Clean dataset ready'}]};
  assert.equal(renamed.outputs?.[0].id,appended.edges[0].outputIds?.[0]);
  assert.deepEqual(dependencyOutputs(appended.edges[0],renamed),[{id:'output-1',text:'Clean dataset ready',number:1}]);
  assert.deepEqual(pruneDependencyOutputs(appended.edges,'a',[])[0].outputIds,[]);
});
test('a dependency follows the completion state of its successor',()=>{
  const tasks=[task('a','p1'),{...task('b','p1'),status:'已完成' as const}];
  assert.equal(dependencyIsCompleted(edge('a','b'),tasks),true);
  assert.equal(dependencyIsCompleted(edge('b','a'),tasks),false);
});
