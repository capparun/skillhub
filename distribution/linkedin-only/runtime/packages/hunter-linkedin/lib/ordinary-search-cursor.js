import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
export const requestFingerprint=value=>hash(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
export function sessionBinding(cookies){
  const session=cookies.find(c=>c.name==='li_at')?.value??cookies.find(c=>c.name==='JSESSIONID')?.value;
  if(!session)fail('not_logged_in');return hash(session);
}
export function writeSearchCursor({directory,binding,requestKey,progress,now=Date.now()}){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const data={schema_version:1,binding,request_key:requestKey,expires_at:now+30*60*1000,progress};
  const raw=JSON.stringify({data,checksum:hash(data)});if(Buffer.byteLength(raw)>8*1024*1024)fail('search_cursor_too_large');
  const file=path.join(directory,randomUUID()+'.json');fs.writeFileSync(file,raw,{flag:'wx',mode:0o600});return file;
}
export function readSearchCursor(file,{binding,requestKey,now=Date.now()}){
  if(typeof file!=='string'||!path.isAbsolute(file))fail('invalid_search_cursor');
  let record;try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>8*1024*1024)fail('invalid_search_cursor');record=JSON.parse(fs.readFileSync(file,'utf8'));}catch{fail('invalid_search_cursor');}
  const d=record?.data;if(!d||d.schema_version!==1||record.checksum!==hash(d))fail('invalid_search_cursor');
  if(!Number.isFinite(d.expires_at)||now>=d.expires_at)fail('search_cursor_expired');
  if(d.binding!==binding)fail('search_cursor_account_mismatch');if(d.request_key!==requestKey)fail('search_cursor_query_mismatch');
  if(!d.progress||!Array.isArray(d.progress.results)||d.progress.results.length>2500)fail('invalid_search_cursor');
  return d.progress;
}

// Append-only task journal. A completed record is visible only after atomic rename.
export function publishSearchCheckpoint(directory, cursor, progress) {
  if (!directory) return;
  if (!path.isAbsolute(directory)) fail('invalid_checkpoint_directory');
  fs.mkdirSync(directory, {recursive:true, mode:0o700});
  const name = randomUUID();
  const temporary = path.join(directory, name + '.pending');
  const destination = path.join(directory, name + '.json');
  fs.writeFileSync(temporary, JSON.stringify({schema_version:1, cursor,
    next_page:progress.page, collected_count:progress.results.length, saved_at:Date.now()}), {flag:'wx',mode:0o600});
  fs.renameSync(temporary, destination);
  return destination;
}
