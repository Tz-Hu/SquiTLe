"use client";
import {useState,useId} from "react";
import {Input} from "@/components/ui/input";
import {parseManualDate} from "@/lib/domain/manual-date";
import {Info} from "lucide-react";
import {Tooltip,TooltipContent,TooltipProvider,TooltipTrigger} from "@/components/ui/tooltip";
import {useLocale} from "@/components/providers/locale-provider";
export function ManualDateField({label,value,min,max,onValid,onInvalid}:{label:string;value:string;min:string;max:string;onValid:(value:string)=>void;onInvalid:(invalid:boolean)=>void}){
  const {t,language}=useLocale();
  const [draft,setDraft]=useState({value,text:value,error:""});
  const text=draft.value===value?draft.text:value;
  const error=draft.value===value?draft.error:"";
  const errorId=useId();
  return <div className="min-w-0"><div className="relative"><Input className="pr-8" aria-label={label} aria-invalid={!!error} aria-describedby={error?errorId:undefined} type="text" inputMode="text" value={text} placeholder="20260806" onChange={event=>{
    const raw=event.target.value;const parsed=parseManualDate(raw,language);
    const message=!parsed?"invalid":parsed<min||parsed>max?"range":"";
    setDraft({value,text:raw,error:message});onInvalid(!!message);if(parsed&&!message)onValid(parsed);
  }} onBlur={()=>{const parsed=parseManualDate(text,language);if(parsed&&!error)setDraft({value,text:parsed,error:""});}}/>
    <TooltipProvider delayDuration={150}><Tooltip><TooltipTrigger asChild><button type="button" aria-label={t("{0}填写说明",label)} className="absolute right-2 top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full text-[var(--text-weak)]"><Info className="size-4"/></button></TooltipTrigger><TooltipContent className="date-format-help" side="top" sideOffset={8}><p>{t("支持以下日期格式：")}</p>{language==="zh"?<ul><li>2026年8月6日</li><li>20260806</li><li>2026/08/06 · 2026.08.06</li><li>{t("今天 · 明天 · 后天")}</li></ul>:<ul><li>2026-08-06 · 20260806</li><li>08/06/2026</li><li>Aug 6, 2026</li><li>6 August 2026</li><li>today · tomorrow</li></ul>}</TooltipContent></Tooltip></TooltipProvider>
    </div>{error&&<p id={errorId} role="alert" className="mt-1 text-xs text-red-700">{error==="invalid"?t("请输入有效日期"):t("范围：{0} 至 {1}",min,max)}</p>}</div>;
}
