import {test} from "node:test";
import assert from "node:assert/strict";
import {CloudBaseScheduleStore,cloudBaseConfigFromEnvironment} from "../lib/sync/cloudbase.ts";
import {DOCUMENT_KIND,type ScheduleDocument} from "../lib/persistence/persistence.ts";

const document:ScheduleDocument={
  kind:DOCUMENT_KIND,schemaVersion:6,documentId:"doc-1",revision:1,
  updatedAt:"2026-09-20T00:00:00.000Z",updatedBy:"device-a",
  data:{dataVersion:6,projects:[],tasks:[],edges:[],tracks:[]},
};

test("public configuration requires an environment and publishable key",()=>{
  assert.equal(cloudBaseConfigFromEnvironment({NEXT_PUBLIC_CLOUDBASE_ENV_ID:"env"}),null);
  assert.deepEqual(cloudBaseConfigFromEnvironment({
    NEXT_PUBLIC_CLOUDBASE_ENV_ID:" env-id ",NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY:" key ",
  }),{env:"env-id",region:"ap-shanghai",accessKey:"key",syncFunction:"squitle-sync"});
});

test("CloudBase store sends load and conditional save through one function",async()=>{
  const calls:Array<{name:string;data:Record<string,unknown>}>=[];
  const snapshot={documentId:document.documentId,serverRevision:3,updatedAt:document.updatedAt,document};
  const store=new CloudBaseScheduleStore({callFunction:async options=>{
    calls.push(options);return {result:{ok:true,snapshot}};
  }},"sync-test");
  assert.deepEqual(await store.load("doc-1"),snapshot);
  assert.deepEqual(await store.save(document,2),snapshot);
  assert.deepEqual(calls,[
    {name:"sync-test",data:{action:"load",documentId:"doc-1"}},
    {name:"sync-test",data:{action:"save",documentId:"doc-1",expectedServerRevision:2,document}},
  ]);
});

test("CloudBase store surfaces function conflicts",async()=>{
  const store=new CloudBaseScheduleStore({callFunction:async()=>({result:{ok:false,error:"revision_conflict"}})});
  await assert.rejects(()=>store.save(document,1),/revision_conflict/);
});
