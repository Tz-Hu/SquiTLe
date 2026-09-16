export type InboxKind = "checklist" | "numbered" | "bullet";
export type InboxUrgency = "none" | "low" | "medium" | "high";
export type InboxSort = "manual" | "urgency" | "date";
export type InboxTaskStatus="未开始"|"进行中"|"已完成";
export type InboxTimeTone="normal"|"orange"|"red";
export type InboxItem = {id:string; text:string; kind:InboxKind; done:boolean; urgency:InboxUrgency; date?:string; endDate?:string; taskId?:string; status?:InboxTaskStatus; unclassified?:boolean};
export const inboxKinds:InboxKind[] = ["checklist","numbered","bullet"];
export const inboxUrgencies:InboxUrgency[] = ["none","low","medium","high"];
const urgencyRank:Record<InboxUrgency,number>={none:0,low:1,medium:2,high:3};
export const inboxUrgencyCount=(urgency:InboxUrgency)=>urgencyRank[urgency];
export function extractInboxUrgency(text:string):{text:string;urgency:InboxUrgency}{
  const count=Math.min(3,(text.match(/[!！]/g)??[]).length);
  const urgency:InboxUrgency=count===3?"high":count===2?"medium":count===1?"low":"none";
  return {text:text.replace(/[!！]/g,"").replace(/\s{2,}/g," ").trim(),urgency};
}
export function parseInboxInput(text:string, fallback:InboxKind):{text:string;kind:InboxKind} {
  const match=text.match(/^(\d+\. |\- |\[\] |【】 )/);
  if(!match)return {text,kind:fallback};
  return {text:text.slice(match[0].length),kind:/^\d/.test(match[0])?"numbered":match[0]==="- "?"bullet":"checklist"};
}
export function restoreInbox(value:unknown):InboxItem[]{
  if(!Array.isArray(value))return [];
  return value.flatMap(raw=>{
    if(!raw||typeof raw!=="object")return [];
    const item=raw as Partial<InboxItem>;
    if(typeof item.id!=="string"||typeof item.text!=="string"||!item.kind||!inboxKinds.includes(item.kind)||typeof item.done!=="boolean")return [];
    const urgency=item.urgency&&inboxUrgencies.includes(item.urgency)?item.urgency:"none";
    const date=typeof item.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(item.date)?item.date:undefined;
    return [{id:item.id,text:item.text,kind:item.kind,done:item.done,urgency,...(date?{date}:{})}];
  });
}
export function sortInboxItems(items:InboxItem[],sort:InboxSort):InboxItem[]{
  return items.map((item,index)=>({item,index})).sort((a,b)=>{
    const completed=Number(a.item.done)-Number(b.item.done);
    if(completed)return completed;
    if(sort==="urgency"){
      const urgency=urgencyRank[b.item.urgency]-urgencyRank[a.item.urgency];
      if(urgency)return urgency;
      const date=(a.item.date??"9999-99-99").localeCompare(b.item.date??"9999-99-99");
      if(date)return date;
    }
    if(sort==="date"){
      const date=(a.item.date??"9999-99-99").localeCompare(b.item.date??"9999-99-99");
      if(date)return date;
      const urgency=urgencyRank[b.item.urgency]-urgencyRank[a.item.urgency];
      if(urgency)return urgency;
    }
    return a.index-b.index;
  }).map(entry=>entry.item);
}
export const isInboxItemOverdue=(item:InboxItem,today:string)=>!item.done&&!!item.date&&(item.endDate??item.date)<today;
const epochDay=(date:string)=>Math.floor(Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7))-1,Number(date.slice(8,10)))/86400000);
export function inboxTimeTone(item:InboxItem,today:string):InboxTimeTone{
  if(item.done||item.status==="已完成"||!item.date)return "normal";
  const end=item.endDate??item.date;
  if(end<today)return "red";
  const startDay=epochDay(item.date),endDay=epochDay(end),todayDay=epochDay(today);
  const total=Math.max(1,endDay-startDay+1),remaining=todayDay<startDay?total:Math.max(0,endDay-todayDay+1);
  const percent=remaining/total*100;
  const status=item.status??(today<item.date?"未开始":"进行中");
  if(status==="未开始")return percent<50?"red":percent<=75?"orange":"normal";
  if(status==="进行中")return percent<25?"red":percent<=50?"orange":"normal";
  return "normal";
}
