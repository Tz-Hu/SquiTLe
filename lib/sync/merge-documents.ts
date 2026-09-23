import {hasCycle,type Dependency,type Task,type TaskOutput} from "../domain/schedule.ts";
import {reconcileTracks,type TaskTrack} from "../domain/tracks.ts";
import {advanceScheduleDocument,migratePersistedState,type PersistedState,type ScheduleDocument} from "../persistence/persistence.ts";

type Project={id:string;name:string;color:string};
type InboxItem={id:string;text:string;date?:string;endDate?:string;taskId?:string;[key:string]:unknown};

export type DocumentMergeStats={totalTasks:number;addedTasks:number;deduplicatedTasks:number};
export type DocumentMergeResult={document:ScheduleDocument;stats:DocumentMergeStats};

const normalized=(value:unknown)=>typeof value==="string"?value.trim().toLocaleLowerCase():"";
const unique=<T>(values:T[])=>[...new Set(values)];
const newerDocument=(local:ScheduleDocument,remote:ScheduleDocument)=>Date.parse(remote.updatedAt)>Date.parse(local.updatedAt)?remote:local;
const taskKey=(task:Task)=>[normalized(task.title),task.start,task.end,task.milestone?"milestone":"task",normalized(task.type),normalized(task.memo)].join("\u001f");
const edgeKey=(edge:Dependency)=>[edge.source.taskId,edge.source.day,edge.source.side,edge.target.taskId,edge.target.day,edge.target.side].join("\u001f");
const inboxKey=(item:InboxItem)=>[normalized(item.text),item.date??"",item.endDate??"",item.taskId??""].join("\u001f");

function mergeOutputs(preferred:TaskOutput[]=[],other:TaskOutput[]=[],idMap:Map<string,string>){
  const result=preferred.map(output=>({...output}));
  const byId=new Map(result.map(output=>[output.id,output]));
  const byText=new Map(result.map(output=>[normalized(output.text),output]));
  for(const output of other){
    const existing=byId.get(output.id)??byText.get(normalized(output.text));
    if(existing){idMap.set(output.id,existing.id);continue;}
    const copy={...output};result.push(copy);byId.set(copy.id,copy);byText.set(normalized(copy.text),copy);idMap.set(output.id,copy.id);
  }
  return result;
}

export function mergeScheduleDocuments(
  localInput:ScheduleDocument,
  remoteInput:ScheduleDocument,
  deviceId:string,
  now:()=>Date=()=>new Date(),
):DocumentMergeResult{
  const local={...localInput,data:migratePersistedState(localInput.data)};
  const remote={...remoteInput,data:migratePersistedState(remoteInput.data)};
  const preferred=newerDocument(local,remote),other=preferred===local?remote:local;
  const preferredState=preferred.data as PersistedState,otherState=other.data as PersistedState;

  const projects=(preferredState.projects as Project[]).map(project=>({...project}));
  const projectIdMap=new Map<string,string>(projects.map(project=>[project.id,project.id]));
  const projectByName=new Map(projects.map(project=>[normalized(project.name),project]));
  for(const project of otherState.projects as Project[]){
    const existing=projects.find(item=>item.id===project.id)??projectByName.get(normalized(project.name));
    if(existing){projectIdMap.set(project.id,existing.id);continue;}
    const copy={...project};projects.push(copy);projectIdMap.set(copy.id,copy.id);projectByName.set(normalized(copy.name),copy);
  }

  const tasks=(preferredState.tasks as Task[]).map(task=>({...task,projectIds:[...task.projectIds],order:{...task.order},outputs:(task.outputs??[]).map(output=>({...output}))}));
  const taskIdMap=new Map<string,string>(tasks.map(task=>[task.id,task.id]));
  const taskByKey=new Map(tasks.map(task=>[taskKey(task),task]));
  const outputIdMaps=new Map<string,Map<string,string>>();
  let addedTasks=0,deduplicatedTasks=0;
  for(const source of otherState.tasks as Task[]){
    const mappedProjects=unique(source.projectIds.map(id=>projectIdMap.get(id)??id));
    const mappedOrder=Object.fromEntries(Object.entries(source.order).map(([id,order])=>[projectIdMap.get(id)??id,order]));
    const candidate={...source,projectIds:mappedProjects,order:mappedOrder};
    const existing=tasks.find(task=>task.id===source.id)??taskByKey.get(taskKey(candidate));
    if(existing){
      taskIdMap.set(source.id,existing.id);deduplicatedTasks++;
      const outputMap=new Map<string,string>();
      existing.projectIds=unique([...existing.projectIds,...mappedProjects]);
      existing.order={...mappedOrder,...existing.order};
      existing.outputs=mergeOutputs(existing.outputs,source.outputs,outputMap);
      outputIdMaps.set(source.id,outputMap);
      continue;
    }
    const copy={...candidate,outputs:(source.outputs??[]).map(output=>({...output}))};
    tasks.push(copy);taskByKey.set(taskKey(copy),copy);taskIdMap.set(source.id,copy.id);addedTasks++;
  }

  const tracks=[...(preferredState.tracks as TaskTrack[]).map(track=>({...track})),...(otherState.tracks as TaskTrack[]).map(track=>({...track}))];
  const edges:Dependency[]=[];
  const edgeKeys=new Set<string>();
  const appendEdges=(values:Dependency[],mapOther:boolean)=>{
    for(const edge of values){
      const sourceTask=mapOther?(taskIdMap.get(edge.source.taskId)??edge.source.taskId):edge.source.taskId;
      const targetTask=mapOther?(taskIdMap.get(edge.target.taskId)??edge.target.taskId):edge.target.taskId;
      if(sourceTask===targetTask||!tasks.some(task=>task.id===sourceTask)||!tasks.some(task=>task.id===targetTask))continue;
      const outputMap=mapOther?outputIdMaps.get(edge.source.taskId):undefined;
      const next={...edge,source:{...edge.source,taskId:sourceTask},target:{...edge.target,taskId:targetTask},outputIds:unique((edge.outputIds??[]).map(id=>outputMap?.get(id)??id))};
      const key=edgeKey(next);if(edgeKeys.has(key))continue;
      if(hasCycle([...edges,next]))continue;
      edges.push(next);edgeKeys.add(key);
    }
  };
  appendEdges(preferredState.edges as Dependency[],false);
  appendEdges(otherState.edges as Dependency[],true);

  const inbox=(Array.isArray(preferredState.inbox)?preferredState.inbox:[] as InboxItem[]).map((item:InboxItem)=>({...item}));
  const inboxIds=new Set(inbox.map(item=>item.id)),inboxKeys=new Set(inbox.map(inboxKey));
  for(const raw of Array.isArray(otherState.inbox)?otherState.inbox as InboxItem[]:[]){
    const item={...raw,...(raw.taskId?{taskId:taskIdMap.get(raw.taskId)??raw.taskId}:{})};
    const key=inboxKey(item);if(inboxIds.has(item.id)||inboxKeys.has(key))continue;
    inbox.push(item);inboxIds.add(item.id);inboxKeys.add(key);
  }

  const data={...preferredState,projects,tasks,edges,tracks:reconcileTracks(tasks,tracks),inbox,dataVersion:preferredState.dataVersion};
  const document={...advanceScheduleDocument(data,local,deviceId,now),title:preferred.title??local.title};
  return {document,stats:{totalTasks:tasks.length,addedTasks,deduplicatedTasks}};
}
