import type {CloudRevision,CloudRevisionSnapshot,CloudScheduleSnapshot,CloudScheduleStore} from "./cloud-sync.ts";
import type {ScheduleDocument} from "../persistence/persistence.ts";
import {jsonRequest,SyncRequestError} from "./sites-sync.ts";
import type {KeyValueStorage} from "../persistence/storage.ts";

export const WEBDAV_CONFIG_KEY="squitle-webdav-config";
export const NUTSTORE_WEBDAV_URL="https://dav.jianguoyun.com/dav/squitle.json";

export type WebDavConnection={url:string;username:string;password:string};

export function normalizeWebDavConnection(value:WebDavConnection):WebDavConnection{
  return {url:value.url.trim(),username:value.username.trim(),password:value.password};
}

export function validateWebDavConnection(value:unknown){
  if(!value||typeof value!=="object")return "webdav_credentials_required" as const;
  const raw=value as Partial<WebDavConnection>;
  if(typeof raw.url!=="string"||typeof raw.username!=="string"||typeof raw.password!=="string")return "webdav_credentials_required" as const;
  const connection=normalizeWebDavConnection(raw as WebDavConnection);
  if(!connection.username||!connection.password)return "webdav_credentials_required" as const;
  if(connection.url.length>2048||connection.username.length>320||connection.password.length>1024)return "webdav_invalid_url" as const;
  let url:URL;
  try{url=new URL(connection.url);}catch{return "webdav_invalid_url" as const;}
  if(url.protocol!=="https:"||url.username||url.password||url.hash)return "webdav_invalid_url" as const;
  const hostname=url.hostname.toLowerCase().replace(/^\[|\]$/g,"").replace(/\.$/,"");
  const privateIpv4=/^(?:0|10|127)\.|^169\.254\.|^192\.168\.|^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname);
  const privateIpv6=hostname==="::1"||hostname.startsWith("fc")||hostname.startsWith("fd")||hostname.startsWith("fe80:");
  if(!hostname||hostname==="localhost"||hostname.endsWith(".localhost")||hostname.endsWith(".local")||hostname.endsWith(".internal")||privateIpv4||privateIpv6)return "webdav_invalid_url" as const;
  if(url.pathname.endsWith("/"))return "webdav_file_url_required" as const;
  return null;
}

export function saveWebDavConnection(storage:KeyValueStorage,value:WebDavConnection){
  const connection=normalizeWebDavConnection(value);
  storage.setItem(WEBDAV_CONFIG_KEY,JSON.stringify(connection));
  return connection;
}

export function loadWebDavConnection(storage:KeyValueStorage):WebDavConnection|null{
  const raw=storage.getItem(WEBDAV_CONFIG_KEY);if(!raw)return null;
  try{
    const value=JSON.parse(raw) as Partial<WebDavConnection>;
    const connection={url:value.url??"",username:value.username??"",password:value.password??""};
    return validateWebDavConnection(connection)===null?normalizeWebDavConnection(connection):null;
  }catch{return null;}
}

export function webDavCheckpointScope(connection:WebDavConnection){
  const text=`${connection.url}\n${connection.username}`;
  let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return `webdav:${(hash>>>0).toString(36)}`;
}

export class WebDavScheduleStore implements CloudScheduleStore{
  private readonly connection:WebDavConnection;
  private readonly fetcher:typeof fetch;

  constructor(connection:WebDavConnection,fetcher:typeof fetch=fetch){
    const error=validateWebDavConnection(connection);if(error)throw new SyncRequestError(error,400);
    this.connection=normalizeWebDavConnection(connection);this.fetcher=fetcher;
  }

  async load(_documentId:string):Promise<CloudScheduleSnapshot|null>{
    const value=await jsonRequest<{snapshot:CloudScheduleSnapshot|null}>(this.fetcher,"/api/sync/webdav",{
      method:"POST",body:JSON.stringify({action:"load",connection:this.connection}),
    });
    return value.snapshot;
  }


  async loadRevision(documentId:string):Promise<CloudRevisionSnapshot|null>{
    const value=await jsonRequest<{revision:CloudRevisionSnapshot|null}>(this.fetcher,"/api/sync/webdav",{
      method:"POST",body:JSON.stringify({action:"revision",connection:this.connection,documentId}),
    });
    return value.revision;
  }

  async save(document:ScheduleDocument,expectedServerRevision:CloudRevision|null):Promise<CloudScheduleSnapshot>{
    if(expectedServerRevision!==null&&typeof expectedServerRevision!=="string")throw new SyncRequestError("invalid_revision",400);
    const value=await jsonRequest<{snapshot:CloudScheduleSnapshot}>(this.fetcher,"/api/sync/webdav",{
      method:"POST",body:JSON.stringify({action:"save",connection:this.connection,document,expectedServerRevision}),
    });
    return value.snapshot;
  }
}
