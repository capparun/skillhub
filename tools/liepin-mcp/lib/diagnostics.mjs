import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {resolveUpstream} from './upstream.mjs';
export function diagnose({command=process.env.HUNTER_MCP_COMMAND,searchPath=process.env.PATH??''}={}){
 command=resolveUpstream(command).entry;
 const checks=[{name:'node',ok:Number(process.versions.node.split('.')[0])>=22,version:process.versions.node}];
 const candidates=path.isAbsolute(command)?[command]:command.includes(path.sep)?[path.resolve(command)]:searchPath.split(path.delimiter).map(dir=>path.join(dir,command));
 let executable;
 for(const candidate of candidates){try{fs.accessSync(candidate,fs.constants.X_OK);if(fs.statSync(candidate).isFile()){executable=fs.realpathSync(candidate);break;}}catch{}}
 checks.push({name:'command',ok:!!executable,...(executable?{path:executable}:{reason:'命令不存在或不可执行'})});
 if(executable){
  let dir=path.dirname(executable),manifest,root;
  for(let i=0;i<6;i++){
   try{const data=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));if(data.name==='opencli-mcp'){manifest=data;root=dir;break;}}catch{}
   const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
  }
  checks.push({name:'upstream-package',ok:manifest?.version==='0.0.30',version:manifest?.version??null,root:root??null,reason:manifest?.version==='0.0.30'?'已匹配已审计版本':'需要可识别的opencli-mcp 0.0.30来源'});
  checks.push({name:'command-sha256',ok:true,value:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),meaning:'本次文件指纹，仅记录，不代表构建获准'});
 }
 return {status:checks.every(c=>c.ok)?'local-prerequisites-ready':'local-prerequisites-failed',checks,browser:{checked:false},business:{checked:false},note:'只读本机文件；未启动浏览器或子进程。连接扩展身份和真实业务仍需单独核验。'};
}
