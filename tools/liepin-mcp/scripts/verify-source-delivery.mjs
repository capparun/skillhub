// Rebuild and test a clean, task-owned source snapshot without private evidence.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import{fileURLToPath}from 'node:url';import{spawnSync}from 'node:child_process';import{buildPackage}from './build-package.mjs';import{npmCommand}from './install-package.mjs';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export function snapshotSource(root){
 if(fs.existsSync(root))throw Error('源码快照目录已存在，不覆盖');fs.mkdirSync(root,{recursive:true,mode:0o700});const files=[];
 const copy=relative=>{const source=path.join(sourceRoot,relative),stat=fs.lstatSync(source);if(stat.isSymbolicLink()||!stat.isFile())throw Error('源码快照仅接受普通文件');const data=fs.readFileSync(source),target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx',mode:0o600});files.push({path:relative,sha256:crypto.createHash('sha256').update(data).digest('hex')});};
 const walk=relative=>{for(const name of fs.readdirSync(path.join(sourceRoot,relative)).sort()){
  if(['node_modules','.git','evidence','output','versions','.liepin-install-state'].includes(name))continue;
  const entry=path.posix.join(relative,name),stat=fs.lstatSync(path.join(sourceRoot,entry));if(stat.isSymbolicLink())throw Error('源码目录包含链接');if(stat.isDirectory())walk(entry);else if(name==='LICENSE'||/\.(mjs|js|json|md|yml|yaml|ps1|sh|ts)$/.test(name)){if(/^(?:task|scope|.*receipt|.*evidence)\.json$/i.test(name))throw Error('源码目录出现运行时私有文件：'+entry);copy(entry);}
 }};
 walk('tools/liepin-mcp');walk('distribution/liepin-search');for(const file of ['.github/workflows/liepin-adapter-platforms.yml','docs/prds/PRD-2026-Hunter-猎聘寻访能力.md','docs/prds/LIEPIN_MCP_REQUIREMENTS_MATRIX.md'])copy(file);
 return files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
}
export function verifySourceDelivery(report){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'liepin-source-delivery-'))),source=path.join(root,'source'),files=snapshotSource(source),result={root,source,files,privateEvidenceCopied:false,status:'started'};
 const run=(command,args,cwd,label)=>{const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});fs.writeFileSync(path.join(root,label+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});if(r.error||r.status!==0)throw Error(label+'失败：'+(r.error?.message??'详见任务日志'));return r.stdout;};
 try{
  const original=buildPackage(path.join(root,'original-package'),{delivery:'site-adapter'});
  const output=run(process.execPath,[path.join(source,'tools/liepin-mcp/scripts/build-package.mjs'),path.join(root,'rebuilt-package'),'site-adapter'],source,'rebuild');
  const rebuilt=JSON.parse(output);if(original.sourceFingerprint!==rebuilt.sourceFingerprint)throw Error('独立源码重建指纹不同');result.fingerprint=rebuilt.sourceFingerprint;
  const runtime=path.join(source,'distribution/liepin-search/runtime'),npm=npmCommand();run(npm.command,[...npm.prefix,'ci','--ignore-scripts','--registry=https://registry.npmjs.org','--cache='+path.join(root,'npm-cache')],runtime,'dependencies');
  const mcp=run(process.execPath,['tools/liepin-mcp/scripts/test.mjs'],source,'mcp-tests');
  const testRoot=path.join(runtime,'packages/liepin/test'),tests=fs.readdirSync(testRoot).filter(n=>n.endsWith('.test.js')).sort().map(n=>path.join(testRoot,n));
  const core=run(process.execPath,['--test',...tests],source,'core-tests');
  const count=text=>Number(text.match(/^# pass (\d+)$/m)?.[1]);result.tests={mcp:count(mcp),core:count(core)};if(!result.tests.mcp||!result.tests.core)throw Error('缺少完整测试通过计数');result.status='passed';
 }catch(error){result.status='failed';result.error=error.message;throw error;}finally{fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}return result;
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){const r=verifySourceDelivery(path.resolve(process.argv[2]));console.log(JSON.stringify({status:r.status,source:r.source,files:r.files.length,fingerprint:r.fingerprint,tests:r.tests}));}
