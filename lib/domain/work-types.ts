import type {Task} from "./schedule.ts";

export type RenameWorkTypeResult={
  tasks:Task[];
  colors:Record<string,string>;
  name:string;
  renamed:boolean;
  error:null|"missing"|"empty"|"duplicate";
};

export function renameWorkTypeColorMap(colors:Record<string,string>,from:string,to:string){
  return Object.fromEntries(Object.entries(colors).map(([name,color])=>[name===from?to:name,color]));
}

export function renameWorkType(tasks:Task[],colors:Record<string,string>,from:string,requestedName:string):RenameWorkTypeResult{
  if(!Object.prototype.hasOwnProperty.call(colors,from))return {tasks,colors,name:from,renamed:false,error:"missing"};
  const name=requestedName.trim().slice(0,24);
  if(!name)return {tasks,colors,name:from,renamed:false,error:"empty"};
  if(name!==from&&Object.prototype.hasOwnProperty.call(colors,name))return {tasks,colors,name:from,renamed:false,error:"duplicate"};
  if(name===from)return {tasks,colors,name,renamed:false,error:null};
  return {
    tasks:tasks.map(task=>task.type===from?{...task,type:name}:task),
    colors:renameWorkTypeColorMap(colors,from,name),
    name,
    renamed:true,
    error:null,
  };
}

export function deleteWorkType(tasks:Task[],colors:Record<string,string>,name:string){
  const remaining=Object.keys(colors).filter(type=>type!==name);
  const replacement=remaining[0]??null;
  if(!replacement||!colors[name])return {tasks,colors,replacement:null};
  return {
    tasks:tasks.map(task=>task.type===name?{...task,type:replacement}:task),
    colors:Object.fromEntries(Object.entries(colors).filter(([type])=>type!==name)),
    replacement,
  };
}
