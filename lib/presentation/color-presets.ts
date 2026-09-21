import {categoryDefaults,restoreCategories} from "./appearance.ts";
import {defaultTablePalettes,type TableColors} from "./table-colors.ts";

export type PresetMode="light"|"dark";
export type ColorPreset={id:string;name:string;mode:PresetMode;primary:string;categories:Record<string,string>;table:TableColors;builtin?:boolean};

export function nextCustomPresetName(presets:Pick<ColorPreset,"name">[],prefix="自定义"){
  const used=new Set(presets.flatMap(({name})=>{const match=name.trim().match(/^(?:自定义|Custom)\s*#(\d+)$/i);return match?[Number(match[1])]:[];}));
  let number=1;while(used.has(number))number++;
  return `${prefix}#${number}`;
}

type LegacyTableColors=Omit<TableColors,"projectLine">&Partial<Pick<TableColors,"projectLine">>;
const preset=(id:string,name:string,mode:PresetMode,primary:string,categories:Record<string,string>,table:LegacyTableColors):ColorPreset=>({id,name,mode,primary,categories:restoreCategories(categories),table:{...table,projectLine:table.projectLine??table.grid},builtin:true});
export const builtInColorPresets:ColorPreset[]=[
  preset("default-light","预设1","light","#4C7EF3",categoryDefaults,defaultTablePalettes.light),
  preset("nailong","预设2","light","#D59B22",{论文:"#D59B22",实验:"#E8782B",工程:"#719B73",其他:"#9B78B5"},{project:"#F3D66F",task:"#FFF0AB",month:"#F3D66F",date:"#FFF0AB",canvas:"#FFFBEC",add:"#FFF4C6",grid:"#8A6B18"}),
  preset("dpsk","预设3","light","#3977D5",{论文:"#3977D5",实验:"#608FD5",工程:"#347F91",其他:"#7166B1"},{project:"#D9E7FA",task:"#EAF2FD",month:"#D9E7FA",date:"#EAF2FD",canvas:"#F7FAFF",add:"#EEF4FD",grid:"#315D91"}),
  preset("morandi","莫兰迪","light","#7189A8",{论文:"#7189A8",实验:"#B98278",工程:"#6F9488",其他:"#8B7F9E"},{project:"#D9D5CF",task:"#E7E3DD",month:"#D9D5CF",date:"#E7E3DD",canvas:"#F4F1EC",add:"#EAE6E0",grid:"#6F7478"}),
  preset("mondrian","蒙德里安","light","#D83B34",{论文:"#2457A6",实验:"#D83B34",工程:"#E5B928",其他:"#161616"},{project:"#F3D13B",task:"#E8EEF8",month:"#D84A43",date:"#E8EEF8",canvas:"#FAFAF6",add:"#F2F1E9",grid:"#191919"}),
  preset("macaron","马卡龙","light","#E89A9A",{论文:"#73A9D8",实验:"#E89A9A",工程:"#73B9A5",其他:"#A895CF"},{project:"#F8D9DE",task:"#DDECF7",month:"#F8D9DE",date:"#E8F3EE",canvas:"#FFF9F4",add:"#F9EEDB",grid:"#8D91A0"}),
  preset("memphis","孟菲斯","light","#E95676",{论文:"#2F7FD3",实验:"#E95676",工程:"#28A59A",其他:"#7B54B3"},{project:"#FFD84D",task:"#E9F1FF",month:"#FF718D",date:"#DDF5F0",canvas:"#FFFDF7",add:"#F1E9FF",grid:"#283044"}),
  preset("rococo","洛可可","light","#D990A7",{论文:"#7D9BC1",实验:"#D990A7",工程:"#79A99A",其他:"#A487B8"},{project:"#EACAD5",task:"#DCE8F3",month:"#EACAD5",date:"#F2E4D2",canvas:"#FFF9F3",add:"#EDE4F2",grid:"#8B7D86"}),
  preset("dunhuang","敦煌","light","#A7432D",{论文:"#315B75",实验:"#A7432D",工程:"#39736A",其他:"#B07A2A"},{project:"#C99A45",task:"#E3C98C",month:"#9F4937",date:"#D8B872",canvas:"#F4E4BD",add:"#E8D29C",grid:"#553E2A"}),
  preset("default-dark","预设1","dark","#4C7EF3",categoryDefaults,defaultTablePalettes.dark),
  preset("planhub","预设2","dark","#F7971D",{论文:"#F7971D",实验:"#FFB347",工程:"#D98221",其他:"#C69A64"},{project:"#080808",task:"#121212",month:"#090909",date:"#151515",canvas:"#000000",add:"#1A130B",grid:"#F7971D"}),
  preset("deep-ocean","深海蓝","dark","#4F8CFF",{论文:"#6EA8FE",实验:"#D99A4E",工程:"#43B5A5",其他:"#9C8CFF"},{project:"#0A1628",task:"#10213A",month:"#0A1628",date:"#10213A",canvas:"#07111F",add:"#0D1B30",grid:"#2B4D78"}),
  preset("dark-pine","暗松绿","dark","#43B581",{论文:"#62A6D9",实验:"#D39A55",工程:"#43B581",其他:"#A184D0"},{project:"#0A1A15",task:"#10271F",month:"#0A1A15",date:"#10271F",canvas:"#07130F",add:"#0D211A",grid:"#2A5B48"}),
  preset("deep-forest","深林绿","dark","#82AE5D",{论文:"#6D9FC7",实验:"#C58C52",工程:"#82AE5D",其他:"#9B7DB2"},{project:"#141B0E",task:"#1B2613",month:"#141B0E",date:"#1B2613",canvas:"#0D1209",add:"#182111",grid:"#485F35"}),
  preset("burgundy","酒红","dark","#D06A82",{论文:"#7998D0",实验:"#D18A62",工程:"#63A091",其他:"#B17EAD"},{project:"#251016",task:"#32151F",month:"#251016",date:"#32151F",canvas:"#180A0F",add:"#2B111A",grid:"#6B3543"}),
];

const validColor=(value:unknown):value is string=>typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value);
export function restoreCustomColorPresets(value:unknown):ColorPreset[]{
  if(!Array.isArray(value))return [];
  return value.flatMap(raw=>{
    if(!raw||typeof raw!=="object")return [];
    const item=raw as Partial<ColorPreset>;
    if(typeof item.id!=="string"||typeof item.name!=="string"||!item.name.trim()||(item.mode!=="light"&&item.mode!=="dark")||!item.categories||!item.table)return [];
    const mode=item.mode;
    const categoryEntries=Object.entries(item.categories),tableKeys=Object.keys(defaultTablePalettes.light);
    const legacyTable=item.table as Partial<TableColors>;
    if(!categoryEntries.length||!categoryEntries.every(([key,color])=>key.trim()&&validColor(color))||!tableKeys.filter(key=>key!=="projectLine").every(key=>validColor(legacyTable[key as keyof TableColors])))return [];
    const categories=restoreCategories(item.categories);
    const table=Object.fromEntries(tableKeys.map(key=>[key,validColor(legacyTable[key as keyof TableColors])?legacyTable[key as keyof TableColors]:defaultTablePalettes[mode].projectLine])) as TableColors;
    const primary=validColor(item.primary)?item.primary:Object.values(categories)[0]??categoryDefaults.论文;
    return [{id:item.id,name:item.name.trim().slice(0,40),mode,primary,categories,table}];
  });
}
