import type {ScheduleDocument} from "../persistence/persistence";
import type {KeyValueStorage} from "../persistence/storage";

export const SYNC_CHECKPOINT_KEY_PREFIX="squitle-sync-checkpoint:";
export type CloudRevision=number|string;

export type CloudScheduleSnapshot={
  documentId:string;
  serverRevision:CloudRevision;
  updatedAt:string;
  document:ScheduleDocument;
};

export type CloudRevisionSnapshot={
  documentId:string;
  serverRevision:CloudRevision;
  updatedAt:string;
};

export type SyncCheckpoint={
  documentId:string;
  serverRevision:CloudRevision;
  documentFingerprint:string;
  syncedAt:string;
};

export type SyncResult=
  |{status:"uploaded"|"current";document:ScheduleDocument;checkpoint:SyncCheckpoint}
  |{status:"downloaded";document:ScheduleDocument;checkpoint:SyncCheckpoint}
  |{status:"initial-choice"|"conflict";local:ScheduleDocument;remote:CloudScheduleSnapshot;checkpoint:SyncCheckpoint|null};

export interface CloudScheduleStore{
  load(documentId:string):Promise<CloudScheduleSnapshot|null>;
  loadRevision?(documentId:string):Promise<CloudRevisionSnapshot|null>;
  save(document:ScheduleDocument,expectedServerRevision:CloudRevision|null):Promise<CloudScheduleSnapshot>;
}

export async function remoteRevisionChanged(
  documentId:string,
  checkpoint:SyncCheckpoint|null,
  cloud:CloudScheduleStore,
){
  if(!checkpoint||checkpoint.documentId!==documentId||!cloud.loadRevision)return true;
  const remote=await cloud.loadRevision(documentId);
  return !remote||remote.serverRevision!==checkpoint.serverRevision;
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
  private readonly scope:string;

  constructor(storage:KeyValueStorage,scope="sites"){this.storage=storage;this.scope=scope;}

  private key(documentId:string){
    return this.scope==="sites"
      ?`${SYNC_CHECKPOINT_KEY_PREFIX}${documentId}`
      :`${SYNC_CHECKPOINT_KEY_PREFIX}${this.scope}:${documentId}`;
  }

  load(documentId:string):SyncCheckpoint|null{
    const raw=this.storage.getItem(this.key(documentId));
    if(!raw)return null;
    try{
      const value=JSON.parse(raw) as Partial<SyncCheckpoint>;
      return typeof value.documentId==="string"
        &&((Number.isInteger(value.serverRevision)&&Number(value.serverRevision)>=0)||(typeof value.serverRevision==="string"&&value.serverRevision.length>0))
        &&typeof value.documentFingerprint==="string"
        &&typeof value.syncedAt==="string"
        ?value as SyncCheckpoint:null;
    }catch{return null;}
  }

  save(checkpoint:SyncCheckpoint){
    this.storage.setItem(this.key(checkpoint.documentId),JSON.stringify(checkpoint));
  }
}
