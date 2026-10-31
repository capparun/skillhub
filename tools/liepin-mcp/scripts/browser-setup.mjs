import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {verifyPreparedRuntime} from './verify-prepared-runtime.mjs';import {createWindowsNativeRegistry} from './windows-native-registry.mjs';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function regular(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('需要普通文件：'+file);return fs.readFileSync(file);}
function exists(file){try{fs.lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function fileState(file){return exists(file)?hash(regular(file)):null;}
function platformOf(deps){const platform=deps.platform??process.platform;if(!['darwin','win32'].includes(platform))throw Error('浏览器安装仅支持macOS和Windows');return platform;}
function host(bytes){const value=JSON.parse(bytes);if(value.name!=='com.opencli.mcp'||value.type!=='stdio'||typeof value.path!=='string'||!path.isAbsolute(value.path)||!Array.isArray(value.allowed_origins)||value.allowed_origins.some(v=>!/^chrome-extension:\/\/[a-p]{32}\/$/.test(v)))throw Error('不是有效的Chrome MCP通信清单');return value;}
function registryOf(platform,deps){return platform==='win32'?(deps.registry??createWindowsNativeRegistry()):null;}
function checkRuntime(plan,deps){const verified=(deps.verifyRuntime??verifyPreparedRuntime)(plan.directory);if(verified.sourceFingerprint!==plan.sourceFingerprint)throw Error('候选版本已变化，重新预览安装计划');if(hash(regular(plan.launcher))!==plan.launcherSha256)throw Error('启动器已变化，重新预览安装计划');if(platformOf(deps)!==plan.platform)throw Error('计划系统与当前系统不一致');}
function checkedParent(file){let parent=path.dirname(file);while(true){if(exists(parent)&&fs.lstatSync(parent).isSymbolicLink())throw Error('通信目录不能经过符号链接');const next=path.dirname(parent);if(next===parent)break;parent=next;}}
function replace(file,expected,bytes){if(fileState(file)!==expected)throw Error('通信清单存在后续修改，不能覆盖');const temp=file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,bytes,{flag:'wx',mode:0o600});if(fileState(file)!==expected)throw Error('通信清单存在后续修改，不能覆盖');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function lock(file,work){checkedParent(file);fs.mkdirSync(path.dirname(file),{recursive:true});const lock=file+'.hunter-setup.lock',fd=fs.openSync(lock,'wx',0o600);try{return work();}finally{fs.closeSync(fd);fs.unlinkSync(lock);}}
function writeReceipt(file,data,first=false){if(first){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}else replace(file,fileState(file),Buffer.from(JSON.stringify(data,null,2)+'\n'));}
export function planBrowserSetup({directory,launcher,extensionId,expectedExtensionId,manifest,home=os.homedir()},deps={}){
 const platform=platformOf(deps),registry=registryOf(platform,deps),registryBefore=registry?.read()??null;
 if(!/^[a-p]{32}$/.test(extensionId??''))throw Error('扩展ID必须来自实际加载的兼容扩展');
 if(expectedExtensionId&&extensionId!==expectedExtensionId)throw Error('Chrome扩展ID与准备资产的公开身份不一致');
 directory=fs.realpathSync(directory);launcher=path.resolve(launcher);const launcherBytes=regular(launcher);
 if(platform==='darwin')fs.accessSync(launcher,fs.constants.X_OK);
 const built=JSON.parse(regular(path.join(path.dirname(launcher),'launcher-receipt.json')));
 const verified=(deps.verifyRuntime??verifyPreparedRuntime)(directory);
 if(built.directory!==directory||built.launcher!==launcher||built.sourceFingerprint!==verified.sourceFingerprint)throw Error('启动器与已验证候选不对应');
 manifest=manifest??(platform==='win32'?(registryBefore.hasDefault?registryBefore.value:path.join(home,'AppData','Local','HunterLiepin','NativeMessagingHosts','com.opencli.mcp.json')):path.join(home,'Library','Application Support','Google','Chrome','NativeMessagingHosts','com.opencli.mcp.json'));
 if(!path.isAbsolute(manifest)||path.basename(manifest)!=='com.opencli.mcp.json')throw Error('必须指定Chrome通信清单的绝对路径');
 manifest=path.resolve(manifest);
 if(platform==='darwin')for(const alias of ['/var','/tmp']){if(manifest.startsWith(alias+'/')&&exists(alias)&&fs.lstatSync(alias).isSymbolicLink()&&fs.realpathSync(alias)==='/private'+alias)manifest=fs.realpathSync(alias)+manifest.slice(alias.length);}
 checkedParent(manifest);
 const before=exists(manifest)?regular(manifest):null;
 const original=before?host(before):{name:'com.opencli.mcp',description:'Hunter Liepin compatible browser host',type:'stdio',path:launcher,allowed_origins:[]};
 const origin=`chrome-extension://${extensionId}/`,after=Buffer.from(JSON.stringify({...original,path:launcher,allowed_origins:[...new Set([...original.allowed_origins,origin])]},null,2)+'\n');
 return {schemaVersion:1,kind:before?'upgrade':'first-install',platform,manifest,directory,launcher,sourceFingerprint:verified.sourceFingerprint,launcherSha256:hash(launcherBytes),extensionId,beforeBase64:before?.toString('base64')??null,beforeSha256:before?hash(before):null,afterBase64:after.toString('base64'),afterSha256:hash(after),registryBefore,browserVerified:false,notes:['仅准备通信接入，不加载扩展、不修改客户端配置、不证明连接或猎聘业务通过','保持旧版本目录与回滚收据，浏览器需重新连接才能使用新宿主']};
}
function validatePlan(plan){if(plan.schemaVersion!==1||!['darwin','win32'].includes(plan.platform)||!path.isAbsolute(plan.manifest??'')||path.basename(plan.manifest)!=='com.opencli.mcp.json')throw Error('浏览器安装计划无效');const after=Buffer.from(plan.afterBase64??'','base64');if(hash(after)!==plan.afterSha256||host(after).path!==plan.launcher||!host(after).allowed_origins.includes(`chrome-extension://${plan.extensionId}/`))throw Error('计划清单校验失败');if(plan.beforeBase64!==null){const before=Buffer.from(plan.beforeBase64??'','base64');if(hash(before)!==plan.beforeSha256)throw Error('原始清单校验失败');host(before);}else if(plan.beforeSha256!==null)throw Error('原始清单状态不一致');}
export function applyBrowserSetup({plan,receipt},deps={}){
 validatePlan(plan);checkRuntime(plan,deps);receipt=path.resolve(receipt);if(receipt===plan.manifest)throw Error('收据不能覆盖通信清单');const registry=registryOf(plan.platform,deps);
 return lock(plan.manifest,()=>{
  if(fileState(plan.manifest)!==plan.beforeSha256||registry&&!equal(registry.read(),plan.registryBefore))throw Error('预览后通信配置已变化，重新预览');
  const record={schemaVersion:1,plan,phase:'backed-up',createdAt:new Date().toISOString()};writeReceipt(receipt,record,true);
  try{replace(plan.manifest,plan.beforeSha256,Buffer.from(plan.afterBase64,'base64'));record.phase='manifest-written';writeReceipt(receipt,record);
   if(registry){record.registryAfter=registry.set(plan.manifest);if(!record.registryAfter.hasDefault||record.registryAfter.value!==plan.manifest)throw Error('注册表写入未确认');}
   record.phase='applied';writeReceipt(receipt,record);return {status:'browser-registration-applied',manifest:plan.manifest,receipt,sourceFingerprint:plan.sourceFingerprint,browserVerified:false,reconnectRequired:true};
  }catch(error){record.phase='failed';record.error=error.message;writeReceipt(receipt,record);throw Error('浏览器接入未完成；原始配置已保存于 '+receipt+'：'+error.message);}
 });
}
export function restoreBrowserSetup(receipt,deps={}){
 const record=JSON.parse(regular(receipt)),plan=record.plan;validatePlan(plan);if(platformOf(deps)!==plan.platform)throw Error('回滚系统不一致');const registry=registryOf(plan.platform,deps);
 return lock(plan.manifest,()=>{
  const current=fileState(plan.manifest),registration=registry?.read()??null;
  if(current===plan.beforeSha256&&(!registry||equal(registration,plan.registryBefore)))return {restored:false,alreadyOriginal:true};
  if(current!==plan.afterSha256)throw Error('通信清单存在后续修改，停止回滚');
  if(registry){const expected=record.registryAfter??{...plan.registryBefore,exists:true,hasDefault:true,value:plan.manifest,kind:'String'};if(!equal(registration,expected)&&!equal(registration,plan.registryBefore))throw Error('注册表存在后续修改，停止回滚');if(!equal(registration,plan.registryBefore)){registry.restore(plan.registryBefore);if(!equal(registry.read(),plan.registryBefore))throw Error('注册表恢复未确认，保留通信清单');}}
  if(plan.beforeBase64===null){if(fileState(plan.manifest)!==plan.afterSha256)throw Error('通信清单存在后续修改');fs.unlinkSync(plan.manifest);}else replace(plan.manifest,plan.afterSha256,Buffer.from(plan.beforeBase64,'base64'));
  record.phase='restored';record.restoredAt=new Date().toISOString();writeReceipt(receipt,record);return {restored:true};
 });
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,input,output,planFile]=process.argv.slice(2);
 if(mode==='plan'){if(!output)throw Error('plan需要输入JSON和新的计划文件路径');const values=JSON.parse(regular(input));const destination=planFile??output;const plan=planBrowserSetup({...values,...(planFile?{extensionId:output}:{})});fs.writeFileSync(destination,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({plan:destination,kind:plan.kind,platform:plan.platform,manifest:plan.manifest,sourceFingerprint:plan.sourceFingerprint,notes:plan.notes},null,2));}
 else if(mode==='apply'){if(!output)throw Error('apply需要计划JSON和新的回滚收据路径');console.log(JSON.stringify(applyBrowserSetup({plan:JSON.parse(regular(input)),receipt:output}),null,2));}
 else if(mode==='restore')console.log(JSON.stringify(restoreBrowserSetup(input),null,2));
 else throw Error('用法：browser-setup.mjs plan INPUT.json PLAN.json | plan ASSETS.json CHROME_EXTENSION_ID PLAN.json | apply PLAN.json RECEIPT.json | restore RECEIPT.json');
}
