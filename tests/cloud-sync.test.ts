import {test} from "node:test";
import assert from "node:assert/strict";
import {BrowserSyncCheckpointStore,documentFingerprint,syncScheduleDocument,type CloudRevision,type CloudScheduleSnapshot,type CloudScheduleStore} from "../lib/sync/cloud-sync.ts";
import {DOCUMENT_KIND,type ScheduleDocument} from "../lib/persistence/persistence.ts";

const document=(revision:number,title:string,device="device-a"):ScheduleDocument=>({
  kind:DOCUMENT_KIND,
  schemaVersion:6,
  documentId:"document-1",
  revision,
  updatedAt:`2026-09-20T00:00:0${revision}.000Z`,
  updatedBy:device,
  data:{dataVersion:6,projects:[{id:"p1",title}],tasks:[],edges:[],tracks:[]},
});

class MemoryCloud implements CloudScheduleStore{
  snapshot:CloudScheduleSnapshot|null=null;
  async load(){return this.snapshot;}
  async save(value:ScheduleDocument,expected:CloudRevision|null){
    const actual=this.snapshot?.serverRevision??null;
    if(actual!==expected)throw new Error("revision_conflict");
    this.snapshot={documentId:value.documentId,serverRevision:(typeof actual==="number"?actual:0)+1,updatedAt:value.updatedAt,document:value};
    return this.snapshot;
  }
}

class MemoryStorage{
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

test("first sync uploads the local document to an empty cloud",async()=>{
  const cloud=new MemoryCloud(),local=document(1,"Local");
  const result=await syncScheduleDocument(local,null,cloud,()=>new Date("2026-09-20T01:00:00.000Z"));
  assert.equal(result.status,"uploaded");
  assert.equal(result.checkpoint.serverRevision,1);
  assert.equal(result.checkpoint.documentFingerprint,documentFingerprint(local));
  assert.deepEqual(cloud.snapshot?.document,local);
});

test("a first connection never overwrites different cloud data",async()=>{
  const cloud=new MemoryCloud(),remote=document(2,"Cloud","device-b");
  cloud.snapshot={documentId:remote.documentId,serverRevision:4,updatedAt:remote.updatedAt,document:remote};
  const result=await syncScheduleDocument(document(3,"Local"),null,cloud);
  assert.equal(result.status,"initial-choice");
  assert.deepEqual(cloud.snapshot.document,remote);
});

test("remote-only changes download after a known checkpoint",async()=>{
  const cloud=new MemoryCloud(),base=document(1,"Base"),remote=document(2,"Cloud","device-b");
  cloud.snapshot={documentId:base.documentId,serverRevision:2,updatedAt:remote.updatedAt,document:remote};
  const result=await syncScheduleDocument(base,{documentId:base.documentId,serverRevision:1,documentFingerprint:documentFingerprint(base),syncedAt:"2026-09-20T00:00:00.000Z"},cloud);
  assert.equal(result.status,"downloaded");
  assert.deepEqual(result.document,remote);
});

test("local-only changes use compare-and-swap upload",async()=>{
  const cloud=new MemoryCloud(),base=document(1,"Base"),local=document(2,"Local");
  cloud.snapshot={documentId:base.documentId,serverRevision:3,updatedAt:base.updatedAt,document:base};
  const result=await syncScheduleDocument(local,{documentId:base.documentId,serverRevision:3,documentFingerprint:documentFingerprint(base),syncedAt:"2026-09-20T00:00:00.000Z"},cloud);
  assert.equal(result.status,"uploaded");
  assert.equal(cloud.snapshot.serverRevision,4);
  assert.deepEqual(cloud.snapshot.document,local);
});

test("concurrent local and remote changes become an explicit conflict",async()=>{
  const cloud=new MemoryCloud(),base=document(1,"Base"),local=document(2,"Local"),remote=document(2,"Cloud","device-b");
  cloud.snapshot={documentId:base.documentId,serverRevision:2,updatedAt:remote.updatedAt,document:remote};
  const result=await syncScheduleDocument(local,{documentId:base.documentId,serverRevision:1,documentFingerprint:documentFingerprint(base),syncedAt:"2026-09-20T00:00:00.000Z"},cloud);
  assert.equal(result.status,"conflict");
  assert.deepEqual(cloud.snapshot.document,remote);
});

test("checkpoint storage is isolated by document and ignores malformed values",()=>{
  const memory=new MemoryStorage(),store=new BrowserSyncCheckpointStore(memory);
  const checkpoint={documentId:"document-1",serverRevision:2,documentFingerprint:"hash",syncedAt:"2026-09-20T00:00:00.000Z"};
  store.save(checkpoint);
  assert.deepEqual(store.load("document-1"),checkpoint);
  assert.equal(store.load("document-2"),null);
  memory.setItem("squitle-sync-checkpoint:broken","not-json");
  assert.equal(store.load("broken"),null);
});

test("checkpoint storage isolates cloud providers and accepts opaque revisions",()=>{
  const memory=new MemoryStorage();
  const sites=new BrowserSyncCheckpointStore(memory);
  const webdav=new BrowserSyncCheckpointStore(memory,"webdav:server-a");
  const checkpoint={documentId:"document-1",serverRevision:'etag:"abc"',documentFingerprint:"hash",syncedAt:"2026-09-20T00:00:00.000Z"};
  webdav.save(checkpoint);
  assert.deepEqual(webdav.load("document-1"),checkpoint);
  assert.equal(sites.load("document-1"),null);
});
