"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {HoverCard,HoverCardTrigger,HoverCardContent} from "@/components/ui/hover-card";
import {useLocale} from "@/components/providers/locale-provider";
import type {InboxItem} from "@/lib/domain/inbox";
import type {Task,TaskType} from "@/lib/domain/schedule";
import {completedLast} from "@/lib/domain/daily-agenda";

export function DailyAgenda({dates,width,tasks,inbox,colors,onLocate,onComplete,onReturn,onDrop,dragging}:{
 dates:string[];width:number;tasks:Task[];inbox:InboxItem[];colors:Record<TaskType,string>;
 onLocate:(task:Task)=>void;onComplete:(id:string,done:boolean)=>void;onReturn:(id:string)=>void;
 onDrop:(date:string)=>void;dragging:boolean;
}){
 const {t}=useLocale();
 const agendaByDate=useMemo(()=>new Map(dates.map(date=>{
   const scheduled=tasks.filter(task=>task.start<=date&&task.end>=date);
   const entries=inbox.filter(item=>item.date===date);
   const items=completedLast([
     ...entries.map(item=>({kind:"inbox" as const,id:item.id,completed:item.done,item})),
     ...scheduled.map(task=>({kind:"task" as const,id:task.id,completed:task.status==="已完成",task})),
   ]);
   return [date,{scheduled,entries,items}] as const;
 })),[dates,tasks,inbox]);
 const [activeDate,setActiveDate]=useState<string|null>(null);
 const [open,setOpen]=useState(false);
 const openTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clearTimers=()=>{if(openTimer.current)clearTimeout(openTimer.current);if(closeTimer.current)clearTimeout(closeTimer.current);openTimer.current=null;closeTimer.current=null;};
 const activate=(date:string,immediate=false)=>{
   clearTimers();setActiveDate(date);
   if(immediate)setOpen(true);
   else openTimer.current=setTimeout(()=>{openTimer.current=null;setOpen(true);},120);
 };
 const scheduleClose=()=>{
   if(openTimer.current){clearTimeout(openTimer.current);openTimer.current=null;}
   if(closeTimer.current)clearTimeout(closeTimer.current);
   closeTimer.current=setTimeout(()=>{closeTimer.current=null;setOpen(false);setActiveDate(null);},180);
 };
 useEffect(()=>()=>clearTimers(),[]);
 const active=activeDate?agendaByDate.get(activeDate):undefined;
 return <HoverCard open={open} onOpenChange={next=>{if(!next)scheduleClose();}}>
   <div className="daily-agenda">{dates.map(date=>{
     const agenda=agendaByDate.get(date)!;
     const count=agenda.items.length;
     const cell=<button className="daily-cell" style={{width}} aria-label={t("{0}：{1} 项待办",date,count)} aria-expanded={activeDate===date&&open}
       onMouseEnter={()=>activate(date)} onMouseLeave={scheduleClose} onFocus={()=>activate(date,true)} onBlur={scheduleClose}
       onDragOver={event=>{if(dragging){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="link";}}} onDrop={event=>{if(dragging){event.preventDefault();event.stopPropagation();onDrop(date);}}}>
       {agenda.entries.map(item=><span key={item.id} className="daily-dot" data-done={item.done} style={{background:Object.values(colors)[0]}}/>)}
       {agenda.scheduled.map(task=><span key={task.id} className="daily-dot" data-done={task.status==="已完成"} style={{background:colors[task.type]}}/>)}
     </button>;
     return activeDate===date?<HoverCardTrigger key={date} asChild>{cell}</HoverCardTrigger>:<span key={date} className="daily-cell-anchor">{cell}</span>;
   })}</div>
   {activeDate&&active&&<HoverCardContent className="daily-card" side="bottom" align="start" collisionPadding={16} onMouseEnter={clearTimers} onMouseLeave={scheduleClose} onFocusCapture={clearTimers} onBlurCapture={scheduleClose} onEscapeKeyDown={()=>{clearTimers();setOpen(false);setActiveDate(null);}}>
     <div className="daily-card-heading"><strong>{activeDate}</strong><span className="meta">{t("当日共 {0} 项",active.items.length)}</span></div>
     {!active.items.length&&<p className="meta">{t("当日暂无待办")}</p>}
     {active.items.map(row=>row.kind==="inbox"?<div key={`inbox-${row.id}`} className="daily-entry" data-completed={row.completed||undefined}><input type="checkbox" checked={row.item.done} aria-label={t("完成条目：{0}",t(row.item.text))} onChange={event=>onComplete(row.item.id,event.target.checked)}/><span className="daily-entry-title">{t(row.item.text)}</span><button className="meta" onClick={()=>onReturn(row.item.id)}>{t("取消日期")}</button></div>:<button key={`task-${row.id}`} className="daily-entry daily-task" data-completed={row.completed||undefined} onClick={()=>onLocate(row.task)}><span className="daily-dot" style={{background:colors[row.task.type]}}/><span className="daily-entry-title">{t(row.task.title)}</span><span className="meta">{t(row.task.status)}</span></button>)}
   </HoverCardContent>}
 </HoverCard>;
}
