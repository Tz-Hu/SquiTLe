export const SCHEDULE_STORAGE_KEY = "research-gantt-v2";
export const DEVICE_ID_KEY = "schedule-timeline-device-id";
export const LEGACY_DOCUMENT_BACKUP_KEY = "research-gantt-before-document-envelope";
export const TIMELINE_INDEX_KEY = "squitle-timeline-index-v1";
export const ACTIVE_TIMELINE_KEY = "squitle-active-timeline-v1";
export const timelineDocumentKey=(documentId:string)=>`squitle-timeline:${documentId}`;
export const createLocalId=()=>{
  if(typeof crypto.randomUUID==="function")return crypto.randomUUID();
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(value=>value.toString(16).padStart(2,"0")).join("");
};

export type StorageRevision = string;

export type StorageRead<T> = {
  data: T | null;
  revision?: StorageRevision;
};

export type StorageWrite = {
  revision?: StorageRevision;
};

/**
 * The persistence boundary shared by local and remote storage adapters.
 * Remote implementations can use expectedRevision for ETag or file revision
 * checks; the browser implementation has no concurrent writer token.
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

export function createBrowserScheduleStorage<T>(storage: KeyValueStorage,key=SCHEDULE_STORAGE_KEY) {
  return new BrowserJsonStorage<T>(storage,key);
}

export function getOrCreateDeviceId(storage:KeyValueStorage,createId:()=>string=createLocalId){
  let existing:string|null=null;
  try{existing=storage.getItem(DEVICE_ID_KEY);}catch{}
  if(existing)return existing;
  const id=createId();try{storage.setItem(DEVICE_ID_KEY,id);}catch{}return id;
}
