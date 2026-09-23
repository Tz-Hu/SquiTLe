import { and, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { syncDocuments, syncTimelines } from "@/db/schema";
import { CURRENT_DATA_VERSION, isScheduleDocument } from "@/lib/persistence/persistence";

export const dynamic = "force-dynamic";
const JSON_HEADERS = { "cache-control": "no-store" };
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const unauthorized = () => Response.json({ error: "sign_in_required" }, { status: 401, headers: JSON_HEADERS });

async function snapshotFor(userId:string,documentId:string){
  const [row]=await getDb().select().from(syncTimelines).where(and(eq(syncTimelines.userId,userId),eq(syncTimelines.documentId,documentId))).limit(1);
  if(row)return {documentId:row.documentId,serverRevision:row.serverRevision,updatedAt:row.updatedAt,document:JSON.parse(row.documentJson)};
  const [legacy]=await getDb().select().from(syncDocuments).where(and(eq(syncDocuments.userId,userId),eq(syncDocuments.documentId,documentId))).limit(1);
  return legacy?{documentId:legacy.documentId,serverRevision:legacy.serverRevision,updatedAt:legacy.updatedAt,document:JSON.parse(legacy.documentJson)}:null;
}

async function revisionFor(userId:string,documentId:string){
  const [row]=await getDb().select({documentId:syncTimelines.documentId,serverRevision:syncTimelines.serverRevision,updatedAt:syncTimelines.updatedAt}).from(syncTimelines).where(and(eq(syncTimelines.userId,userId),eq(syncTimelines.documentId,documentId))).limit(1);
  if(row)return row;
  const [legacy]=await getDb().select({documentId:syncDocuments.documentId,serverRevision:syncDocuments.serverRevision,updatedAt:syncDocuments.updatedAt}).from(syncDocuments).where(and(eq(syncDocuments.userId,userId),eq(syncDocuments.documentId,documentId))).limit(1);
  return legacy??null;
}

export async function GET(request:Request){
  const user=await getChatGPTUser();if(!user)return unauthorized();
  const params=new URL(request.url).searchParams,documentId=params.get("documentId")??"";
  if(!documentId)return Response.json({error:"document_id_required"},{status:400,headers:JSON_HEADERS});
  try{return params.get("metadata")==="1"
    ?Response.json({revision:await revisionFor(user.userId,documentId)},{headers:JSON_HEADERS})
    :Response.json({snapshot:await snapshotFor(user.userId,documentId)},{headers:JSON_HEADERS});}
  catch(error){console.error("Squitle sync load failed",error);return Response.json({error:"cloud_unavailable"},{status:503,headers:JSON_HEADERS});}
}

export async function PUT(request:Request){
  const user=await getChatGPTUser();if(!user)return unauthorized();
  const declaredLength=Number(request.headers.get("content-length")??0);
  if(declaredLength>MAX_DOCUMENT_BYTES)return Response.json({error:"document_too_large"},{status:413,headers:JSON_HEADERS});
  let body:unknown;
  try{const text=await request.text();if(new TextEncoder().encode(text).byteLength>MAX_DOCUMENT_BYTES)throw new Error("too_large");body=JSON.parse(text);}
  catch(error){const status=error instanceof Error&&error.message==="too_large"?413:400;return Response.json({error:status===413?"document_too_large":"invalid_request"},{status,headers:JSON_HEADERS});}
  const value=body as {document?:unknown;expectedServerRevision?:unknown};
  if(!isScheduleDocument(value.document)||value.document.schemaVersion>CURRENT_DATA_VERSION||!(value.expectedServerRevision===null||(Number.isInteger(value.expectedServerRevision)&&Number(value.expectedServerRevision)>=0)))return Response.json({error:"invalid_document"},{status:400,headers:JSON_HEADERS});
  const document=value.document,documentJson=JSON.stringify(document),updatedAt=new Date().toISOString(),expected=value.expectedServerRevision as number|null,db=getDb(),title=(document.title?.trim()||"我的 TimeLine").slice(0,80);
  try{
    const existing=expected===null?null:await snapshotFor(user.userId,document.documentId);
    const result=expected!==null&&existing?.serverRevision===expected&&!(await db.select({documentId:syncTimelines.documentId}).from(syncTimelines).where(and(eq(syncTimelines.userId,user.userId),eq(syncTimelines.documentId,document.documentId))).limit(1)).length
      ?await db.insert(syncTimelines).values({userId:user.userId,documentId:document.documentId,title,serverRevision:expected+1,documentJson,updatedAt}).onConflictDoNothing().run()
      :expected===null
      ?await db.insert(syncTimelines).values({userId:user.userId,documentId:document.documentId,title,serverRevision:1,documentJson,updatedAt}).onConflictDoNothing().run()
      :await db.update(syncTimelines).set({title,serverRevision:sql`${syncTimelines.serverRevision} + 1`,documentJson,updatedAt}).where(and(eq(syncTimelines.userId,user.userId),eq(syncTimelines.documentId,document.documentId),eq(syncTimelines.serverRevision,expected))).run();
    if((result.meta.changes??0)!==1)return Response.json({error:"revision_conflict",snapshot:await snapshotFor(user.userId,document.documentId)},{status:409,headers:JSON_HEADERS});
    return Response.json({snapshot:await snapshotFor(user.userId,document.documentId)},{headers:JSON_HEADERS});
  }catch(error){console.error("Squitle sync save failed",error);return Response.json({error:"cloud_unavailable"},{status:503,headers:JSON_HEADERS});}
}
