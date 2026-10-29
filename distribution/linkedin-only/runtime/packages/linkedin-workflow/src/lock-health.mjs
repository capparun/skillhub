import {readFile,lstat,open,rename,unlink} from 'node:fs/promises';
import {hostname} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
export const lockOwner=()=>({schema_version:1,pid:process.pid,hostname:hostname(),token:randomUUID(),created_at:new Date().toISOString()});
const fail=code=>{throw Object.assign(Error(code),{code});};
export async function inspectLock(path){
 let stat,raw;
 try{stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8192)return {status:'unknown',reason:'invalid_lock_file'};raw=await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return {status:'absent'};throw e;}
 const revision=createHash('sha256').update(raw).update(String(stat.ino)).digest('hex');
 let parsed;try{parsed=JSON.parse(raw);}catch{return {status:'unknown',reason:'invalid_lock_json',revision};}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return {status:'unknown',reason:'invalid_lock_owner',revision};
 const owner=Object.fromEntries(['schema_version','pid','hostname','token','created_at','execution_state','reason'].filter(k=>Object.hasOwn(parsed,k)&&['string','number'].includes(typeof parsed[k])).map(k=>[k,parsed[k]]));
 if(!Number.isInteger(owner.pid)||owner.pid<1)return {status:'unknown',reason:'invalid_owner_pid',revision,owner};
 if(!owner.hostname)return {status:'unknown',reason:'legacy_owner_host_unverified',revision,owner};
 if(owner.hostname!==hostname())return {status:'unknown',reason:'foreign_owner_host',revision,owner};
 try{process.kill(owner.pid,0);return {status:'running',revision,owner};}catch(e){return {status:e.code==='ESRCH'?'owner_exited':'unknown',revision,owner};}
}
export async function recoverLock(path,{revision,execution_stopped_confirmed}={}){
 if(execution_stopped_confirmed!==true)fail('execution_stop_confirmation_required');
 let guard;try{guard=await open(path+'.recovery','wx',0o600);}catch(e){if(e.code==='EEXIST')fail('recovery_busy');throw e;}
 try{
 const state=await inspectLock(path);
 if(state.status==='absent')return {status:'absent',dispatched:false};
 if(state.revision!==revision)fail('lock_changed');
 if(state.status!=='owner_exited')fail('lock_not_recoverable');
 const archive=path+'.recovered-'+randomUUID();await rename(path,archive);
 return {status:'recovered',archive,dispatched:false,operation_outcome:'unchanged',instruction:'No operation was retried; inspect the interrupted operation before continuing.'};
 }finally{await guard.close();await unlink(path+'.recovery');}
}
