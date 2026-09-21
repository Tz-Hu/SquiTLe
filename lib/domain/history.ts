export type History<T> = { past: T[]; present: T; future: T[] };
export const HISTORY_LIMIT = 50;
export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] });
export function commit<T>(history: History<T>, change: (value: T) => T): History<T> {
  const next = change(history.present);
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}
export function undo<T>(history: History<T>): History<T> {
  if (!history.past.length) return history;
  return { past: history.past.slice(0,-1), present: history.past[history.past.length-1], future: [history.present,...history.future] };
}
export function redo<T>(history: History<T>): History<T> {
  if (!history.future.length) return history;
  return { past: [...history.past,history.present], present: history.future[0], future: history.future.slice(1) };
}
