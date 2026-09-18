export const CURRENT_DATA_VERSION = 6;
export const BACKUP_KIND = "schedule-timeline-backup";
export const DOCUMENT_KIND = "schedule-timeline-document";

export type PersistedState = Record<string, any> & {
  dataVersion: number;
  projects: unknown[];
  tasks: unknown[];
  edges: unknown[];
  tracks: unknown[];
};

export type ScheduleDocument<T extends Record<string, unknown> = PersistedState> = {
  kind: typeof DOCUMENT_KIND;
  schemaVersion: number;
  documentId: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  data: T;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export const isScheduleDocument=(value:unknown):value is ScheduleDocument=>isRecord(value)
  &&value.kind===DOCUMENT_KIND
  &&typeof value.documentId==="string"&&value.documentId.length>0
  &&Number.isInteger(value.revision)&&Number(value.revision)>=0
  &&typeof value.updatedAt==="string"
  &&typeof value.updatedBy==="string"&&value.updatedBy.length>0
  &&isRecord(value.data);

export function migratePersistedState(input: unknown): PersistedState {
  if (!isRecord(input)) throw new Error("invalid_backup");
  const wrapped = input.kind === BACKUP_KIND && isRecord(input.data) ? input.data : input;
  if(isRecord(wrapped)&&wrapped.kind===DOCUMENT_KIND&&Number(wrapped.schemaVersion)>CURRENT_DATA_VERSION)throw new Error("future_backup");
  const candidate = isRecord(wrapped)&&wrapped.kind===DOCUMENT_KIND&&isRecord(wrapped.data)?wrapped.data:wrapped;
  const version = Number.isFinite(candidate.dataVersion) ? Number(candidate.dataVersion) : 2;
  if (version > CURRENT_DATA_VERSION) throw new Error("future_backup");
  if (!Array.isArray(candidate.projects) || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.edges)) {
    throw new Error("invalid_backup");
  }

  let state: Record<string, unknown> = { ...candidate };
  if (version <= 2) {
    state = {
      ...state,
      tasks: candidate.tasks.map(task => isRecord(task)
        ? { ...task, memo: typeof task.memo === "string" ? task.memo : typeof task.note === "string" ? task.note : "" }
        : task),
      dataVersion: 3,
    };
  }
  if(version<=3){
    state={...state,tasks:(state.tasks as unknown[]).map(task=>isRecord(task)?{...task,type:task.type==="其他"?"整理":task.type}:task),dataVersion:4};
  }
  if(version<=4){
    state={
      ...state,
      tasks:(state.tasks as unknown[]).map(task=>isRecord(task)?{...task,outputs:Array.isArray(task.outputs)?task.outputs:[]}:task),
      edges:(state.edges as unknown[]).map(edge=>isRecord(edge)?{...edge,outputIds:Array.isArray(edge.outputIds)?edge.outputIds:[]}:edge),
      dataVersion:5,
    };
  }
  if(version<=5){
    const tracks=new Map<string,{id:string;title:string;type:string}>();
    for(const value of state.tasks as unknown[]){
      if(!isRecord(value)||typeof value.id!=="string")continue;
      const id=typeof value.rowId==="string"&&value.rowId?value.rowId:value.id;
      if(!tracks.has(id))tracks.set(id,{id,title:typeof value.title==="string"&&value.title.trim()?value.title:"未命名任务轨",type:typeof value.type==="string"&&value.type?value.type:"整理"});
    }
    state={...state,tracks:[...tracks.values()],dataVersion:6};
  }
  state={...state,tracks:(Array.isArray(state.tracks)?state.tracks:[]).flatMap(track=>isRecord(track)&&typeof track.id==="string"&&typeof track.title==="string"&&typeof track.type==="string"?[{id:track.id,title:track.title,type:track.type}]:[])};
  return { ...state, dataVersion: CURRENT_DATA_VERSION } as PersistedState;
}

export function loadScheduleDocument(
  input:unknown,
  deviceId:string,
  createId:()=>string=()=>crypto.randomUUID(),
  now:()=>Date=()=>new Date(),
):{document:ScheduleDocument;legacy:boolean}{
  const wrapped=isRecord(input)&&input.kind===BACKUP_KIND&&isRecord(input.data)?input.data:input;
  if(isScheduleDocument(wrapped)){
    if(wrapped.schemaVersion>CURRENT_DATA_VERSION)throw new Error("future_backup");
    return {document:{...wrapped,schemaVersion:CURRENT_DATA_VERSION,data:migratePersistedState(wrapped.data)},legacy:false};
  }
  return {document:{kind:DOCUMENT_KIND,schemaVersion:CURRENT_DATA_VERSION,documentId:createId(),revision:0,updatedAt:now().toISOString(),updatedBy:deviceId,data:migratePersistedState(wrapped)},legacy:true};
}

export function advanceScheduleDocument(
  state:Record<string,unknown>,
  previous:ScheduleDocument|null,
  deviceId:string,
  now:()=>Date=()=>new Date(),
  createId:()=>string=()=>crypto.randomUUID(),
):ScheduleDocument{
  return {
    kind:DOCUMENT_KIND,
    schemaVersion:CURRENT_DATA_VERSION,
    documentId:previous?.documentId??createId(),
    revision:(previous?.revision??0)+1,
    updatedAt:now().toISOString(),
    updatedBy:deviceId,
    data:{...state,dataVersion:CURRENT_DATA_VERSION} as PersistedState,
  };
}

export function createBackup(state: Record<string, unknown>) {
  return {
    kind: BACKUP_KIND,
    schemaVersion: CURRENT_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    data: { ...state, dataVersion: CURRENT_DATA_VERSION },
  };
}

export function parseBackup(text: string): PersistedState {
  return migratePersistedState(JSON.parse(text));
}

export function backupFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10);
  return `squitle-${stamp}.json`;
}
