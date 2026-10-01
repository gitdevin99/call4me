const key='canyoucall.pending-request.v1';
export type PendingRequest={id:string;text:string;threadId:string;created:number;email?:string};
export function readPending():PendingRequest|null{
 try{const p=JSON.parse(localStorage.getItem(key)||'null');return p&&typeof p.text==='string'&&typeof p.threadId==='string'&&Date.now()-p.created<86400000?p:null;}catch{return null;}
}
export function savePending(p:PendingRequest){localStorage.setItem(key,JSON.stringify(p));}
export function clearPending(){localStorage.removeItem(key);sessionStorage.removeItem('pending-request');}
