import test from "node:test";
import assert from "node:assert/strict";
import { DOCUMENT_KIND, type ScheduleDocument } from "../lib/persistence/persistence.ts";
import { deleteCloudTimeline, loadSyncAccount, renameCloudTimeline, SitesScheduleStore, SyncRequestError } from "../lib/sync/sites-sync.ts";

const document:ScheduleDocument={
  kind:DOCUMENT_KIND,schemaVersion:6,documentId:"doc-1",revision:2,
  updatedAt:"2026-09-20T00:00:00.000Z",updatedBy:"device-a",
  data:{dataVersion:6,projects:[],tasks:[],edges:[],tracks:[]},
};

test("Sites sync store loads and conditionally saves the signed-in user's document",async()=>{
  const calls:Array<{input:string;init?:RequestInit}>=[];
  const snapshot={documentId:"doc-1",serverRevision:3,updatedAt:document.updatedAt,document};
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls.push({input:String(input),init});
    return Response.json({snapshot});
  };
  const store=new SitesScheduleStore(fetcher as typeof fetch);
  assert.deepEqual(await store.load("ignored-local-id"),snapshot);
  assert.deepEqual(await store.save(document,2),snapshot);
  assert.equal(calls[0].input,"/api/sync/document?documentId=ignored-local-id");
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)),{document,expectedServerRevision:2});
});

test("account lookup treats an unauthenticated response as signed out",async()=>{
  const fetcher=async()=>Response.json({error:"sign_in_required"},{status:401});
  assert.equal(await loadSyncAccount(fetcher as typeof fetch),null);
});

test("sync request errors preserve the server conflict code",async()=>{
  const fetcher=async()=>Response.json({error:"revision_conflict"},{status:409});
  const store=new SitesScheduleStore(fetcher as typeof fetch);
  await assert.rejects(()=>store.save(document,1),(error:unknown)=>error instanceof SyncRequestError&&error.code==="revision_conflict"&&error.status===409);
});

test("timeline metadata can be renamed and deleted",async()=>{
  const calls:Array<{input:string;init?:RequestInit}>=[];
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{calls.push({input:String(input),init});return Response.json(init?.method==="PATCH"?{timeline:{documentId:"doc-1",title:"Research",updatedAt:"now"}}:{deleted:true});};
  await renameCloudTimeline("doc-1","Research",fetcher as typeof fetch);
  await deleteCloudTimeline("doc-1",fetcher as typeof fetch);
  assert.deepEqual(calls.map(call=>[call.input,call.init?.method,JSON.parse(String(call.init?.body))]),[["/api/sync/timelines","PATCH",{documentId:"doc-1",title:"Research"}],["/api/sync/timelines","DELETE",{documentId:"doc-1"}]]);
});
