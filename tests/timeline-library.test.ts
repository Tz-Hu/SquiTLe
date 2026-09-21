import test from "node:test";
import assert from "node:assert/strict";
import {mergeTimelineEntries,loadTimelineIndex,removeTimeline,upsertTimeline} from "../lib/persistence/timeline-library.ts";

class MemoryStorage{
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

test("timeline index keeps multiple local timelines",()=>{
  const storage=new MemoryStorage();
  upsertTimeline(storage,{documentId:"a",title:"我的 TimeLine",updatedAt:"2026-09-20",temporary:false});
  upsertTimeline(storage,{documentId:"b",title:"示例 TimeLine",updatedAt:"2026-09-21",temporary:true});
  assert.deepEqual(loadTimelineIndex(storage).map(item=>item.documentId),["a","b"]);
});

test("cloud timeline list is merged without replacing temporary state",()=>{
  const local=[{documentId:"a",title:"本地名称",updatedAt:"2026-09-20",temporary:true}];
  const merged=mergeTimelineEntries(local,[{documentId:"a",title:"云端名称",updatedAt:"2026-09-21"},{documentId:"b",title:"另一个",updatedAt:"2026-09-19"}]);
  assert.equal(merged.find(item=>item.documentId==="a")?.temporary,true);
  assert.equal(merged.find(item=>item.documentId==="a")?.title,"云端名称");
  assert.equal(merged.find(item=>item.documentId==="b")?.cloudOnly,true);
  assert.equal(merged.every(item=>item.cloudBacked),true);
});

test("a timeline can be removed without changing the remaining entries",()=>{
  const storage=new MemoryStorage();
  upsertTimeline(storage,{documentId:"a",title:"A",updatedAt:"2026-09-20",temporary:false});
  upsertTimeline(storage,{documentId:"b",title:"B",updatedAt:"2026-09-21",temporary:false});
  assert.deepEqual(removeTimeline(storage,"a").map(item=>item.documentId),["b"]);
});
