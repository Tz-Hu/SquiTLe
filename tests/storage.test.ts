import {test} from "node:test";
import assert from "node:assert/strict";
import {BrowserJsonStorage,createScheduleStorage,DesktopJsonStorage,DEVICE_ID_KEY,getOrCreateDeviceId,SCHEDULE_STORAGE_KEY} from "../lib/storage.ts";

class MemoryStorage {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

test("browser storage preserves the current JSON shape",async()=>{
  const memory=new MemoryStorage();
  const storage=new BrowserJsonStorage<{dataVersion:number;projects:unknown[]}>(memory);
  const value={dataVersion:4,projects:[{id:"p1"}]};
  await storage.save(value);
  assert.equal(memory.getItem(SCHEDULE_STORAGE_KEY),JSON.stringify(value));
  assert.deepEqual((await storage.load()).data,value);
});

test("browser storage reports an empty first run without writing",async()=>{
  const memory=new MemoryStorage();
  const storage=new BrowserJsonStorage<unknown>(memory);
  assert.deepEqual(await storage.load(),{data:null});
  assert.equal(memory.values.size,0);
});

test("invalid JSON is surfaced so the caller can preserve the original",async()=>{
  const memory=new MemoryStorage();
  memory.setItem(SCHEDULE_STORAGE_KEY,"{broken");
  const storage=new BrowserJsonStorage<unknown>(memory);
  await assert.rejects(()=>storage.load(),SyntaxError);
  assert.equal(memory.getItem(SCHEDULE_STORAGE_KEY),"{broken");
});

test("device identity is created once per browser storage",()=>{
  const memory=new MemoryStorage();let calls=0;
  const first=getOrCreateDeviceId(memory,()=>`device-${++calls}`);
  const second=getOrCreateDeviceId(memory,()=>`device-${++calls}`);
  assert.equal(first,"device-1");assert.equal(second,"device-1");assert.equal(calls,1);
  assert.equal(memory.getItem(DEVICE_ID_KEY),"device-1");
});

test("desktop storage loads and saves through the native document bridge",async()=>{
  const calls:Array<{command:string;args?:Record<string,unknown>}>=[];
  const root=globalThis as typeof globalThis&{__TAURI__?:unknown};
  root.__TAURI__={core:{invoke:async(command:string,args?:Record<string,unknown>)=>{
    calls.push({command,args});
    return command==="read_app_schedule_document"?JSON.stringify({revision:3}):null;
  }}};
  try{
    const storage=createScheduleStorage<{revision:number}>(new MemoryStorage());
    assert.ok(storage instanceof DesktopJsonStorage);
    assert.deepEqual(await storage.load(),{data:{revision:3}});
    await storage.save({revision:4});
    assert.deepEqual(calls,[
      {command:"read_app_schedule_document",args:undefined},
      {command:"write_app_schedule_document",args:{contents:JSON.stringify({revision:4})}},
    ]);
  }finally{delete root.__TAURI__;}
});
