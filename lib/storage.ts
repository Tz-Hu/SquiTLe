export const SCHEDULE_STORAGE_KEY = "research-gantt-v2";
export const DEVICE_ID_KEY = "schedule-timeline-device-id";
export const LEGACY_DOCUMENT_BACKUP_KEY = "research-gantt-before-document-envelope";

export type StorageRevision = string;

export type StorageRead<T> = {
  data: T | null;
  revision?: StorageRevision;
};

export type StorageWrite = {
  revision?: StorageRevision;
};

/**
 * The persistence boundary shared by the browser and future desktop/cloud
 * adapters. Remote implementations can use expectedRevision for ETag or file
 * revision checks; the browser implementation has no concurrent writer token.
 */
export interface ScheduleStorage<T> {
  readonly kind: string;
  load(): Promise<StorageRead<T>>;
  save(data: T, expectedRevision?: StorageRevision): Promise<StorageWrite>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class BrowserJsonStorage<T> implements ScheduleStorage<T> {
  readonly kind = "browser-local";
  private readonly storage: KeyValueStorage;
  private readonly key: string;

  constructor(
    storage: KeyValueStorage,
    key = SCHEDULE_STORAGE_KEY,
  ) {
    this.storage=storage;
    this.key=key;
  }

  async load(): Promise<StorageRead<T>> {
    const raw = this.storage.getItem(this.key);
    return { data: raw === null ? null : JSON.parse(raw) as T };
  }

  async save(data: T): Promise<StorageWrite> {
    this.storage.setItem(this.key, JSON.stringify(data));
    return {};
  }
}

type DesktopBridge = {
  core?: { invoke?: <R>(command:string,args?:Record<string,unknown>)=>Promise<R> };
  dialog?: { save?: (options:Record<string,unknown>)=>Promise<string|null> };
};

const desktopApi=()=>((globalThis as typeof globalThis & {__TAURI__?:DesktopBridge}).__TAURI__);
const desktopBridge=()=>desktopApi()?.core?.invoke;

export class DesktopJsonStorage<T> implements ScheduleStorage<T> {
  readonly kind="desktop-local-file";

  async load():Promise<StorageRead<T>>{
    const invoke=desktopBridge();
    if(!invoke)throw new Error("desktop_bridge_unavailable");
    const raw=await invoke<string|null>("read_app_schedule_document");
    return {data:raw===null?null:JSON.parse(raw) as T};
  }

  async save(data:T):Promise<StorageWrite>{
    const invoke=desktopBridge();
    if(!invoke)throw new Error("desktop_bridge_unavailable");
    await invoke("write_app_schedule_document",{contents:JSON.stringify(data)});
    return {};
  }
}

export function createBrowserScheduleStorage<T>(storage: KeyValueStorage) {
  return new BrowserJsonStorage<T>(storage);
}

export function isDesktopRuntime(){return typeof desktopBridge()==="function";}

export function createScheduleStorage<T>(storage:KeyValueStorage):ScheduleStorage<T>{
  return isDesktopRuntime()?new DesktopJsonStorage<T>():createBrowserScheduleStorage<T>(storage);
}

export async function saveDesktopJson(contents:string,defaultName:string):Promise<"saved"|"cancelled"|"unavailable">{
  const invoke=desktopBridge(),save=desktopApi()?.dialog?.save;
  if(!invoke||!save)return "unavailable";
  const path=await save({defaultPath:defaultName,filters:[{name:"Squitle JSON",extensions:["json"]}]});
  if(!path)return "cancelled";
  await invoke("write_schedule_document",{path,contents});
  return "saved";
}

export function getOrCreateDeviceId(storage:KeyValueStorage,createId:()=>string=()=>crypto.randomUUID()){
  let existing:string|null=null;
  try{existing=storage.getItem(DEVICE_ID_KEY);}catch{}
  if(existing)return existing;
  const id=createId();try{storage.setItem(DEVICE_ID_KEY,id);}catch{}return id;
}
