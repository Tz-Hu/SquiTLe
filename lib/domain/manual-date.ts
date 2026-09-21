const months:Record<string,number>={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
const finish=(year:number,month:number,day:number):string|null=>{
  const date=new Date(0);date.setFullYear(year,month-1,day);date.setHours(0,0,0,0);
  if(year<1000||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
};
export function parseManualDate(input:string,locale:"zh"|"en"="zh",today=new Date()):string|null {
  const value=input.trim();
  const relative:{[key:string]:number}={今天:0,明天:1,后天:2,today:0,tomorrow:1};
  if(value.toLocaleLowerCase() in relative){const date=new Date(today);date.setDate(date.getDate()+relative[value.toLocaleLowerCase()]);return finish(date.getFullYear(),date.getMonth()+1,date.getDate());}
  let match=/^(\d{4})(\d{2})(\d{2})$/.exec(value)||/^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(value)||/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(value);
  if(match)return finish(...match.slice(1).map(Number) as [number,number,number]);
  if(locale==="en"&&(match=/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(value)))return finish(Number(match[3]),Number(match[1]),Number(match[2]));
  match=/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})$/i.exec(value);
  if(match&&months[match[1].toLowerCase()])return finish(Number(match[3]),months[match[1].toLowerCase()],Number(match[2]));
  match=/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)[,]?\s+(\d{4})$/i.exec(value);
  if(match&&months[match[2].toLowerCase()])return finish(Number(match[3]),months[match[2].toLowerCase()],Number(match[1]));
  return null;
}
