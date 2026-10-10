import {test} from 'node:test';
import assert from 'node:assert/strict';
import {LocalEditTracker,sharedState,sameSyncDocument} from '../lib/sync/local-edit-tracker.ts';
import {advanceScheduleDocument} from '../lib/persistence/persistence.ts';
import {checkpointFrom,documentFingerprint,syncScheduleDocument} from '../lib/sync/cloud-sync.ts';
const state={dataVersion:6,projects:[],tasks:[{id:'t',title:'old'}],edges:[],tracks:[],settingsWidth:760};
const base=()=>advanceScheduleDocument(state,null,'mac',undefined,()=> 'timeline');
test('hydration and device width changes never mark an idle device edited',()=>{
  const tracker=new LocalEditTracker();
  assert.equal(tracker.observe(state),false);
  assert.equal(tracker.observe({...state,settingsWidth:900}),false);
  assert.equal(tracker.observe({...state,tasks:[{id:'t',title:'edited'}]}),true);
  tracker.restore();
  assert.equal(tracker.observe({...state,tasks:[{id:'t',title:'cloud'}]}),false);
  assert.equal(tracker.observe({...state,tasks:[{id:'t',title:'next edit'}]}),true);
  assert.equal('settingsWidth' in sharedState(state),false);
});
test('legacy raw checkpoint ignores incidental device writes and key order',async()=>{
  const doc=base();let writes=0;
  const idle=advanceScheduleDocument({...state,settingsWidth:900},doc,'idle');
  const remote={documentId:doc.documentId,serverRevision:1,updatedAt:doc.updatedAt,document:doc};
  const result=await syncScheduleDocument(idle,{...checkpointFrom(remote),documentFingerprint:JSON.stringify(doc)},{async load(){return remote},async save(){writes++;throw Error('must not upload')}});
  assert.equal(result.status,'current');assert.equal(writes,0);
  assert.equal(documentFingerprint(doc),documentFingerprint({...idle,data:{...Object.fromEntries(Object.entries(idle.data).reverse())} as typeof state}));
});
test('idle second device downloads Mac edits without uploading',async()=>{
  const doc=base(),remoteDoc=advanceScheduleDocument({...state,tasks:[{id:'t',title:'Mac new'}]},doc,'mac');
  const initial={documentId:doc.documentId,serverRevision:1,updatedAt:doc.updatedAt,document:doc};
  const idle=advanceScheduleDocument({...state,settingsWidth:900},doc,'idle');
  const result=await syncScheduleDocument(idle,checkpointFrom(initial),{async load(){return {...initial,serverRevision:2,document:remoteDoc}},async save(){throw Error('idle device uploaded')}});
  assert.equal(result.status,'downloaded');
  if(result.status==='downloaded')assert.deepEqual(result.document.data.tasks,[{id:'t',title:'Mac new'}]);
});
test('delayed download cannot apply over edits made while request is pending',async()=>{
  const doc=base();let current=doc;
  const initial={documentId:doc.documentId,serverRevision:1,updatedAt:doc.updatedAt,document:doc};
  let release!:(value:typeof initial)=>void;
  const pending=syncScheduleDocument(doc,checkpointFrom(initial),{load:()=>new Promise(resolve=>{release=resolve}),async save(){throw Error('unexpected upload')}});
  current=advanceScheduleDocument({...state,tasks:[{id:'t',title:'during request'}]},doc,'mac');
  release({...initial,serverRevision:2});
  const result=await pending;
  assert.equal(result.status,'downloaded');
  assert.equal(sameSyncDocument(doc,current),false);
  assert.equal(sameSyncDocument(doc,{...doc,documentId:'other-timeline'}),false);
  assert.equal(sameSyncDocument(doc,structuredClone(doc)),true);
  assert.deepEqual(current.data.tasks,[{id:'t',title:'during request'}]);
});
