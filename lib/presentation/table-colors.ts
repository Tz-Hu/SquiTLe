export const tableColorLabels = {
  project:"项目列 · 最左列", task:"事项列 · 第二列",
  month:"月份行 · 顶部", date:"日期行 · 第二行",
  canvas:"时间内容区", add:"添加事项空白条", grid:"网格线", projectLine:"项目间分隔线",
};
export type TableColors = Record<keyof typeof tableColorLabels,string>;
export type TablePalettes = Record<"light"|"dark",TableColors>;
export const defaultTablePalettes:TablePalettes = {
  light:{project:"#E7EBF0",task:"#F0F3F7",month:"#E7EBF0",date:"#F0F3F7",canvas:"#FAFBFD",add:"#F0F3F7",grid:"#172033",projectLine:"#AAB4C2"},
  dark:{project:"#0B0E13",task:"#151A21",month:"#151A21",date:"#151A21",canvas:"#0E1116",add:"#11151C",grid:"#FFFFFF",projectLine:"#343D49"},
};
export function restoreTablePalettes(value:unknown):TablePalettes {
  const result=structuredClone(defaultTablePalettes);
  if(!value||typeof value!=="object")return result;
  for(const mode of ["light","dark"] as const){
    const colors=(value as Record<string,unknown>)[mode];
    if(!colors||typeof colors!=="object")continue;
    for(const key of Object.keys(tableColorLabels) as (keyof TableColors)[]){
      const color=(colors as Record<string,unknown>)[key];
      if(typeof color==="string"&&/^#[0-9a-f]{6}$/i.test(color))result[mode][key]=color;
    }
  }
  return result;
}
// Upgrade only previous defaults; explicitly customized colors remain intact.
export function migrateTablePalettes(value:unknown,version:unknown):TablePalettes {
  const restored=restoreTablePalettes(value);
  if(version===2)return restored;
  const previous={light:{project:"#d5deeb",task:"#e7edf5",month:"#d5deeb",date:"#e7edf5",canvas:"#ffffff",add:"#e2e7ee",grid:"#e5eaf2",projectLine:defaultTablePalettes.light.projectLine},dark:{project:"#101827",task:"#1a2639",month:"#101827",date:"#1a2639",canvas:"#243248",add:"#1c293c",grid:"#35445c",projectLine:defaultTablePalettes.dark.projectLine}};
  for(const mode of ["light","dark"] as const)for(const key of Object.keys(tableColorLabels) as (keyof TableColors)[])if(restored[mode][key].toLowerCase()===previous[mode][key].toLowerCase())restored[mode][key]=defaultTablePalettes[mode][key];
  return restored;
}
export function tableTextColor(background:string){
  const rgb=[1,3,5].map(offset=>parseInt(background.slice(offset,offset+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?"var(--ink-dark)":"var(--ink-light)";
}
