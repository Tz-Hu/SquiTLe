import {test} from "node:test";
import assert from "node:assert/strict";
import {BACKUP_KIND, CURRENT_DATA_VERSION, createBackup, migratePersistedState, parseBackup} from "../lib/persistence.ts";

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

test("export envelope can be imported",()=>{
  const backup=createBackup(oldState);
  assert.equal(backup.kind,BACKUP_KIND);
  assert.equal(parseBackup(JSON.stringify(backup)).dataVersion,CURRENT_DATA_VERSION);
});

test("future and malformed data are rejected",()=>{
  assert.throws(()=>migratePersistedState({projects:[],tasks:[],edges:[],dataVersion:99}),/future_backup/);
  assert.throws(()=>migratePersistedState({tasks:[]}),/invalid_backup/);
});
