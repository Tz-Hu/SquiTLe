"use client";
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import {translate,type Language} from "@/lib/presentation/i18n";
const LocaleContext=createContext({language:"zh" as Language,setLanguage:(_value:Language)=>{},t:(key:string,...args:(string|number)[])=>translate("zh",key,...args)});
export function LocaleProvider({children}:{children:ReactNode}){
  const [language,setLanguage]=useState<Language>("zh");
  const [ready,setReady]=useState(false);
  useEffect(()=>{let active=true;let saved:Language|undefined;try{const stored=localStorage.getItem("timeline-language");if(stored==="en"||stored==="zh")saved=stored;}catch{}queueMicrotask(()=>{if(!active)return;if(saved)setLanguage(saved);setReady(true);});return()=>{active=false;};},[]);
  useEffect(()=>{document.documentElement.lang=language==="zh"?"zh-CN":"en";document.title=language==="zh"?"科研排期 · Research Gantt":"Research Timeline";if(ready)try{localStorage.setItem("timeline-language",language);}catch{}},[language,ready]);
  const t=useCallback((key:string,...args:(string|number)[])=>translate(language,key,...args),[language]);
  return <LocaleContext.Provider value={{language,setLanguage,t}}>{children}</LocaleContext.Provider>;
}
export function useLocale(){return useContext(LocaleContext);}
