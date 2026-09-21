"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {AlertTriangle,ArrowUpDown,ChevronDown,CircleHelp,GripVertical,ListTodo,Plus,X} from "lucide-react";
import {useLocale} from "@/components/providers/locale-provider";
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from "@/components/ui/tooltip";
import {extractInboxUrgency,inboxTimeTone,inboxUrgencyCount,isInboxItemOverdue,parseInboxInput,sortInboxItems,type InboxItem,type InboxKind,type InboxSort} from "@/lib/domain/inbox";

export function InboxPanel({items,defaultKind,sort,collapsed,title,size,completedVisibility,onCollapse,onChange,onDelete,onUndoDelete,onSortChange,onDrag,onSizeChange}: {
  items:InboxItem[];defaultKind:InboxKind;sort:InboxSort;collapsed:boolean;onCollapse:(value:boolean)=>void;
  title:string;size:{width:number;height:number};completedVisibility:"show"|"hide";onSortChange:(value:InboxSort)=>void;
  onChange:(items:InboxItem[])=>void;onDelete:(item:InboxItem)=>void;onUndoDelete:()=>void;onDrag:(id:string|null)=>void;onSizeChange:(size:{width:number;height:number})=>void;
}) {
  const {t}=useLocale();
  const [draft,setDraft]=useState<{id?:string;text:string;kind:InboxKind}|null>(null);
  const [pendingDelete,setPendingDelete]=useState<string|null>(null);
  const [undoSeconds,setUndoSeconds]=useState(0);
  const input=useRef<HTMLInputElement>(null);
  const composing=useRef(false);
  const cancelDraft=useRef(false);
  const resizeGesture=useRef<{pointerId:number;startX:number;startY:number;width:number;height:number}|null>(null);
  const deleteTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const undoTimer=useRef<ReturnType<typeof setInterval>|null>(null);
  const start=()=>{if(!draft)setDraft({text:"",kind:defaultKind});requestAnimationFrame(()=>input.current?.focus());};
  const save=()=>{
    if(!draft)return;
    const parsed=parseInboxInput(draft.text,draft.kind),extracted=extractInboxUrgency(parsed.text),text=extracted.text;
    if(text)onChange(draft.id?items.map(item=>item.id===draft.id?{...item,text,kind:parsed.kind,urgency:extracted.urgency}:item):[...items,{id:crypto.randomUUID(),text,kind:parsed.kind,done:false,urgency:extracted.urgency}]);
    setDraft(null);
  };
  const editor=<div className="inbox-editor"><span aria-hidden="true">{draft?.kind==="numbered"?"1.":draft?.kind==="bullet"?"•":"○"}</span><input ref={input} autoFocus value={draft?.text??""} aria-label={t("条目内容")} placeholder={t("格式：1.「空格」 / -「空格」 / []「空格」")} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={event=>{composing.current=false;const text=event.currentTarget.value;setDraft(current=>current?{...current,...parseInboxInput(text,current.kind)}:null);}} onChange={event=>{const text=event.target.value;setDraft(current=>current?{...current,...(composing.current?{text}:parseInboxInput(text,current.kind))}:null);}} onBlur={()=>{if(cancelDraft.current){cancelDraft.current=false;return;}save();}} onKeyDown={event=>{if(event.nativeEvent.isComposing||composing.current)return;if(event.key==="Enter"){event.preventDefault();save();}if(event.key==="Escape"){event.stopPropagation();setDraft(null);}}}/><Tooltip><TooltipTrigger asChild><button type="button" className="inbox-editor-info" aria-label={t("条目输入格式提示")} onPointerDown={event=>event.preventDefault()}><CircleHelp size={15}/></button></TooltipTrigger><TooltipContent>{t("1.「空格」= 编号；-「空格」= 圆点；[]「空格」或【】「空格」= 勾选；1–3 个 ! = 优先级。")}</TooltipContent></Tooltip><button aria-label={t("取消")} onPointerDown={()=>{cancelDraft.current=true;}} onClick={()=>setDraft(null)}><X size={14}/></button></div>;
  useEffect(()=>()=>{if(deleteTimer.current)clearTimeout(deleteTimer.current);if(undoTimer.current)clearInterval(undoTimer.current);},[]);
  const today=useMemo(()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;},[]);
  const visible=sortInboxItems(items,sort).filter(item=>completedVisibility==="show"||!item.done);
  const resizeMove=(event:React.PointerEvent<HTMLButtonElement>)=>{
    const gesture=resizeGesture.current;if(!gesture||gesture.pointerId!==event.pointerId)return;
    event.preventDefault();
    const maxWidth=Math.min(720,window.innerWidth-32),maxHeight=Math.min(720,window.innerHeight-128);
    const minWidth=Math.min(260,maxWidth),minHeight=Math.min(160,maxHeight);
    onSizeChange({width:Math.max(minWidth,Math.min(maxWidth,gesture.width+gesture.startX-event.clientX)),height:Math.max(minHeight,Math.min(maxHeight,gesture.height+gesture.startY-event.clientY))});
  };
  const resizeEnd=(event:React.PointerEvent<HTMLButtonElement>)=>{if(resizeGesture.current?.pointerId===event.pointerId)resizeGesture.current=null;};
  const requestDelete=(item:InboxItem)=>{
    if(pendingDelete!==item.id){
      setPendingDelete(item.id);if(deleteTimer.current)clearTimeout(deleteTimer.current);
      deleteTimer.current=setTimeout(()=>setPendingDelete(current=>current===item.id?null:current),2400);return;
    }
    if(deleteTimer.current)clearTimeout(deleteTimer.current);setPendingDelete(null);onDelete(item);
    if(undoTimer.current)clearInterval(undoTimer.current);
    const until=Date.now()+3000;setUndoSeconds(3);
    undoTimer.current=setInterval(()=>{const seconds=Math.ceil((until-Date.now())/1000);if(seconds<=0){if(undoTimer.current)clearInterval(undoTimer.current);undoTimer.current=null;setUndoSeconds(0);}else setUndoSeconds(seconds);},100);
  };
  const undoDelete=()=>{if(undoTimer.current)clearInterval(undoTimer.current);undoTimer.current=null;setUndoSeconds(0);onUndoDelete();};
  let number=0;
  return <TooltipProvider><aside className="inbox-panel" data-collapsed={collapsed} aria-label={title} style={{width:size.width,height:collapsed?undefined:size.height}} onClick={event=>event.stopPropagation()}>
    <button className="inbox-resize-handle" aria-hidden={collapsed} tabIndex={collapsed?-1:0} aria-label={t("拖动调整 TodoList 大小")} title={t("拖动调整 TodoList 大小")} onPointerDown={event=>{if(collapsed)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);resizeGesture.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,width:size.width,height:size.height};}} onPointerMove={resizeMove} onPointerUp={resizeEnd} onPointerCancel={resizeEnd}/>
    <header title={t("双击折叠或展开")} onDoubleClick={event=>{if((event.target as Element).closest("button"))return;onCollapse(!collapsed);}}><ListTodo size={16}/><strong title={title}>{title}</strong><span className="meta">{items.length}</span><button className="inbox-collapse" aria-label={collapsed?t("展开 TodoList"):t("收起 TodoList")} aria-expanded={!collapsed} onClick={()=>onCollapse(!collapsed)}><ChevronDown size={16}/></button></header>
    <div className="inbox-content" aria-hidden={collapsed} inert={collapsed}><div className="inbox-sortbar"><ArrowUpDown size={13}/><label><span>{t("排序")}</span><select tabIndex={collapsed?-1:0} value={sort} onChange={event=>onSortChange(event.target.value as InboxSort)}><option value="manual">{t("原顺序")}</option><option value="urgency">{t("按紧急程度")}</option><option value="date">{t("按日期早晚")}</option></select></label></div><div className="inbox-items" onDoubleClick={event=>{if(!(event.target as Element).closest("[data-inbox-item],button,input,select"))start();}}>
      {!items.length&&!draft&&<p className="inbox-empty">{t("先记下来，再拖到时间表安排。")}</p>}
      <ul>{visible.map(item=>{if(item.kind==="numbered")number++;const overdue=isInboxItemOverdue(item,today),timeTone=inboxTimeTone(item,today);return <li key={item.id} data-inbox-item data-done={item.done} data-overdue={overdue} data-time-tone={timeTone} data-urgency={item.urgency}>
        {draft?.id===item.id?editor:<><span className="inbox-priority" data-level={inboxUrgencyCount(item.urgency)} aria-label={t("紧急程度：{0}",inboxUrgencyCount(item.urgency))}>{"!".repeat(inboxUrgencyCount(item.urgency))}</span><button className="inbox-grip" draggable aria-label={t("试试拖到上面的 TimeLine！")} title={t("试试拖到上面的 TimeLine！")} onDragStart={event=>{event.dataTransfer.setData("application/x-timeline-inbox",item.id);event.dataTransfer.effectAllowed="link";onDrag(item.id);}} onDragEnd={()=>onDrag(null)}><GripVertical size={14}/></button>
          {item.kind==="checklist"?<input type="checkbox" aria-label={t("完成条目：{0}",t(item.text))} checked={item.done} onChange={event=>onChange(items.map(entry=>entry.id===item.id?{...entry,done:event.target.checked}:entry))}/>:<span className="inbox-marker">{item.kind==="numbered"?`${number}.`:"•"}</span>}
          <button className="inbox-text" onDoubleClick={()=>setDraft({id:item.id,text:`${"!".repeat(inboxUrgencyCount(item.urgency))}${inboxUrgencyCount(item.urgency)?" ":""}${item.text}`,kind:item.kind})}>{t(item.text)}</button>
          <button className="inbox-delete" data-confirm={pendingDelete===item.id} aria-label={pendingDelete===item.id?t("再次点击确认删除"):t("删除条目：{0}",t(item.text))} title={pendingDelete===item.id?t("再次点击确认删除"):undefined} onClick={()=>requestDelete(item)}><X size={14}/></button>
          {item.date?<time className="inbox-date" dateTime={item.date} title={item.endDate&&item.endDate!==item.date?`${item.date} — ${item.endDate}`:item.date}>{item.date.slice(5)}{item.endDate&&item.endDate!==item.date?`–${item.endDate.slice(5)}`:""}</time>:null}
          {(item.unclassified||!item.taskId)&&<Tooltip><TooltipTrigger asChild><span className="inbox-unscheduled" role="img" tabIndex={0} aria-label={t("未分配")}><AlertTriangle size={14}/></span></TooltipTrigger><TooltipContent>{t("未分配：尚未安排到具体日期。")}</TooltipContent></Tooltip>}</>}
      </li>;})}</ul>
      {draft&&!draft.id&&editor}
    </div><div className="inbox-footer"><button className="inbox-add" tabIndex={collapsed?-1:0} onClick={start}><Plus size={14}/>{t("新建条目")}</button>{undoSeconds>0&&<button className="inbox-undo" tabIndex={collapsed?-1:0} onClick={undoDelete}>{t("撤回删除")}<span>{undoSeconds}s</span></button>}</div></div>
  </aside></TooltipProvider>;
}
