import type { CloudRevision, CloudRevisionSnapshot, CloudScheduleSnapshot, CloudScheduleStore } from "./cloud-sync";
import type { ScheduleDocument } from "../persistence/persistence";

export type SyncAccount = {
  signedIn: true;
  email: string;
  displayName: string;
};

export class SyncRequestError extends Error {
  readonly code:string;
  readonly status:number;

  constructor(code: string,status: number) {
    super(code);
    this.code=code;
    this.status=status;
  }
}

export async function jsonRequest<T>(
  fetcher: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(input, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const value = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new SyncRequestError(value.error ?? "cloud_unavailable", response.status);
  return value;
}

export async function loadSyncAccount(fetcher: typeof fetch = fetch): Promise<SyncAccount | null> {
  try {
    return await jsonRequest<SyncAccount>(fetcher, "/api/sync/account");
  } catch (error) {
    if (error instanceof SyncRequestError && error.status === 401) return null;
    throw error;
  }
}

export class SitesScheduleStore implements CloudScheduleStore {
  private readonly fetcher:typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {this.fetcher=fetcher;}

  async load(documentId: string): Promise<CloudScheduleSnapshot | null> {
    const value = await jsonRequest<{ snapshot: CloudScheduleSnapshot | null }>(
      this.fetcher,
      `/api/sync/document?documentId=${encodeURIComponent(documentId)}`,
    );
    return value.snapshot;
  }

  async loadRevision(documentId:string):Promise<CloudRevisionSnapshot|null>{
    const value=await jsonRequest<{revision:CloudRevisionSnapshot|null}>(
      this.fetcher,
      `/api/sync/document?documentId=${encodeURIComponent(documentId)}&metadata=1`,
    );
    return value.revision;
  }

  async save(
    document: ScheduleDocument,
    expectedServerRevision: CloudRevision | null,
  ): Promise<CloudScheduleSnapshot> {
    if(expectedServerRevision!==null&&typeof expectedServerRevision!=="number")throw new SyncRequestError("invalid_revision",400);
    const value = await jsonRequest<{ snapshot: CloudScheduleSnapshot }>(
      this.fetcher,
      "/api/sync/document",
      {
        method: "PUT",
        body: JSON.stringify({ document, expectedServerRevision }),
      },
    );
    return value.snapshot;
  }
}

export type CloudTimelineEntry={documentId:string;title:string;updatedAt:string};
export async function loadCloudTimelines(fetcher:typeof fetch=fetch){return (await jsonRequest<{timelines:CloudTimelineEntry[]}>(fetcher,"/api/sync/timelines")).timelines;}
export async function renameCloudTimeline(documentId:string,title:string,fetcher:typeof fetch=fetch){return jsonRequest<{timeline:CloudTimelineEntry}>(fetcher,"/api/sync/timelines",{method:"PATCH",body:JSON.stringify({documentId,title})});}
export async function deleteCloudTimeline(documentId:string,fetcher:typeof fetch=fetch){return jsonRequest<{deleted:true}>(fetcher,"/api/sync/timelines",{method:"DELETE",body:JSON.stringify({documentId})});}
