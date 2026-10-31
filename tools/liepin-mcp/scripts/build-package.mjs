import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
export function buildPackage(output,{delivery='prototype',releaseVersion}={}){
 if(releaseVersion!==undefined&&(delivery!=='site-adapter'||typeof releaseVersion!=='string'||!/^0\.3\.(0|[1-9]\d{0,5})$/.test(releaseVersion)))throw Error('正式候选仅接受Site Adapter的0.3.x版本');
 if(!['prototype','site-adapter'].includes(delivery))throw Error('未知交付类型');
 const root=path.resolve(output);if(fs.existsSync(root))throw Error('候选目录已存在，不覆盖');
 fs.mkdirSync(root,{recursive:true});const files=[];
 const copy=(relative)=>{
  const source=path.join(sourceRoot,relative),stat=fs.lstatSync(source);if(!stat.isFile()||stat.isSymbolicLink())throw Error('只允许普通源码文件：'+relative);
  const data=fs.readFileSync(source),target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx',mode:0o644});files.push({path:relative,sha256:hash(data),bytes:data.length});
 };
 const walk=(relative,extensions)=>{
  for(const name of fs.readdirSync(path.join(sourceRoot,relative)).sort()){
   const entry=path.posix.join(relative,name),stat=fs.lstatSync(path.join(sourceRoot,entry));
   if(stat.isSymbolicLink())throw Error('候选源码不能包含链接：'+entry);
   if(stat.isDirectory())walk(entry,extensions);else if(extensions.some(ext=>name.endsWith(ext)))copy(entry);
  }
 };
 if(delivery==='prototype')copy('tools/liepin-mcp/server.mjs');
 copy('tools/liepin-mcp/local.mjs');
 copy('tools/liepin-mcp/build-extension.mjs');
 copy('tools/liepin-mcp/scripts/prepare-browser.mjs');
 walk('tools/liepin-mcp/adapters',['.js']);walk('tools/liepin-mcp/compat',['.mjs']);
 copy('tools/liepin-mcp/scripts/build-adapter-runtime-patch.mjs');
 copy('tools/liepin-mcp/scripts/prepare-adapter-runtime.mjs');
 copy('tools/liepin-mcp/scripts/verify-prepared-runtime.mjs');
 walk('tools/liepin-mcp/lib',['.mjs']);
 walk('tools/liepin-mcp/skill',['.md']);
 copy('tools/liepin-mcp/scripts/customer-install.mjs');
 copy('distribution/liepin-search/target-distribution.mjs');
 copy('distribution/liepin-search/directory-distribution.mjs');
 if(delivery==='site-adapter'){
  const generated=(name,code)=>{fs.writeFileSync(path.join(root,name),code,{flag:'wx',mode:0o644});files.push({path:name,sha256:hash(Buffer.from(code)),bytes:Buffer.byteLength(code)});};
  generated('install.mjs',`import {installCustomer} from './tools/liepin-mcp/scripts/customer-install.mjs';
import {fileURLToPath} from 'node:url';
try {const result=await installCustomer(process.argv.slice(2),{packageDirectory:fileURLToPath(new URL('.',import.meta.url))});console.log(JSON.stringify(result,null,2));}catch(error){console.error(error.message);process.exitCode=1;}
`);
  generated('doctor.mjs',`import {customerDoctor} from './tools/liepin-mcp/scripts/customer-install.mjs';
import {fileURLToPath} from 'node:url';
try {const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==='--root'))throw Error('用法：node doctor.mjs [--root 安装根]');console.log(JSON.stringify(customerDoctor({packageDirectory:fileURLToPath(new URL('.',import.meta.url)),root:args[1]}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
`);
 }
 copy('tools/liepin-mcp/scripts/install-package.mjs');
 copy('tools/liepin-mcp/scripts/launch-installed.mjs');
 copy('tools/liepin-mcp/scripts/native-access.mjs');
 copy('tools/liepin-mcp/scripts/browser-setup.mjs');
 copy('tools/liepin-mcp/scripts/windows-native-registry.mjs');
 copy('tools/liepin-mcp/scripts/build-native-launcher.mjs');
 walk('distribution/liepin-search/runtime/packages/liepin/lib',['.js']);
 for(const file of ['README.md','ARCHITECTURE-DECISION.md','INSTALL.md'])copy('tools/liepin-mcp/'+file);
 const packageJson={name:'hunter-liepin-mcp',version:releaseVersion??'0.3.0-alpha.1',private:true,type:'module',engines:{node:'>=22'},bin:delivery==='site-adapter'?{'hunter-liepin-local':'tools/liepin-mcp/local.mjs'}:{'hunter-liepin-mcp':'tools/liepin-mcp/server.mjs'},dependencies:{'opencli-mcp':'0.0.30'}};
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(packageJson,null,2)+'\n',{flag:'wx'});
 const packageData=fs.readFileSync(path.join(root,'package.json'));files.push({path:'package.json',sha256:hash(packageData),bytes:packageData.length});
 let lockData=fs.readFileSync(path.join(sourceRoot,'tools/liepin-mcp/package-lock.template.json'));
 const lock=JSON.parse(lockData);
 if(lock.packages?.['']?.dependencies?.['opencli-mcp']!==packageJson.dependencies['opencli-mcp']||lock.version!=='0.3.0-alpha.1')throw Error('依赖锁与候选版本不匹配');
 if(releaseVersion){lock.version=releaseVersion;lock.packages[''].version=releaseVersion;lock.packages[''].bin=packageJson.bin;lockData=Buffer.from(JSON.stringify(lock,null,2)+'\n');}
 fs.writeFileSync(path.join(root,'package-lock.json'),lockData,{flag:'wx'});files.push({path:'package-lock.json',sha256:hash(lockData),bytes:lockData.length});
 fs.chmodSync(path.join(root,delivery==='site-adapter'?'tools/liepin-mcp/local.mjs':'tools/liepin-mcp/server.mjs'),0o755);
 files.sort((a,b)=>a.path.localeCompare(b.path,'en'));
 const manifest={delivery,product:'hunter-liepin-mcp',version:packageJson.version,releaseStatus:releaseVersion?'release-candidate-not-approved':'development-candidate-not-approved',files,sourceFingerprint:hash(JSON.stringify(files)),limitations:['Compatibility extension assets can be prepared from the locked upstream package; Chrome loading still requires verification','No client configuration changed','Legacy CLI transport is not a supported entry point','Real Liepin and target-platform installation acceptance pending']};
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return {root,sourceFingerprint:manifest.sourceFingerprint,files:files.length};
}
// macOS /var and /tmp aliases can differ from Node's canonical module path.
if(process.argv[1]&&fs.existsSync(process.argv[1])&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(![3,4,5].includes(process.argv.length))throw Error('用法：node build-package.mjs <不存在的候选目录> [site-adapter] [0.3.x正式候选版本]');
 console.log(JSON.stringify(buildPackage(process.argv[2],{delivery:process.argv[3]??'site-adapter',releaseVersion:process.argv[4]})));
}
