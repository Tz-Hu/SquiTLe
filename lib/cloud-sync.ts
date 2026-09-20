import type {ScheduleDocument} from "./persistence";
import type {KeyValueStorage} from "./storage";

export const SYNC_CHECKPOINT_KEY_PREFIX="squitle-sync-checkpoint:";

export type CloudScheduleSnapshot={
  documentId:string;
  serverRevision:number;
  updatedAt:string;
  document:ScheduleDocument;
};

export type SyncCheckpoint={
  documentId:string;
  serverRevision:number;
  documentFingerprint:string;
  syncedAt:string;
};

export type SyncResult=
  |{status:"uploaded"|"current";document:ScheduleDocument;checkpoint:SyncCheckpoint}
  |{status:"downloaded";document:ScheduleDocument;checkpoint:SyncCheckpoint}
  |{status:"initial-choice"|"conflict";local:ScheduleDocument;remote:CloudScheduleSnapshot;checkpoint:SyncCheckpoint|null};

export interface CloudScheduleStore{
  load(documentId:string):Promise<CloudScheduleSnapshot|null>;
  save(document:ScheduleDocument,expectedServerRevision:number|null):Promise<CloudScheduleSnapshot>;
}

export function documentFingerprint(document:ScheduleDocument){
  return JSON.stringify(document);
}

export function checkpointFrom(snapshot:CloudScheduleSnapshot,now:()=>Date=()=>new Date()):SyncCheckpoint{
  return {
    documentId:snapshot.documentId,
    serverRevision:snapshot.serverRevision,
    documentFingerprint:documentFingerprint(snapshot.document),
    syncedAt:now().toISOString(),
  };
}

export async function syncScheduleDocument(
  local:ScheduleDocument,
  checkpoint:SyncCheckpoint|null,
  cloud:CloudScheduleStore,
  now:()=>Date=()=>new Date(),
):Promise<SyncResult>{
  const remote=await cloud.load(local.documentId);
  if(!remote){
    const uploaded=await cloud.save(local,null);
    return {status:"uploaded",document:uploaded.document,checkpoint:checkpointFrom(uploaded,now)};
  }

  const localFingerprint=documentFingerprint(local);
  const remoteFingerprint=documentFingerprint(remote.document);
  if(!checkpoint||checkpoint.documentId!==local.documentId){
    if(localFingerprint===remoteFingerprint){
      return {status:"current",document:local,checkpoint:checkpointFrom(remote,now)};
    }
    return {status:"initial-choice",local,remote,checkpoint:null};
  }

  const localChanged=localFingerprint!==checkpoint.documentFingerprint;
  const remoteChanged=remote.serverRevision!==checkpoint.serverRevision;
  if(!localChanged&&!remoteChanged){
    return {status:"current",document:local,checkpoint:{...checkpoint,syncedAt:now().toISOString()}};
  }
  if(!localChanged&&remoteChanged){
    return {status:"downloaded",document:remote.document,checkpoint:checkpointFrom(remote,now)};
  }
  if(localChanged&&!remoteChanged){
    const uploaded=await cloud.save(local,checkpoint.serverRevision);
    return {status:"uploaded",document:uploaded.document,checkpoint:checkpointFrom(uploaded,now)};
  }
  if(localFingerprint===remoteFingerprint){
    return {status:"current",document:local,checkpoint:checkpointFrom(remote,now)};
  }
  return {status:"conflict",local,remote,checkpoint};
}

export class BrowserSyncCheckpointStore{
  private readonly storage:KeyValueStorage;

  constructor(storage:KeyValueStorage){this.storage=storage;}

  load(documentId:string):SyncCheckpoint|null{
    const raw=this.storage.getItem(`${SYNC_CHECKPOINT_KEY_PREFIX}${documentId}`);
    if(!raw)return null;
    try{
      const value=JSON.parse(raw) as Partial<SyncCheckpoint>;
      return typeof value.documentId==="string"
        &&Number.isInteger(value.serverRevision)
        &&typeof value.documentFingerprint==="string"
        &&typeof value.syncedAt==="string"
        ?value as SyncCheckpoint:null;
    }catch{return null;}
  }

  save(checkpoint:SyncCheckpoint){
    this.storage.setItem(`${SYNC_CHECKPOINT_KEY_PREFIX}${checkpoint.documentId}`,JSON.stringify(checkpoint));
  }
}
