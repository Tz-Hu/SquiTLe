"use client";
import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from "react";
import {translate,type Language} from "@/lib/i18n";
const LocaleContext=createContext({language:"zh" as Language,setLanguage:(_value:Language)=>{},t:(key:string,...args:(string|number)[])=>translate("zh",key,...args)});
export function LocaleProvider({children}:{children:ReactNode}){
  const [language,setLanguage]=useState<Language>("zh");
  const [ready,setReady]=useState(false);
  useEffect(()=>{try{const saved=localStorage.getItem("timeline-language");if(saved==="en"||saved==="zh")setLanguage(saved);}catch{}setReady(true);},[]);
  useEffect(()=>{document.documentElement.lang=language==="zh"?"zh-CN":"en";document.title=language==="zh"?"科研排期 · Research Gantt":"Research Timeline";if(ready)try{localStorage.setItem("timeline-language",language);}catch{}},[language,ready]);
  const t=useCallback((key:string,...args:(string|number)[])=>translate(language,key,...args),[language]);
  return <LocaleContext.Provider value={{language,setLanguage,t}}>{children}</LocaleContext.Provider>;
}
export function useLocale(){return useContext(LocaleContext);}
