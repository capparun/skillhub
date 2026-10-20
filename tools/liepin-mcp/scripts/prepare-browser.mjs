// Prepare stable browser assets only. No Chrome, registry or client mutations.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {build} from '../build-extension.mjs';
import {buildNativeLauncher,verifyNativeLauncher} from './build-native-launcher.mjs';
import {verifyPreparedRuntime} from './verify-prepared-runtime.mjs';
import {COMPAT_EXTENSION_ID} from '../lib/compat-build.mjs';
function exists(file){try{fs.lstatSync(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function inventory(root){const files=[];const walk=(dir,prefix='')=>{for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name),relative=prefix+name,stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('浏览器资产不允许链接');if(stat.isDirectory())walk(file,relative+'/');else if(stat.isFile())files.push({path:relative,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});else throw Error('浏览器资产文件类型无效');}};walk(root);return files;}
export function prepareBrowserAssets(directory,root,{onProgress=()=>{}}={}){
 onProgress('asset-runtime-verify');
 directory=fs.realpathSync(directory);root=path.resolve(root);const verified=verifyPreparedRuntime(directory);
 if(exists(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('浏览器资产目录不能是链接');fs.mkdirSync(root,{recursive:true,mode:0o700});root=fs.realpathSync(root);
 const lock=path.join(root,'prepare-browser.lock'),fd=fs.openSync(lock,'wx',0o600);let temporary;
 try{
  temporary=fs.mkdtempSync(path.join(root,'extension-build-'));const generated=path.join(temporary,'extension');
  onProgress('asset-extension-build');
  build(path.join(directory,'node_modules/opencli-mcp/extension/dist'),generated);
  onProgress('asset-extension-built');
  fs.copyFileSync(path.join(directory,'node_modules/opencli-mcp/LICENSE'),path.join(generated,'UPSTREAM-LICENSE.txt'),fs.constants.COPYFILE_EXCL);
  onProgress('asset-inventory');
  const files=inventory(generated),extension=path.join(root,'extension');
  if(exists(extension)){if(fs.lstatSync(extension).isSymbolicLink()||JSON.stringify(inventory(extension))!==JSON.stringify(files))throw Error('已有兼容扩展与当前构建不同，未覆盖；先核对升级计划');}
  else fs.renameSync(generated,extension);
  onProgress('asset-native-launcher');
  const nodeId=crypto.createHash('sha256').update(process.execPath).digest('hex').slice(0,12),hosts=path.join(root,'hosts');fs.mkdirSync(hosts,{recursive:true});
  if(fs.lstatSync(hosts).isSymbolicLink())throw Error('宿主目录不能是链接');
  const host=path.join(hosts,verified.sourceFingerprint+'-'+nodeId);
  const native=exists(host)?verifyNativeLauncher(host):buildNativeLauncher(directory,host);
  const receipt={sourceFingerprint:verified.sourceFingerprint,directory,launcher:native.launcher,extension,expectedExtensionId:COMPAT_EXTENSION_ID,mcpServer:{command:process.execPath,args:[path.join(path.dirname(native.launcher),'dispatch.mjs'),'stdio']},skillDirectory:path.join(directory,'tools/liepin-mcp/skill/hunter-liepin-mcp'),extensionFiles:files,chromeLoaded:false,browserRegistered:false,note:'稳定扩展路径和公开key使跨版本/系统使用相同扩展身份；仍须加载并核对Chrome实际ID，未自动启用扩展或注册通信'};
  onProgress('asset-complete');
  return receipt;
 }finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});fs.closeSync(fd);fs.unlinkSync(lock);}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==5)throw Error('用法：prepare-browser.mjs VERSION_DIR BROWSER_ROOT RECEIPT.json');
 const receipt=prepareBrowserAssets(process.argv[2],process.argv[3]);fs.writeFileSync(process.argv[4],JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(receipt,null,2));
}
