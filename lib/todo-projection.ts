import type {InboxItem} from "./inbox";
import type {Dependency,Task} from "./schedule";

export const taskTodoId=(taskId:string)=>`timeline:${taskId}`;

export function projectTasksToTodo(tasks:Task[]):InboxItem[]{
  return tasks.map(task=>({
    id:taskTodoId(task.id),taskId:task.id,text:task.title,kind:task.todoKind??"checklist",
    done:task.status==="已完成",urgency:task.urgency??"none",date:task.start,endDate:task.end,status:task.status,...(task.projectIds.length===0?{unclassified:true}:{}),
  }));
}

export function reconcileTodoList(tasks:Task[],edges:Dependency[],items:InboxItem[],today:string){
  const projections=new Map(items.filter(item=>item.taskId).map(item=>[item.taskId!,item]));
  const removed=new Set(tasks.filter(task=>!projections.has(task.id)).map(task=>task.id));
  const nextTasks=tasks.filter(task=>!removed.has(task.id)).map(task=>{
    const item=projections.get(task.id)!;
    const status=item.done?"已完成":task.end<today?"进行中":task.start>today?"未开始":"进行中";
    return {...task,title:item.text,urgency:item.urgency,todoKind:item.kind,status} as Task;
  });
  return {
    tasks:nextTasks,
    edges:edges.filter(edge=>!removed.has(edge.source.taskId)&&!removed.has(edge.target.taskId)),
    inbox:items.filter(item=>!item.taskId).map(({taskId:_,endDate:__,status:___,...item})=>item),
  };
}
