import React from "react";
import {createRoot} from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

type UpdateMetadata={version:string;currentVersion:string;body?:string};

function startUpdateCheck(){
  const invoke=(globalThis as typeof globalThis&{__TAURI__?:{core?:{invoke?:<T>(command:string,args?:Record<string,unknown>)=>Promise<T>}}}).__TAURI__?.core?.invoke;
  if(!invoke)return;
  window.setTimeout(async()=>{
    try{
      const update=await invoke<UpdateMetadata|null>("fetch_update");
      if(!update)return;
      const english=document.documentElement.lang.startsWith("en");
      const accepted=window.confirm(english
        ?`Squitle ${update.version} is available. Install it now and restart?`
        :`Squitle ${update.version} 已可用。现在安装并重新启动吗？`);
      if(accepted)await invoke("install_update");
    }catch(error){console.info("Squitle update check skipped",error);}
  },5000);
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><Home/></React.StrictMode>,
);

startUpdateCheck();
