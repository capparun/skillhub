import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const fingerprint=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function regular(file){if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('需要普通文件：'+file);}
export function verifyPackage(source,expected){
 if(!fingerprint(expected))throw Error('需要发布清单中候选源码指纹，不能拿安装脚本哈希代替');
 const root=fs.realpathSync(source),manifestFile=path.join(root,'manifest.json');regular(manifestFile);
 const manifest=JSON.parse(fs.readFileSync(manifestFile));
 if(!Array.isArray(manifest.files)||manifest.sourceFingerprint!==expected||sha(JSON.stringify(manifest.files))!==expected)throw Error('候选清单指纹不一致');
 const seen=new Set();
 for(const file of manifest.files){
  if(typeof file.path!=='string'||path.isAbsolute(file.path)||file.path.includes('\\')||file.path.split('/').some(part=>!part||part==='.'||part==='..')||seen.has(file.path)||!fingerprint(file.sha256))throw Error('候选文件路径或哈希无效');
  seen.add(file.path);const target=path.join(root,file.path);regular(target);
  if(!fs.realpathSync(target).startsWith(root+path.sep))throw Error('候选文件越界');
  const data=fs.readFileSync(target);if(data.length!==file.bytes||sha(data)!==file.sha256)throw Error('候选文件校验失败：'+file.path);
 }
 for(const required of ['package.json','package-lock.json',manifest.delivery==='site-adapter'?'tools/liepin-mcp/local.mjs':'tools/liepin-mcp/server.mjs'])if(!seen.has(required))throw Error('缺少必要入口');
 return {root,manifest};
}
function atomicJson(file,value){const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});try{fs.renameSync(temp,file);}catch(error){fs.unlinkSync(temp);throw error;}}
function slot(root,id){if(!fingerprint(id))throw Error('版本指纹无效');const target=path.join(root,'versions',id);if(fs.lstatSync(target).isSymbolicLink()||!fs.realpathSync(target).startsWith(fs.realpathSync(root)+path.sep))throw Error('版本目录越界');return target;}
export function npmCommand({execPath=process.execPath,platform=process.platform,exists=fs.existsSync}={}){
 const paths=platform==='win32'?path.win32:path.posix;
 const candidates=[paths.join(paths.dirname(execPath),'node_modules/npm/bin/npm-cli.js'),paths.resolve(paths.dirname(execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
 const cli=candidates.find(file=>exists(file));
 if(cli)return {command:execPath,prefix:[cli]};
 if(platform==='win32')throw Error('未找到Node配套npm-cli.js；请修复Node安装，不通过shell猜测执行');
 return {command:'npm',prefix:[]};
}
function probe(directory){
 const adapter=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))).delivery==='site-adapter';
 const request={jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'liepin_doctor',arguments:{}}};
 const result=spawnSync(process.execPath,adapter?[path.join(directory,'tools/liepin-mcp/local.mjs'),'doctor']:[path.join(directory,'tools/liepin-mcp/server.mjs')],{cwd:directory,input:JSON.stringify(request)+'\n',encoding:'utf8',timeout:20000,env:{...process.env,HUNTER_MCP_COMMAND:'',NODE_PATH:''}});
 if(result.error||result.status!==0)throw Error('候选诊断进程失败：'+(result.error?.message??result.stderr));
 const response=JSON.parse(result.stdout.trim());if(response.result?.isError)throw Error('候选诊断返回失败');
 const value=adapter?response:JSON.parse(response.result.content[0].text);if(value.status!=='local-prerequisites-ready')throw Error('候选依赖尚未就绪');
 const entry=value.checks.find(c=>c.name==='command')?.path;
 if(!entry?.startsWith(fs.realpathSync(path.join(directory,'node_modules'))+path.sep))throw Error('诊断未使用候选内固定依赖');
 return value;
}
function stageUnlocked({source,root,expected},{installDependencies}={}){
 const verified=verifyPackage(source,expected);root=path.resolve(root);
 for(const target of [root,path.join(root,'versions')])if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw Error('安装目录不能是符号链接');
 fs.mkdirSync(path.join(root,'versions'),{recursive:true});
 const directory=path.join(root,'versions',expected);if(fs.existsSync(directory))throw Error('此版本已存在，不覆盖');fs.mkdirSync(directory,{mode:0o700});
 try{
  for(const file of verified.manifest.files){const target=path.join(directory,file.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(verified.root,file.path),target,fs.constants.COPYFILE_EXCL);}
  fs.copyFileSync(path.join(verified.root,'manifest.json'),path.join(directory,'manifest.json'),fs.constants.COPYFILE_EXCL);
  verifyPackage(directory,expected);
  if(installDependencies)installDependencies(directory);
  else{
   const npm=npmCommand();
   const result=spawnSync(npm.command,[...npm.prefix,'ci','--ignore-scripts','--registry=https://registry.npmjs.org','--cache='+path.join(root,'npm-cache')],{cwd:directory,encoding:'utf8',timeout:120000});
   if(result.error||result.status!==0)throw Error('依赖安装失败：'+(result.error?.message??result.stderr));
  }
  const diagnosis=probe(directory);atomicJson(path.join(directory,'install-receipt.json'),{fingerprint:expected,status:'ready',node:process.execPath,diagnosis,installedAt:new Date().toISOString()});
  return {root,directory,fingerprint:expected,status:'ready',activated:false};
 }catch(error){atomicJson(path.join(directory,'install-receipt.json'),{fingerprint:expected,status:'failed',error:error.message});throw error;}
}
function selectUnlocked({root,id}){
 root=path.resolve(root);const directory=slot(root,id);verifyPackage(directory,id);
 const receipt=JSON.parse(fs.readFileSync(path.join(directory,'install-receipt.json')));if(receipt.status!=='ready'||receipt.fingerprint!==id)throw Error('只能切换到已验证版本');
 probe(directory);
 const launcher=path.join(root,'launch.mjs'),launcherSource=fs.readFileSync(new URL('./launch-installed.mjs',import.meta.url));
 if(fs.existsSync(launcher)){regular(launcher);if(!fs.readFileSync(launcher).equals(launcherSource))throw Error('安装根目录已有不同启动器，不覆盖');}
 else fs.writeFileSync(launcher,launcherSource,{flag:'wx',mode:0o600});
 const file=path.join(root,'current.json'),previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
 const selected={fingerprint:id,previousFingerprint:previous?.fingerprint??null,...(JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))).delivery==='site-adapter'?{localCommand:{command:process.execPath,args:[launcher]},browserSetup:'pending-official-adapter-runtime-and-extension-verification'}:{mcpServers:{'hunter-liepin':{command:process.execPath,args:[launcher]}}}),selectedAt:new Date().toISOString()};
 atomicJson(file,selected);return {file,...selected};
}
function withInstallLock(root,work){
 if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('安装目录不能是符号链接');
 fs.mkdirSync(root,{recursive:true});const lock=path.join(root,'install.lock'),fd=fs.openSync(lock,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return work();}
 finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
export function stageInstall(args,deps){verifyPackage(args.source,args.expected);return withInstallLock(path.resolve(args.root),()=>stageUnlocked(args,deps));}
export function selectVersion(args){if(!fs.existsSync(args.root))throw Error('安装根目录不存在');return withInstallLock(path.resolve(args.root),()=>selectUnlocked(args));}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const [mode,root,input,expected]=process.argv.slice(2);
 if(mode==='install')console.log(JSON.stringify(stageInstall({root,source:input,expected}),null,2));
 else if(mode==='select')console.log(JSON.stringify(selectVersion({root,id:input}),null,2));
 else throw Error('用法：install-package.mjs install <安装根目录> <候选目录> <源码指纹> 或 select <安装根目录> <已安装指纹>。select仅更新安装根目录current.json，不改客户端全局配置。');
}
