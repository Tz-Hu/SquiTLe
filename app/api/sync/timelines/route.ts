import {and,desc,eq,sql} from "drizzle-orm";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import {getDb} from "@/db";
import {syncDocuments,syncTimelines} from "@/db/schema";

export const dynamic="force-dynamic";
const JSON_HEADERS={"cache-control":"no-store"};
export async function GET(){
  const user=await getChatGPTUser();
  if(!user)return Response.json({error:"sign_in_required"},{status:401,headers:JSON_HEADERS});
  try{
    const db=getDb(),timelines=await db.select({documentId:syncTimelines.documentId,title:syncTimelines.title,updatedAt:syncTimelines.updatedAt}).from(syncTimelines).where(eq(syncTimelines.userId,user.userId)).orderBy(desc(syncTimelines.updatedAt));
    const [legacy]=await db.select().from(syncDocuments).where(eq(syncDocuments.userId,user.userId)).limit(1);
    if(legacy&&!timelines.some(item=>item.documentId===legacy.documentId)){let title="我的 TimeLine";try{title=JSON.parse(legacy.documentJson)?.title||title;}catch{}timelines.push({documentId:legacy.documentId,title,updatedAt:legacy.updatedAt});}
    return Response.json({timelines},{headers:JSON_HEADERS});
  }
  catch(error){console.error("Squitle timeline list failed",error);return Response.json({error:"cloud_unavailable"},{status:503,headers:JSON_HEADERS});}
}

async function requestValue(request:Request){
  try{return await request.json() as {documentId?:unknown;title?:unknown};}catch{return null;}
}

export async function PATCH(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"sign_in_required"},{status:401,headers:JSON_HEADERS});
  const value=await requestValue(request),documentId=typeof value?.documentId==="string"?value.documentId:"",title=typeof value?.title==="string"?value.title.trim():"";
  if(!documentId||documentId.length>128||!title||title.length>80)return Response.json({error:"invalid_request"},{status:400,headers:JSON_HEADERS});
  try{
    const db=getDb(),[row]=await db.select().from(syncTimelines).where(and(eq(syncTimelines.userId,user.userId),eq(syncTimelines.documentId,documentId))).limit(1),updatedAt=new Date().toISOString();
    if(row){const document=JSON.parse(row.documentJson);document.title=title;await db.update(syncTimelines).set({title,documentJson:JSON.stringify(document),serverRevision:sql`${syncTimelines.serverRevision} + 1`,updatedAt}).where(and(eq(syncTimelines.userId,user.userId),eq(syncTimelines.documentId,documentId))).run();return Response.json({timeline:{documentId,title,updatedAt}},{headers:JSON_HEADERS});}
    const [legacy]=await db.select().from(syncDocuments).where(and(eq(syncDocuments.userId,user.userId),eq(syncDocuments.documentId,documentId))).limit(1);
    if(!legacy)return Response.json({error:"timeline_not_found"},{status:404,headers:JSON_HEADERS});
    const document=JSON.parse(legacy.documentJson);document.title=title;await db.insert(syncTimelines).values({userId:user.userId,documentId,title,serverRevision:legacy.serverRevision+1,documentJson:JSON.stringify(document),updatedAt}).run();
    return Response.json({timeline:{documentId,title,updatedAt}},{headers:JSON_HEADERS});
  }catch(error){console.error("Squitle timeline rename failed",error);return Response.json({error:"cloud_unavailable"},{status:503,headers:JSON_HEADERS});}
}

export async function DELETE(request:Request){
  const user=await getChatGPTUser();if(!user)return Response.json({error:"sign_in_required"},{status:401,headers:JSON_HEADERS});
  const value=await requestValue(request),documentId=typeof value?.documentId==="string"?value.documentId:"";
  if(!documentId||documentId.length>128)return Response.json({error:"invalid_request"},{status:400,headers:JSON_HEADERS});
  try{
    const db=getDb(),rows=await db.select({documentId:syncTimelines.documentId}).from(syncTimelines).where(eq(syncTimelines.userId,user.userId)),[legacy]=await db.select({documentId:syncDocuments.documentId}).from(syncDocuments).where(eq(syncDocuments.userId,user.userId)).limit(1),ids=new Set(rows.map(item=>item.documentId));if(legacy)ids.add(legacy.documentId);
    if(!ids.has(documentId))return Response.json({deleted:true},{headers:JSON_HEADERS});
    if(ids.size<=1)return Response.json({error:"last_timeline"},{status:409,headers:JSON_HEADERS});
    await db.delete(syncTimelines).where(and(eq(syncTimelines.userId,user.userId),eq(syncTimelines.documentId,documentId))).run();
    await db.delete(syncDocuments).where(and(eq(syncDocuments.userId,user.userId),eq(syncDocuments.documentId,documentId))).run();
    return Response.json({deleted:true},{headers:JSON_HEADERS});
  }catch(error){console.error("Squitle timeline delete failed",error);return Response.json({error:"cloud_unavailable"},{status:503,headers:JSON_HEADERS});}
}
