// Scope: an isolated candidate installation only. No global Native Messaging setup.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyPackage} from './install-package.mjs';
export async function prepareAdapterRuntime(directory){
 directory=fs.realpathSync(directory);
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
 verifyPackage(directory,manifest.sourceFingerprint);
 if(manifest.delivery!=='site-adapter')throw Error('仅支持隔离 Adapter 候选包');
 const upstream=path.join(directory,'node_modules/opencli-mcp');
 if(!fs.realpathSync(upstream).startsWith(directory+path.sep))throw Error('禁止修改安装目录之外的官方包');
 const adapters=path.join(upstream,'adapters/liepin');
 if(fs.existsSync(adapters))throw Error('已有猎聘 Adapter，不覆盖');
 const receipt=path.join(directory,'adapter-runtime-receipt.json');
 if(fs.existsSync(receipt))throw Error('已有准备记录，不重复修改');
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'hunter-adapter-patch-'));
 const changes=[];
 try{
  const output=path.join(temporary,'patch');
  execFileSync(process.execPath,[fileURLToPath(new URL('./build-adapter-runtime-patch.mjs',import.meta.url)),upstream,output]);
  const patch=JSON.parse(fs.readFileSync(path.join(output,'patch-manifest.json')));
  for(const item of patch.files){
   const target=path.join(upstream,item.path),before=fs.existsSync(target)?fs.readFileSync(target):null;
   if(item.originalSha256===null&&before)throw Error('辅助模块已存在');
   changes.push({target,before});fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(output,item.path),target);
  }
  fs.mkdirSync(adapters,{recursive:true});
  const source=path.join(directory,'tools/liepin-mcp/adapters/liepin');
  for(const name of fs.readdirSync(source).filter(n=>n.endsWith('.js'))){
   let relative=path.relative(adapters,path.join(source,name)).split(path.sep).join('/');if(!relative.startsWith('.'))relative='./'+relative;
   fs.writeFileSync(path.join(adapters,name),`export {default} from ${JSON.stringify(relative)};\n`,{flag:'wx'});
  }
  const {SiteRegistry}=await import(pathToFileURL(path.join(upstream,'dist/src/sites/loader.js')));
  const registry=new SiteRegistry([{dir:path.join(upstream,'adapters'),kind:'builtin'}]);
  const names=fs.readdirSync(source).filter(n=>n.endsWith('.js')).map(n=>n.slice(0,-3));
  for(const name of names)await registry.resolve('liepin',name);
  const files=[...patch.files.map(i=>path.join(upstream,i.path)),...fs.readdirSync(adapters).map(n=>path.join(adapters,n))].map(file=>({path:path.relative(directory,file).split(path.sep).join('/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}));
  const result={status:'prepared-not-connected',sourceFingerprint:manifest.sourceFingerprint,adapters:names,files,browserVerified:false,nativeMessagingChanged:false};
  fs.writeFileSync(receipt,JSON.stringify(result,null,2),{flag:'wx'});return result;
 }catch(error){
  if(fs.existsSync(adapters))fs.rmSync(adapters,{recursive:true});
  for(const {target,before} of changes.reverse()){if(before)fs.writeFileSync(target,before);else if(fs.existsSync(target))fs.unlinkSync(target);}
  throw error;
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)console.log(JSON.stringify(await prepareAdapterRuntime(process.argv[2]),null,2));
