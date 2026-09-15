import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyOf, commit, undo, redo } from '../lib/history.ts';

test('deleting shared task and relationships is one undoable transaction', () => {
  const original = { tasks: [{id:'a',projects:['p1','p2']},{id:'b',projects:['p1']}], edges:[{source:'a',target:'b'}] };
  const deleted = commit(historyOf(original), state => ({tasks:state.tasks.filter(t=>t.id!=='a'),edges:[]}));
  assert.equal(deleted.past.length,1);
  assert.deepEqual(undo(deleted).present,original);
  assert.deepEqual(redo(undo(deleted)).present,deleted.present);
});
test('consecutive edits undo in reverse order; new edits clear redo; no-ops are skipped', () => {
  const initial = historyOf({date:1,name:'task'});
  const moved = commit(initial,s=>({...s,date:5}));
  const edited = commit(moved,s=>({...s,name:'new'}));
  assert.deepEqual(undo(edited).present,moved.present);
  assert.deepEqual(undo(undo(edited)).present,initial.present);
  assert.equal(commit(edited,s=>({...s})),edited);
  const branch = commit(undo(edited),s=>({...s,date:9}));
  assert.equal(branch.future.length,0); assert.equal(redo(branch),branch);
});
test('history is bounded and hydration has no undo entries', () => {
  let history = historyOf(0);
  for(let i=0;i<150;i++)history=commit(history,n=>n+1);
  assert.equal(history.past.length,100);
  assert.deepEqual(historyOf(history.present),{past:[],present:150,future:[]});
});
