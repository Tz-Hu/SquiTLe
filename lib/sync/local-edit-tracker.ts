import type {PersistedState,ScheduleDocument} from '../persistence/persistence';

// Layout width belongs to this browser. Old documents/checkpoints may still contain it.
export function sharedState(state:PersistedState):PersistedState{
  const {settingsWidth: _width,...shared}=state;
  return shared as PersistedState;
}

// Hydration and cloud application establish a rendered baseline, not a user edit.
export class LocalEditTracker{
  private baseline:string|null=null;
  restoring=true;
  restore(){this.restoring=true;}
  observe(state:PersistedState){
    const fingerprint=JSON.stringify(sharedState(state));
    const changed=!this.restoring&&this.baseline!==null&&this.baseline!==fingerprint;
    this.baseline=fingerprint;this.restoring=false;
    return changed;
  }
}

export function sameSyncDocument(expected:ScheduleDocument,current:ScheduleDocument|null){
  return current!==null&&JSON.stringify(expected)===JSON.stringify(current);
}
