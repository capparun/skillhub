// Explicitly scoped allowlist update. Does not run upstream setup or edit registry/client configuration.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function readRegular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('通信配置必须是普通文件');return fs.readFileSync(file);}
function readManifest(bytes){
 const value=JSON.parse(bytes.toString('utf8'));
 if(value.name!=='com.opencli.mcp'||value.type!=='stdio'||typeof value.path!=='string'||!value.path||!Array.isArray(value.allowed_origins)||value.allowed_origins.some(origin=>!/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin)))throw Error('不是有效的官方 MCP 通信配置');
 return value;
}
export function planAccess(file,extensionId,{launcher}={}){
 if(!/^[a-p]{32}$/.test(extensionId))throw Error('扩展 ID 无效，必须使用扩展管理页实际显示的 ID');
 file=path.resolve(file);const before=readRegular(file),manifest=readManifest(before),origin=`chrome-extension://${extensionId}/`;
 if(launcher!==undefined){
  if(typeof launcher!=='string'||!path.isAbsolute(launcher))throw Error('运行时启动器必须为本机绝对路径');
  readRegular(launcher);
  if(process.platform!=='win32')fs.accessSync(launcher,fs.constants.X_OK);
 }
 const origins=manifest.allowed_origins.includes(origin)?manifest.allowed_origins:[...manifest.allowed_origins,origin];
 const changed=origins!==manifest.allowed_origins||(launcher!==undefined&&launcher!==manifest.path);
 const after=changed?Buffer.from(JSON.stringify({...manifest,path:launcher??manifest.path,allowed_origins:origins},null,2)+'\n'):before;
 return {file,extensionId,changed,beforeSha256:hash(before),afterSha256:hash(after),beforeBase64:before.toString('base64'),afterBase64:after.toString('base64')};
}
function replaceChecked(file,expected,bytes){
 const temporary=file+'.'+crypto.randomUUID()+'.tmp';
 try{
  fs.writeFileSync(temporary,bytes,{flag:'wx',mode:fs.statSync(file).mode&0o777});
  if(hash(readRegular(file))!==expected)throw Error('通信配置已被其他操作修改，停止覆盖');
  fs.renameSync(temporary,file);
 }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
function locked(file,work){
 const lock=file+'.hunter.lock';const fd=fs.openSync(lock,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));return work();}finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export function applyAccess({file,extensionId,receipt,launcher}){
 file=path.resolve(file);receipt=path.resolve(receipt);
 if(file===receipt)throw Error('备份不能覆盖通信配置');
 return locked(file,()=>{
  const plan=planAccess(file,extensionId,{launcher});
  // Durable original bytes precede mutation; never overwrite an earlier backup.
  const fd=fs.openSync(receipt,'wx',0o600);
  try{fs.writeFileSync(fd,JSON.stringify({schemaVersion:1,...plan},null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  if(plan.changed)replaceChecked(file,plan.beforeSha256,Buffer.from(plan.afterBase64,'base64'));
  return {file,receipt,changed:plan.changed,afterSha256:plan.afterSha256};
 });
}
export function restoreAccess(receipt){
 const plan=JSON.parse(readRegular(receipt));
 if(plan.schemaVersion!==1||typeof plan.file!=='string'||!path.isAbsolute(plan.file)||typeof plan.changed!=='boolean')throw Error('备份格式无效');
 const before=Buffer.from(plan.beforeBase64??'','base64'),after=Buffer.from(plan.afterBase64??'','base64');
 if(hash(before)!==plan.beforeSha256||hash(after)!==plan.afterSha256)throw Error('备份校验失败');
 readManifest(before);readManifest(after);
 return locked(plan.file,()=>{
  const current=hash(readRegular(plan.file));
  if(current===plan.beforeSha256)return {restored:false,alreadyOriginal:true};
  if(current!==plan.afterSha256)throw Error('通信配置存在后续修改，不能自动恢复旧备份');
  replaceChecked(plan.file,plan.afterSha256,before);return {restored:true};
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [mode,file,extensionId,receipt,launcher]=process.argv.slice(2);
 if(mode==='plan'){const {beforeBase64,afterBase64,...summary}=planAccess(file,extensionId);console.log(JSON.stringify(summary,null,2));}
 else if(mode==='apply')console.log(JSON.stringify(applyAccess({file,extensionId,receipt}),null,2));
 else if(mode==='plan-runtime'){if(!receipt)throw Error('必须明确提供运行时启动器路径');const {beforeBase64,afterBase64,...summary}=planAccess(file,extensionId,{launcher:receipt});console.log(JSON.stringify({...summary,launcher:receipt},null,2));}
 else if(mode==='apply-runtime'){
  if(!launcher)throw Error('必须明确提供运行时启动器路径');
  console.log(JSON.stringify(applyAccess({file,extensionId,receipt,launcher}),null,2));
 }
 else if(mode==='restore')console.log(JSON.stringify(restoreAccess(file),null,2));
 else throw Error('用法：native-access.mjs plan <现有manifest> <扩展ID> | apply <现有manifest> <扩展ID> <新备份文件> | plan-runtime <manifest> <扩展ID> <启动器> | apply-runtime <manifest> <扩展ID> <新备份文件> <启动器> | restore <备份文件>');
}
