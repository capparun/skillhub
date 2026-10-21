// Stable per-installation launcher. Selecting a version takes effect on next start.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
const selected=JSON.parse(fs.readFileSync(path.join(root,'current.json'),'utf8'));
if(!/^[a-f0-9]{64}$/.test(selected.fingerprint??''))throw Error('安装版本指纹无效');
const directory=path.join(root,'versions',selected.fingerprint);
if(fs.lstatSync(directory).isSymbolicLink()||!fs.realpathSync(directory).startsWith(fs.realpathSync(root)+path.sep))throw Error('安装版本路径越界');
const receipt=JSON.parse(fs.readFileSync(path.join(directory,'install-receipt.json'),'utf8'));
if(receipt.status!=='ready'||receipt.fingerprint!==selected.fingerprint)throw Error('版本未验证，不能启动');
const adapter=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))).delivery==='site-adapter';
const child=spawn(process.execPath,[path.join(directory,adapter?'tools/liepin-mcp/local.mjs':'tools/liepin-mcp/server.mjs'),...process.argv.slice(2)],{cwd:directory,stdio:'inherit'});
child.on('error',error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{process.exitCode=code??1;});
