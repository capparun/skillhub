import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {SOURCE_MANIFEST_SHA256,PATCHED_BACKGROUND_SHA256,COMPAT_NAME,COMPAT_VERSION_NAME,COMPAT_PUBLIC_KEY} from './lib/compat-build.mjs';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
export function patchBackground(source) {
 if(sha(source)!=='8e38409f2a7584de460efadf853d95aa0c62a42e264c142879a036750478eb88')throw Error('上游background.js哈希不匹配；停止构建');
 const needle='  attached.add(tabId);\n  try {\n    await sendDebuggerCommand({ tabId }, "Runtime.enable");\n  } catch {\n  }\n';
 if(source.split(needle).length!==2)throw Error('补丁位置不唯一');
 let patched=source.replace(needle,'  attached.add(tabId);\n  // Hunter compatibility: automatic Runtime event subscription is omitted.\n');
 const fallback=`      await sendDebuggerCommand({ tabId }, "Runtime.enable").catch(() => {
      });
      await new Promise((r2) => setTimeout(r2, 50));
      ctx = mainContexts.get(k);`;
 if(patched.split(fallback).length!==2)throw Error('iframe补丁位置不唯一');
 patched=patched.replace(fallback,`      throw Object.assign(new Error('Hunter preview does not subscribe Runtime for iframe main-world evaluation'), {code:'hunter_frame_unsupported'});`);
 return patched;
}
export function build(sourceDir,outputDir) {
 const source=path.resolve(sourceDir),output=path.resolve(outputDir);
 if(fs.existsSync(output))throw Error('输出目录已存在，不覆盖');
 const manifestBytes=fs.readFileSync(path.join(source,'manifest.json'));
 if(sha(manifestBytes)!==SOURCE_MANIFEST_SHA256)throw Error('上游manifest哈希不匹配；停止构建');
 const manifest=JSON.parse(manifestBytes);
 if(manifest.version!=='0.0.22')throw Error('扩展版本不匹配');
 const original=fs.readFileSync(path.join(source,'background.js'),'utf8');
 const patched=patchBackground(original);
 if(sha(patched)!==PATCHED_BACKGROUND_SHA256)throw Error('补丁输出不匹配已审核构建');
 fs.cpSync(source,output,{recursive:true});
 fs.writeFileSync(path.join(output,'background.js'),patched);
 manifest.key=COMPAT_PUBLIC_KEY;manifest.name=COMPAT_NAME;manifest.version_name=COMPAT_VERSION_NAME;
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 fs.writeFileSync(path.join(output,'hunter-build.json'),JSON.stringify({version:'0.3.0-alpha.1',upstream:{npm:'0.0.30',extension:'0.0.22'},sourceSha256:sha(original),patchedSha256:sha(patched),changes:['omit automatic attach Runtime.enable','reject implicit iframe Runtime subscription','distinct preview identity'],limitations:['iframe main-world evaluation requiring Runtime subscription is unsupported','console/context events unavailable until explicitly enabled'],permissionsChanged:false},null,2));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){if(process.argv.length!==4)throw Error('用法: node build-extension.mjs <官方extension/dist> <新输出目录>');build(process.argv[2],process.argv[3]);}
