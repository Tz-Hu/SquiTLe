import test from "node:test";
import assert from "node:assert/strict";
import {DOCUMENT_KIND,type ScheduleDocument} from "../lib/persistence/persistence.ts";
import {loadWebDavConnection,NUTSTORE_WEBDAV_URL,saveWebDavConnection,validateWebDavConnection,WebDavScheduleStore,webDavCheckpointScope} from "../lib/sync/webdav-sync.ts";

const document:ScheduleDocument={
  kind:DOCUMENT_KIND,schemaVersion:6,documentId:"doc-1",revision:2,
  updatedAt:"2026-09-21T00:00:00.000Z",updatedBy:"device-a",
  data:{dataVersion:6,projects:[],tasks:[],edges:[],tracks:[]},
};

class MemoryStorage{
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

test("WebDAV configuration requires a public HTTPS file URL and app credentials",()=>{
  assert.equal(validateWebDavConnection({url:NUTSTORE_WEBDAV_URL,username:"user@example.com",password:"app-password"}),null);
  assert.equal(validateWebDavConnection({url:"http://dav.example.com/squitle.json",username:"user",password:"pw"}),"webdav_invalid_url");
  assert.equal(validateWebDavConnection({url:"https://127.0.0.1/squitle.json",username:"user",password:"pw"}),"webdav_invalid_url");
  assert.equal(validateWebDavConnection({url:"https://dav.example.com/folder/",username:"user",password:"pw"}),"webdav_file_url_required");
  assert.equal(validateWebDavConnection({url:NUTSTORE_WEBDAV_URL,username:"",password:""}),"webdav_credentials_required");
});

test("WebDAV credentials stay in device storage and endpoint scopes are stable",()=>{
  const storage=new MemoryStorage();
  const connection=saveWebDavConnection(storage,{url:` ${NUTSTORE_WEBDAV_URL} `,username:" user@example.com ",password:"pw"});
  assert.deepEqual(loadWebDavConnection(storage),connection);
  assert.equal(webDavCheckpointScope(connection),webDavCheckpointScope(connection));
  assert.notEqual(webDavCheckpointScope(connection),webDavCheckpointScope({...connection,username:"other@example.com"}));
});

test("WebDAV store sends credentials only in the same-origin request body",async()=>{
  const calls:Array<{input:string;body:Record<string,unknown>}>=[];
  const connection={url:NUTSTORE_WEBDAV_URL,username:"user@example.com",password:"app-password"};
  const snapshot={documentId:document.documentId,serverRevision:'etag:"abc"',updatedAt:document.updatedAt,document};
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
    calls.push({input:String(input),body});
    return Response.json(body.action==="revision"?{revision:snapshot}:{snapshot});
  };
  const store=new WebDavScheduleStore(connection,fetcher as typeof fetch);
  assert.deepEqual(await store.load(document.documentId),snapshot);
  assert.deepEqual(await store.loadRevision(document.documentId),snapshot);
  assert.deepEqual(await store.save(document,'etag:"old"'),snapshot);
  assert.equal(calls[0].input,"/api/sync/webdav");
  assert.deepEqual(calls[0].body,{action:"load",connection});
  assert.deepEqual(calls[1].body,{action:"revision",connection,documentId:document.documentId});
  assert.deepEqual(calls[2].body,{action:"save",connection,document,expectedServerRevision:'etag:"old"'});
});
