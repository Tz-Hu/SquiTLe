const invoke=window.__TAURI__.core.invoke;
const dialog=window.__TAURI__.dialog;
const openButton=document.querySelector("#open");
const saveButton=document.querySelector("#save");
const pathLabel=document.querySelector("#path");
const status=document.querySelector("#status");
let selectedPath="";
let contents="";

function showDocument(value){
  const candidate=value?.kind==="schedule-timeline-backup"?value.data:value;
  document.querySelector("#document-id").textContent=candidate?.documentId??"旧格式（写入网页后自动升级）";
  document.querySelector("#revision").textContent=Number.isInteger(candidate?.revision)?String(candidate.revision):"—";
  document.querySelector("#updated-at").textContent=candidate?.updatedAt??"—";
}

openButton.addEventListener("click",async()=>{
  const path=await dialog.open({multiple:false,filters:[{name:"Squitle JSON",extensions:["json"]}]});
  if(!path)return;
  try{
    contents=await invoke("read_schedule_document",{path});
    showDocument(JSON.parse(contents));selectedPath=path;pathLabel.textContent=path;saveButton.disabled=false;status.textContent="文档已读取；写回时会先保留 .bak 备份。";
  }catch(error){status.textContent=`读取失败：${error}`;}
});

saveButton.addEventListener("click",async()=>{
  if(!selectedPath)return;
  try{await invoke("write_schedule_document",{path:selectedPath,contents});status.textContent="已完成原子写入并保留上一版本。";}
  catch(error){status.textContent=`写入失败：${error}`;}
});
