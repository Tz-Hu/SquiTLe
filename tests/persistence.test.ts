import {test} from "node:test";
import assert from "node:assert/strict";
import {advanceScheduleDocument,BACKUP_KIND, CURRENT_DATA_VERSION, DOCUMENT_KIND, createBackup, loadScheduleDocument, migratePersistedState, parseBackup} from "../lib/persistence.ts";

const oldState={projects:[{id:"p1"}],tasks:[{id:"t1",title:"Test",note:"legacy note"}],edges:[]};

test("implicit v2 browser data migrates to the current schema",()=>{
  const migrated=migratePersistedState(oldState);
  assert.equal(migrated.dataVersion,CURRENT_DATA_VERSION);
  assert.equal((migrated.tasks[0] as {memo:string}).memo,"legacy note");
});

test("v3 work types preserve experiment and rename the legacy other category",()=>{
  const migrated=migratePersistedState({projects:[],tasks:[{id:"a",type:"实验"},{id:"b",type:"其他"}],edges:[],dataVersion:3});
  assert.deepEqual((migrated.tasks as Array<{type:string}>).map(task=>task.type),["实验","整理"]);
});

test("v4 data gains task outputs and dependency output references",()=>{
  const migrated=migratePersistedState({projects:[],tasks:[{id:"a"}],edges:[{id:"ab"}],dataVersion:4});
  assert.deepEqual((migrated.tasks[0] as {outputs:unknown[]}).outputs,[]);
  assert.deepEqual((migrated.edges[0] as {outputIds:unknown[]}).outputIds,[]);
});

test("v5 data gains independent task-track metadata",()=>{
  const migrated=migratePersistedState({projects:[],tasks:[{id:"a",rowId:"row-1",title:"事项 A",type:"实验"},{id:"b",rowId:"row-1",title:"事项 B",type:"论文"}],edges:[],dataVersion:5});
  assert.deepEqual(migrated.tracks,[{id:"row-1",title:"事项 A",type:"实验"}]);
});

test("export envelope can be imported",()=>{
  const backup=createBackup(oldState);
  assert.equal(backup.kind,BACKUP_KIND);
  assert.equal(parseBackup(JSON.stringify(backup)).dataVersion,CURRENT_DATA_VERSION);
});

test("future and malformed data are rejected",()=>{
  assert.throws(()=>migratePersistedState({projects:[],tasks:[],edges:[],dataVersion:99}),/future_backup/);
  assert.throws(()=>migratePersistedState({tasks:[]}),/invalid_backup/);
});

test("legacy browser state receives a stable document identity without changing its data",()=>{
  const loaded=loadScheduleDocument(oldState,"browser-a",()=>"document-1",()=>new Date("2026-09-17T00:00:00.000Z"));
  assert.equal(loaded.legacy,true);
  assert.equal(loaded.document.kind,DOCUMENT_KIND);
  assert.equal(loaded.document.documentId,"document-1");
  assert.equal(loaded.document.revision,0);
  assert.equal(loaded.document.updatedBy,"browser-a");
  assert.equal((loaded.document.data.tasks[0] as {memo:string}).memo,"legacy note");
});

test("saving advances revision while retaining document identity",()=>{
  const first=advanceScheduleDocument(oldState,null,"browser-a",()=>new Date("2026-09-17T00:00:00.000Z"),()=>"document-1");
  const second=advanceScheduleDocument({...oldState,projects:[{id:"p2"}]},first,"browser-b",()=>new Date("2026-09-17T01:00:00.000Z"));
  assert.equal(first.revision,1);
  assert.equal(second.revision,2);
  assert.equal(second.documentId,first.documentId);
  assert.equal(second.updatedBy,"browser-b");
  assert.deepEqual(second.data.projects,[{id:"p2"}]);
  assert.equal(migratePersistedState(second).dataVersion,CURRENT_DATA_VERSION);
});
