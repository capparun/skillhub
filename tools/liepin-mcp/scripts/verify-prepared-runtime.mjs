import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {verifyPackage} from './install-package.mjs';
export function verifyPreparedRuntime(directory){
 directory=fs.realpathSync(directory);
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
 verifyPackage(directory,manifest.sourceFingerprint);
 if(manifest.delivery!=='site-adapter')throw Error('不是 Adapter 候选');
 const receipt=JSON.parse(fs.readFileSync(path.join(directory,'adapter-runtime-receipt.json')));
 if(receipt.sourceFingerprint!==manifest.sourceFingerprint||receipt.status!=='prepared-not-connected'||!Array.isArray(receipt.files)||!receipt.files.length)throw Error('运行时准备回执不匹配');
 const expected=new Set(['node_modules/opencli-mcp/dist/src/sites/executor.js','node_modules/opencli-mcp/dist/src/runtime/runtime.js','node_modules/opencli-mcp/dist/src/runtime/hunter-adapter-tabs.mjs',...manifest.files.filter(f=>f.path.startsWith('tools/liepin-mcp/adapters/liepin/')&&f.path.endsWith('.js')).map(f=>'node_modules/opencli-mcp/adapters/liepin/'+path.posix.basename(f.path))]);
 for(const item of receipt.files){
  if(!expected.delete(item.path)||!/^[a-f0-9]{64}$/.test(item.sha256??''))throw Error('运行时清单存在未知、重复或无效文件');
  const file=path.join(directory,item.path),stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(file).startsWith(directory+path.sep))throw Error('运行时文件路径越界');
  if(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==item.sha256)throw Error('运行时文件已变化：'+item.path);
 }
 if(expected.size)throw Error('运行时清单缺少必要文件');
 const names=fs.readdirSync(path.join(directory,'node_modules/opencli-mcp/adapters/liepin')).filter(n=>n.endsWith('.js')).sort();
 const recorded=receipt.files.filter(f=>f.path.startsWith('node_modules/opencli-mcp/adapters/liepin/')).map(f=>path.posix.basename(f.path)).sort();
 if(JSON.stringify(names)!==JSON.stringify(recorded))throw Error('运行时存在额外 Adapter');
 return {status:'prepared-files-verified',sourceFingerprint:manifest.sourceFingerprint,adapterCount:names.length,browserVerified:false,note:'只核对本机准备回执与文件，不证明当前浏览器正在运行此构建'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)console.log(JSON.stringify(verifyPreparedRuntime(process.argv[2])));
