import {getChatGPTUser} from "@/app/chatgpt-auth";
import type {CloudScheduleSnapshot} from "@/lib/sync/cloud-sync";
import {CURRENT_DATA_VERSION,isScheduleDocument,type ScheduleDocument} from "@/lib/persistence/persistence";
import {normalizeWebDavConnection,validateWebDavConnection,type WebDavConnection} from "@/lib/sync/webdav-sync";

export const dynamic="force-dynamic";
const JSON_HEADERS={"cache-control":"no-store"};
const MAX_DOCUMENT_BYTES=4*1024*1024;

const responseError=(error:string,status:number)=>Response.json({error},{status,headers:JSON_HEADERS});

function basicAuthorization(username:string,password:string){
  const bytes=new TextEncoder().encode(`${username}:${password}`);
  let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

async function requestWebDav(connection:WebDavConnection,init:RequestInit){
  const response=await fetch(connection.url,{
    ...init,
    redirect:"manual",
    headers:{authorization:basicAuthorization(connection.username,connection.password),...(init.headers??{})},
  });
  if(response.status>=300&&response.status<400)throw new Error("webdav_redirect_not_allowed");
  return response;
}

function revisionFrom(response:Response){
  const etag=response.headers.get("etag");if(etag)return `etag:${etag}`;
  const modified=response.headers.get("last-modified");if(modified)return `last-modified:${modified}`;
  return null;
}

async function loadSnapshot(connection:WebDavConnection):Promise<CloudScheduleSnapshot|null>{
  const response=await requestWebDav(connection,{method:"GET",headers:{accept:"application/json"}});
  if(response.status===404)return null;
  if(response.status===401||response.status===403)throw new Error("webdav_auth_failed");
  if(!response.ok)throw new Error("webdav_unavailable");
  const declaredLength=Number(response.headers.get("content-length")??0);
  if(declaredLength>MAX_DOCUMENT_BYTES)throw new Error("document_too_large");
  const text=await response.text();
  if(new TextEncoder().encode(text).byteLength>MAX_DOCUMENT_BYTES)throw new Error("document_too_large");
  let document:unknown;try{document=JSON.parse(text);}catch{throw new Error("webdav_invalid_document");}
  if(!isScheduleDocument(document)||document.schemaVersion>CURRENT_DATA_VERSION)throw new Error("webdav_invalid_document");
  const serverRevision=revisionFrom(response);if(!serverRevision)throw new Error("webdav_version_unavailable");
  return {documentId:document.documentId,serverRevision,updatedAt:document.updatedAt,document};
}

async function loadRevision(connection:WebDavConnection,documentId:string){
  let response=await requestWebDav(connection,{method:"HEAD"});
  if(response.status===405||response.status===501)response=await requestWebDav(connection,{method:"GET",headers:{accept:"application/json"}});
  if(response.status===404)return null;
  if(response.status===401||response.status===403)throw new Error("webdav_auth_failed");
  if(!response.ok)throw new Error("webdav_unavailable");
  const serverRevision=revisionFrom(response);if(!serverRevision)throw new Error("webdav_version_unavailable");
  return {documentId,serverRevision,updatedAt:response.headers.get("last-modified")??new Date().toISOString()};
}

function statusFor(error:unknown){
  const code=error instanceof Error?error.message:"webdav_unavailable";
  if(code==="document_too_large")return {code,status:413};
  if(code==="webdav_auth_failed"||code==="webdav_invalid_document"||code==="webdav_version_unavailable")return {code,status:422};
  if(code==="webdav_redirect_not_allowed")return {code,status:400};
  return {code:"webdav_unavailable",status:502};
}

export async function POST(request:Request){
  if(!await getChatGPTUser())return responseError("sign_in_required",401);
  let body:{action?:unknown;connection?:unknown;documentId?:unknown;document?:unknown;expectedServerRevision?:unknown};
  try{body=await request.json();}catch{return responseError("invalid_request",400);}
  const connection=body.connection as WebDavConnection;
  const validation=validateWebDavConnection(connection);if(validation)return responseError(validation,400);
  const normalized=normalizeWebDavConnection(connection);
  try{
    if(body.action==="load")return Response.json({snapshot:await loadSnapshot(normalized)},{headers:JSON_HEADERS});
    if(body.action==="revision"&&typeof body.documentId==="string")return Response.json({revision:await loadRevision(normalized,body.documentId)},{headers:JSON_HEADERS});
    if(body.action!=="save"||!isScheduleDocument(body.document)||body.document.schemaVersion>CURRENT_DATA_VERSION)return responseError("invalid_request",400);
    const expected=body.expectedServerRevision;
    if(expected!==null&&typeof expected!=="string")return responseError("invalid_revision",400);
    const headers:Record<string,string>={"content-type":"application/json"};
    if(expected===null)headers["if-none-match"]="*";
    else if(expected.startsWith("etag:"))headers["if-match"]=expected.slice(5);
    else if(expected.startsWith("last-modified:"))headers["if-unmodified-since"]=expected.slice(14);
    else return responseError("invalid_revision",400);
    const contents=JSON.stringify(body.document as ScheduleDocument);
    if(new TextEncoder().encode(contents).byteLength>MAX_DOCUMENT_BYTES)return responseError("document_too_large",413);
    const saved=await requestWebDav(normalized,{method:"PUT",headers,body:contents});
    if(saved.status===409||saved.status===412)return responseError("revision_conflict",409);
    if(saved.status===401||saved.status===403)throw new Error("webdav_auth_failed");
    if(!saved.ok)throw new Error("webdav_unavailable");
    const snapshot=await loadSnapshot(normalized);
    if(!snapshot)throw new Error("webdav_unavailable");
    return Response.json({snapshot},{headers:JSON_HEADERS});
  }catch(error){const failure=statusFor(error);return responseError(failure.code,failure.status);}
}
