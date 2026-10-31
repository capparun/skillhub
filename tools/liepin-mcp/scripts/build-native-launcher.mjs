// Generates launch artifacts only; does not register a host or change browser settings.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {verifyPreparedRuntime} from './verify-prepared-runtime.mjs';
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
export function launcherText(node,dispatcher,platform=process.platform){
 if([node,dispatcher].some(s=>!s||/[\r\n\0]/.test(s)))throw Error('启动路径无效');
 if(platform==='win32'){
  if([node,dispatcher].some(s=>/[%!"^&|<>]/.test(s)))throw Error('Windows启动路径包含不支持的命令字符');
  return `@echo off\r\n"${node}" "${dispatcher}" %*\r\n`;
 }
 if(platform!=='darwin')throw Error('仅支持macOS和Windows');
 return `#!/bin/sh\nexec ${quote(node)} ${quote(dispatcher)} "$@"\n`;
}
export function buildNativeLauncher(directory,output){
 directory=fs.realpathSync(directory);output=path.resolve(output);output=path.join(fs.realpathSync(path.dirname(output)),path.basename(output));
 const verified=verifyPreparedRuntime(directory);
 const entry=path.join(directory,'node_modules/opencli-mcp/dist/src/main.js');
 if(!fs.statSync(entry).isFile()||!fs.realpathSync(entry).startsWith(directory+path.sep))throw Error('官方入口越界');
 const dispatcher=path.join(output,'dispatch.mjs');
 const launcher=path.join(output,process.platform==='win32'?'launcher.cmd':'launcher');
 const text=launcherText(process.execPath,dispatcher);
 fs.mkdirSync(output); // Existing output must never be overwritten.
 const supervisor=pathToFileURL(path.join(directory,'tools/liepin-mcp/lib/host-process.mjs')).href;
 const verifier=pathToFileURL(path.join(directory,'tools/liepin-mcp/scripts/verify-prepared-runtime.mjs')).href;
 fs.writeFileSync(dispatcher,`import {runHostProcess} from ${JSON.stringify(supervisor)};\nimport {verifyPreparedRuntime} from ${JSON.stringify(verifier)};\ntry {\n const result=verifyPreparedRuntime(${JSON.stringify(directory)});\n if(result.sourceFingerprint!==${JSON.stringify(verified.sourceFingerprint)})throw Error('候选指纹不一致');\n const args=process.argv.slice(2);\n runHostProcess(${JSON.stringify(entry)},args[0]==='stdio'?args:['host',...args]);\n} catch(error) { console.error(error.message);process.exitCode=1; }\n`,{flag:'wx',mode:0o600});
 fs.writeFileSync(launcher,text,{flag:'wx',mode:0o700});
 const receipt={sourceFingerprint:verified.sourceFingerprint,directory,launcher,node:process.execPath,browserVerified:false,files:[dispatcher,launcher].map(file=>({name:path.basename(file),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}))};
 fs.writeFileSync(path.join(output,'launcher-receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
 return receipt;
}
export function verifyNativeLauncher(output){
 output=fs.realpathSync(output);const receiptFile=path.join(output,'launcher-receipt.json');
 if(fs.lstatSync(receiptFile).isSymbolicLink())throw Error('启动器回执不能是链接');
 const receipt=JSON.parse(fs.readFileSync(receiptFile));const verified=verifyPreparedRuntime(receipt.directory);
 if(receipt.sourceFingerprint!==verified.sourceFingerprint||receipt.node!==process.execPath||path.dirname(receipt.launcher)!==output||receipt.files?.length!==2)throw Error('启动器回执与当前运行时不对应');
 const expected=new Set(['dispatch.mjs',process.platform==='win32'?'launcher.cmd':'launcher']);
 for(const file of receipt.files){if(!expected.delete(file.name)||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('启动器文件清单无效');const target=path.join(output,file.name);const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex')!==file.sha256)throw Error('启动器文件已变化');}
 if(expected.size||fs.readFileSync(receipt.launcher,'utf8')!==launcherText(receipt.node,path.join(output,'dispatch.mjs')))throw Error('启动器路径或内容不一致');
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href)console.log(JSON.stringify(buildNativeLauncher(process.argv[2],process.argv[3])));
