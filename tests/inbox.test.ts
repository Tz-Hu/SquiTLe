import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractInboxUrgency,inboxTimeTone,isInboxItemOverdue,parseInboxInput,restoreInbox,sortInboxItems,type InboxItem} from '../lib/inbox.ts';
import {historyOf,commit,undo} from '../lib/history.ts';
test('inbox prefixes detect format without changing ordinary text',()=>{
  for(const [text,kind] of [['1. ','numbered'],['12. ','numbered'],['- ','bullet'],['[] ','checklist'],['【】 ','checklist']] as const)assert.deepEqual(parseInboxInput(text+'研究','bullet'),{text:'研究',kind});
  assert.deepEqual(parseInboxInput('1.2 模型','checklist'),{text:'1.2 模型',kind:'checklist'});
  assert.deepEqual(parseInboxInput('【】','bullet'),{text:'【】',kind:'bullet'});
});
test('exclamation marks are extracted as urgency and capped at three',()=>{
  assert.deepEqual(extractInboxUrgency('!! 完成实验！'),{text:'完成实验',urgency:'high'});
  assert.deepEqual(extractInboxUrgency('完成实验!'),{text:'完成实验',urgency:'low'});
  assert.deepEqual(extractInboxUrgency('普通事项'),{text:'普通事项',urgency:'none'});
});
test('old data starts with an empty inbox and malformed entries are ignored',()=>{
  assert.deepEqual(restoreInbox(undefined),[]);
  const item={id:'one',text:'idea',kind:'checklist',done:false};
  assert.deepEqual(restoreInbox([null,{},item]),[{...item,urgency:'none'}]);
});
test('dated inbox items persist and undo returns them to the undated inbox',()=>{
  const initial={inbox:[{id:'one',text:'idea',kind:'checklist',done:false,urgency:'none' as const}],tasks:[] as string[]};
  const next=commit(historyOf(initial),current=>({...current,inbox:current.inbox.map(item=>({...item,date:'2026-09-16'}))}));
  assert.deepEqual(restoreInbox(JSON.parse(JSON.stringify(next.present.inbox))),next.present.inbox);
  assert.deepEqual(next.present.tasks,[]);
  assert.deepEqual(undo(next).present,initial);
});
test('TodoList sorting keeps completed items last and undated items visible',()=>{
  const items:InboxItem[]=[
    {id:'a',text:'undated',kind:'checklist',done:false,urgency:'high'},
    {id:'b',text:'later',kind:'checklist',done:false,urgency:'low',date:'2026-09-18'},
    {id:'c',text:'earlier',kind:'checklist',done:false,urgency:'medium',date:'2026-09-17'},
    {id:'d',text:'done',kind:'checklist',done:true,urgency:'high',date:'2026-09-16'},
  ];
  assert.deepEqual(sortInboxItems(items,'date').map(item=>item.id),['c','b','a','d']);
  assert.deepEqual(sortInboxItems(items,'urgency').map(item=>item.id),['a','c','b','d']);
  assert.equal(isInboxItemOverdue(items[2],'2026-09-18'),true);
  assert.equal(isInboxItemOverdue(items[3],'2026-09-18'),false);
});
test('TodoList time colors use status and inclusive remaining schedule percentage',()=>{
  const base={id:'a',text:'task',kind:'checklist' as const,done:false,urgency:'none' as const,date:'2026-09-01',endDate:'2026-09-10'};
  assert.equal(inboxTimeTone({...base,status:'未开始'},'2026-09-06'),'orange'); // 50% remains
  assert.equal(inboxTimeTone({...base,status:'未开始'},'2026-09-07'),'red');
  assert.equal(inboxTimeTone({...base,status:'进行中'},'2026-09-06'),'orange');
  assert.equal(inboxTimeTone({...base,status:'进行中'},'2026-09-09'),'red');
  assert.equal(inboxTimeTone({...base,status:'已完成',done:true},'2026-09-11'),'normal');
  assert.equal(isInboxItemOverdue(base,'2026-09-06'),false);
});
