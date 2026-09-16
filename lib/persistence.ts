export const CURRENT_DATA_VERSION = 4;
export const BACKUP_KIND = "schedule-timeline-backup";

export type PersistedState = Record<string, any> & {
  dataVersion: number;
  projects: unknown[];
  tasks: unknown[];
  edges: unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

export function migratePersistedState(input: unknown): PersistedState {
  if (!isRecord(input)) throw new Error("invalid_backup");
  const candidate = input.kind === BACKUP_KIND && isRecord(input.data) ? input.data : input;
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
  return { ...state, dataVersion: CURRENT_DATA_VERSION } as PersistedState;
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
  return `schedule-timeline-${stamp}.json`;
}
