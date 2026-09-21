export function completedLast<T extends {completed:boolean}>(items:T[]):T[]{
  return items
    .map((item,index)=>({item,index}))
    .sort((a,b)=>Number(a.item.completed)-Number(b.item.completed)||a.index-b.index)
    .map(({item})=>item);
}
