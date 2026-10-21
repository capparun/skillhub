// Complete Next source snapshot; this is not a Git scope approval or deployment.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';import{npmCommand,NPM_INSTALL_TIMEOUT_MS}from'./install-package.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
export function verifySiteSource(report){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'liepin-next-source-'))),source=path.join(root,'source');fs.mkdirSync(source);const files=[];
 const copy=relative=>{const from=path.join(repo,relative),stat=fs.lstatSync(from);if(!stat.isFile()||stat.isSymbolicLink())throw Error('只接受普通源码文件');const bytes=fs.readFileSync(from),to=path.join(source,relative);fs.mkdirSync(path.dirname(to),{recursive:true});fs.writeFileSync(to,bytes,{flag:'wx',mode:0o600});files.push({path:relative,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});};
 const walk=relative=>{for(const name of fs.readdirSync(path.join(repo,relative)).sort()){if(relative==='public'&&name==='download')continue;const next=path.posix.join(relative,name),stat=fs.lstatSync(path.join(repo,next));if(stat.isSymbolicLink())throw Error('源码树包含链接');if(stat.isDirectory())walk(next);else copy(next);}};
 for(const dir of ['src','db','public'])walk(dir);
 for(const file of ['package.json','package-lock.json','next.config.ts','tsconfig.json','eslint.config.mjs','skillhub.Dockerfile','scripts/migrate.mjs','scripts/deploy-zeabur.sh','scripts/publish-liepin-release.mjs','scripts/rollback-liepin-release.mjs','scripts/lib/liepin-release-guard.mjs','tests/liepin-guide.test.ts','tests/liepin-install-preflight.test.ts','tests/liepin-installer-data.test.ts','tests/liepin-publication.test.ts','tests/liepin-release-guard.test.ts'])copy(file);
 const result={root,source,status:'started',files,scope:'完整当前Next源码集成验证；保留其他产品页面，不表示混合改动已获发布审核',publicDownloadArtifactsCopied:false,privateRuntimeCopied:false,deployed:false};
 const run=(command,args,label)=>{const r=spawnSync(command,args,{cwd:source,encoding:'utf8',timeout:NPM_INSTALL_TIMEOUT_MS,maxBuffer:16*1024*1024,env:{...process.env,DATABASE_URL:'',TEST_DATABASE_URL:'',NEXT_TELEMETRY_DISABLED:'1'}});fs.writeFileSync(path.join(root,label+'.log'),(r.stdout??'')+(r.stderr??''),{mode:0o600});if(r.error||r.status!==0)throw Error(label+'失败，详见任务日志');return r.stdout;};
 try{
  const npm=npmCommand();run(npm.command,[...npm.prefix,'ci','--ignore-scripts','--registry=https://registry.npmjs.org','--cache='+path.join(root,'npm-cache')],'dependencies');
  const tests=files.filter(f=>f.path.startsWith('tests/')).map(f=>f.path);const testOutput=run(process.execPath,['--import','tsx','--test',...tests],'targeted-tests');result.tests={passed:Number(testOutput.match(/^# pass (\d+)$/m)?.[1]),failed:Number(testOutput.match(/^# fail (\d+)$/m)?.[1])};
  run(npm.command,[...npm.prefix,'run','build'],'production-build');result.build='passed';result.status='passed';
 }catch(error){result.status='failed';result.error=error.message;throw error;}finally{fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});}
 return result;
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3)throw Error('用法：verify-site-source.mjs REPORT.json');const r=verifySiteSource(path.resolve(process.argv[2]));console.log(JSON.stringify({status:r.status,files:r.files.length,source:r.source,tests:r.tests,build:r.build,deployed:false}));}
