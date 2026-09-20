import type {CloudScheduleSnapshot,CloudScheduleStore} from "./cloud-sync";
import type {ScheduleDocument} from "./persistence";

export type CloudBasePublicConfig={
  env:string;
  region:string;
  accessKey:string;
  syncFunction:string;
};

export type CloudBasePublicEnvironment={
  NEXT_PUBLIC_CLOUDBASE_ENV_ID?:string;
  NEXT_PUBLIC_CLOUDBASE_REGION?:string;
  NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY?:string;
  NEXT_PUBLIC_SQUITLE_SYNC_FUNCTION?:string;
};

type CloudFunctionClient={
  callFunction?<T>(options:{name:string;data:Record<string,unknown>}):Promise<{result:T}>;
};

type SyncFunctionResult={
  ok:boolean;
  snapshot?:CloudScheduleSnapshot|null;
  error?:string;
};

const clean=(value:string|undefined)=>value?.trim()??"";

export function cloudBaseConfigFromEnvironment(environment:CloudBasePublicEnvironment):CloudBasePublicConfig|null{
  const env=clean(environment.NEXT_PUBLIC_CLOUDBASE_ENV_ID);
  const accessKey=clean(environment.NEXT_PUBLIC_CLOUDBASE_ACCESS_KEY);
  if(!env||!accessKey)return null;
  return {
    env,
    region:clean(environment.NEXT_PUBLIC_CLOUDBASE_REGION)||"ap-shanghai",
    accessKey,
    syncFunction:clean(environment.NEXT_PUBLIC_SQUITLE_SYNC_FUNCTION)||"squitle-sync",
  };
}

export async function createCloudBaseClient(config:CloudBasePublicConfig):Promise<CloudFunctionClient>{
  const sdkModule=await import("@cloudbase/js-sdk");
  const cloudbase=(sdkModule.default??sdkModule) as unknown as {init(options:Record<string,unknown>):CloudFunctionClient};
  return cloudbase.init({env:config.env,region:config.region,accessKey:config.accessKey,auth:{detectSessionInUrl:true}});
}

export class CloudBaseScheduleStore implements CloudScheduleStore{
  private readonly client:CloudFunctionClient;
  private readonly functionName:string;

  constructor(client:CloudFunctionClient,functionName="squitle-sync"){
    this.client=client;
    this.functionName=functionName;
  }

  private async call(data:Record<string,unknown>){
    if(!this.client.callFunction)throw new Error("cloudbase_function_unavailable");
    const response=await this.client.callFunction<SyncFunctionResult>({name:this.functionName,data});
    if(!response.result?.ok)throw new Error(response.result?.error||"cloudbase_sync_failed");
    return response.result.snapshot??null;
  }

  load(documentId:string){
    return this.call({action:"load",documentId});
  }

  async save(document:ScheduleDocument,expectedServerRevision:number|null){
    const snapshot=await this.call({action:"save",documentId:document.documentId,expectedServerRevision,document});
    if(!snapshot)throw new Error("cloudbase_sync_empty_response");
    return snapshot;
  }
}
