import {test} from 'node:test';
import assert from 'node:assert/strict';
import {moveRow,moveItem,insertItemRow,rowId,hasItemOverlap,canPlaceItem} from '../lib/rows.ts';
import type {Task} from '../lib/schedule.ts';
const task=(id:string,row:string,project='p1',order=0):Task=>({id,rowId:row,projectIds:[project],order:{[project]:order},title:id,type:'实验',start:'2026-08-06',end:'2026-08-10',status:'未开始'});
test('overlap applies only to ordinary tasks sharing a row and project, with inclusive dates',()=>{
 const first=task('a','r1');const second={...task('b','r1'),start:'2026-08-10',end:'2026-08-12'};
 assert.equal(hasItemOverlap([first,second],'a'),true);
 assert.equal(hasItemOverlap([first,{...second,start:'2026-08-11'}],'a'),false);
 assert.equal(hasItemOverlap([first,{...second,rowId:'r2'}],'a'),false);
 assert.equal(hasItemOverlap([first,{...second,projectIds:['p2']}],'a'),false);
 assert.equal(hasItemOverlap([first,{...second,milestone:true}],'a'),false);
 assert.equal(hasItemOverlap([{...first,milestone:true},second],'a'),false);
});
test('the overlap setting governs every placement check',()=>{
 const items=[task('a','r1'),{...task('b','r1'),start:'2026-08-08',end:'2026-08-12'}];
 assert.equal(canPlaceItem(items,'a',false),false);
 assert.equal(canPlaceItem(items,'a',true),true);
});
test('whole row moves every occurrence together across projects without copying identities',()=>{
 const original=[task('a','r1'),task('b','r1'),task('c','r2','p1',1),task('d','r3','p2')];
 const moved=moveRow(original,'a','p1','p2','d');
 assert.equal(moved.length,4);
 for(const id of ['a','b']){const item=moved.find(t=>t.id===id)!;assert.deepEqual(item.projectIds,['p2']);assert.equal(item.order.p2,0);assert.equal(item.start,'2026-08-06');}
 assert.equal(moved.find(t=>t.id==='d')!.order.p2,1);
 assert.deepEqual(original[0].projectIds,['p1']);
});
test('moving one occurrence into another row leaves its former row-mates intact',()=>{
 const original=[task('a','r1'),task('b','r1'),task('c','r2','p2')];
 const moved=moveItem(original,'a','p2',original[2]);
 assert.equal(rowId(moved[0]),'r2');assert.deepEqual(moved[0].projectIds,['p2']);
 assert.equal(rowId(moved[1]),'r1');assert.deepEqual(moved[1].projectIds,['p1']);
});
test('reordering a row preserves all of its occurrences and date ranges',()=>{
 const original=[task('a','r1'),task('b','r1'),task('c','r2','p1',1)];
 const moved=moveRow(original,'c','p1','p1','a');
 assert.equal(moved[2].order.p1,0);assert.equal(moved[0].order.p1,1);assert.equal(moved[1].order.p1,1);
 assert.deepEqual(moved.map(t=>[t.start,t.end]),original.map(t=>[t.start,t.end]));
});
test('inserting above the source row splits only the dragged item and preserves ordering',()=>{
 const original=[task('a','r1'),task('b','r1'),task('c','r2','p1',1)];
 const inserted=insertItemRow(original,'a','p1','a','new-row');
 assert.equal(rowId(inserted[0]),'new-row');assert.equal(inserted[0].order.p1,0);
 assert.equal(rowId(inserted[1]),'r1');assert.equal(inserted[1].order.p1,1);
 assert.equal(inserted[2].order.p1,2);
 assert.deepEqual(inserted.map(t=>[t.id,t.start,t.end]),original.map(t=>[t.id,t.start,t.end]));
});
