import type {Task} from "./schedule.ts";

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
