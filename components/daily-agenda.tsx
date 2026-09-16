"use client";
import {HoverCard,HoverCardTrigger,HoverCardContent} from "@/components/ui/hover-card";
import {useLocale} from "@/components/locale-provider";
import type {InboxItem} from "@/lib/inbox";
import type {Task,TaskType} from "@/lib/schedule";

export function DailyAgenda({dates,width,tasks,inbox,colors,onTask,onComplete,onReturn,onDrop,dragging}:{
 dates:string[];width:number;tasks:Task[];inbox:InboxItem[];colors:Record<TaskType,string>;
 onTask:(task:Task)=>void;onComplete:(id:string,done:boolean)=>void;onReturn:(id:string)=>void;
 onDrop:(date:string)=>void;dragging:boolean;
}){
 const {t}=useLocale();
 return <div className="daily-agenda">{dates.map(date=>{
   const scheduled=tasks.filter(task=>task.start<=date&&task.end>=date);
   const entries=inbox.filter(item=>item.date===date);
   return <HoverCard key={date} openDelay={120} closeDelay={180}><HoverCardTrigger asChild>
     <button className="daily-cell" style={{width}} aria-label={t("{0}：{1} 项待办",date,scheduled.length+entries.length)} onDragOver={event=>{if(dragging){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="link";}}} onDrop={event=>{if(dragging){event.preventDefault();event.stopPropagation();onDrop(date);}}}>
       {entries.map(item=><span key={item.id} className="daily-dot" data-done={item.done} style={{background:Object.values(colors)[0]}}/>)}
       {scheduled.map(task=><span key={task.id} className="daily-dot" data-done={task.status==="已完成"} style={{background:colors[task.type]}}/>)}
     </button>
   </HoverCardTrigger><HoverCardContent className="daily-card" side="bottom" align="start" collisionPadding={16}>
     <strong>{date}</strong>
     {!entries.length&&!scheduled.length&&<p className="meta">{t("当日暂无待办")}</p>}
     {entries.length>0&&<div className="meta">TodoList</div>}
     {entries.map(item=><div key={item.id} className="daily-entry"><input type="checkbox" checked={item.done} aria-label={t("完成条目：{0}",t(item.text))} onChange={event=>onComplete(item.id,event.target.checked)}/><span style={{textDecoration:item.done?"line-through":undefined}}>{t(item.text)}</span><button className="meta" onClick={()=>onReturn(item.id)}>{t("取消日期")}</button></div>)}
     {scheduled.length>0&&<div className="meta">{t("项目事项")}</div>}
     {scheduled.map(task=><button key={task.id} className="daily-entry daily-task" onClick={()=>onTask(task)}><span className="daily-dot" style={{background:colors[task.type]}}/><span>{t(task.title)}</span><span className="meta">{t(task.status)}</span></button>)}
   </HoverCardContent></HoverCard>;
 })}</div>;
}
