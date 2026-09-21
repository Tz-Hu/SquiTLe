// Single source for configurable visual values. Geometry uses these same values.
export const categoryDefaults = {论文:"#4C7EF3",实验:"#E2A93B","算法/仿真":"#C96F3B",工程:"#2E9E8F",整理:"#8B7BE8","idea与思考":"#C06BD8"};
export const WORK_TYPE_CATALOG_VERSION = 2;
export const layoutTokens = {rowHeight:64,addRowHeight:16,insertionHint:16,cornerRadius:4,arrowSize:5,routeClearance:8,stroke:1,edgeMask:3,edgeHit:14};
export function taskBounds(height:number,rowHeight=layoutTokens.rowHeight){const top=(rowHeight-height)/2;return {top,bottom:top+height};}
export const appearanceFields = {
  barHeight:{label:"任务条高度",unit:"px",min:20,max:32,step:4,value:24},
  barRadius:{label:"任务条圆角",unit:"px",min:0,max:8,step:1,value:4},
  barFill:{label:"任务条填充强度",unit:"%",min:8,max:32,step:1,value:16},
  completedOpacity:{label:"已完成事项不透明度",unit:"%",min:20,max:80,step:5,value:55},
  collapsedOpacity:{label:"折叠事项不透明度",unit:"%",min:40,max:100,step:20,value:60},
  lineOpacity:{label:"默认连线不透明度",unit:"%",min:5,max:40,step:1,value:22},
};
export const appearancePresetValues = {
  barHeight:[20,24,28,32],
  barRadius:[0,4,8],
  barFill:[8,16,24,32],
  completedOpacity:[30,55,80],
  collapsedOpacity:[40,60,80,100],
  lineOpacity:[8,22,40],
} as const;
export function snapAppearanceValue(key:keyof typeof appearancePresetValues,value:number){
  const options=appearancePresetValues[key] as readonly number[];
  return options.reduce((nearest,option)=>Math.abs(option-value)<Math.abs(nearest-value)?option:nearest,options[0]);
}
export type Appearance = Record<keyof typeof appearanceFields,number> & {weekends:boolean;weekBoundaries:boolean};
export const defaultAppearance:Appearance={barHeight:24,barRadius:4,barFill:16,completedOpacity:55,collapsedOpacity:60,lineOpacity:22,weekends:true,weekBoundaries:true};
export function restoreAppearance(value:unknown):Appearance {
  const result={...defaultAppearance};
  if(!value||typeof value!=="object")return result;
  const raw=value as Record<string,unknown>;
  for(const [key,field] of Object.entries(appearanceFields)){
    const n=raw[key];if(typeof n==="number"&&Number.isFinite(n)){const name=key as keyof typeof appearancePresetValues;result[name]=snapAppearanceValue(name,Math.max(field.min,Math.min(field.max,n)));}
  }
  for(const key of ["weekends","weekBoundaries"] as const)if(typeof raw[key]==="boolean")result[key]=raw[key];
  return result;
}
export function restoreCategories(value:unknown):Record<string,string>{
  if(!value||typeof value!=="object")return {...categoryDefaults};
  const raw=value as Record<string,unknown>;
  const valid=Object.fromEntries(Object.entries(raw).filter(([name,color])=>name.trim()&&typeof color==="string"&&/^#[0-9a-f]{6}$/i.test(color))) as Record<string,string>;
  if(!Object.keys(valid).length)return {...categoryDefaults};
  if("其他" in valid){
    return {
      论文:valid.论文??categoryDefaults.论文,
      实验:valid.实验??categoryDefaults.实验,
      "算法/仿真":valid["算法/仿真"]??categoryDefaults["算法/仿真"],
      工程:valid.工程??categoryDefaults.工程,
      整理:valid.整理??valid.其他??categoryDefaults.整理,
      "idea与思考":valid["idea与思考"]??categoryDefaults["idea与思考"],
      ...Object.fromEntries(Object.entries(valid).filter(([name])=>!["论文","实验","算法/仿真","工程","其他","整理","idea与思考"].includes(name))),
    };
  }
  return valid as Record<string,string>;
}
export function migrateCategoryCatalog(value:unknown,version:unknown):Record<string,string>{
  const restored=restoreCategories(value);
  if(Number(version)>=WORK_TYPE_CATALOG_VERSION||restored.实验)return restored;
  const entries=Object.entries(restored),paperIndex=entries.findIndex(([name])=>name==="论文");
  entries.splice(paperIndex>=0?paperIndex+1:0,0,["实验",categoryDefaults.实验]);
  return Object.fromEntries(entries);
}
