import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
/** Installed package first; explicit override remains visible to doctor. */
export function resolveUpstream(override,{resolve=createRequire(import.meta.url).resolve}={}){
 if(override)return {command:override,args:['stdio'],entry:override,source:'explicit'};
 let sdk;
 try{sdk=resolve('opencli-mcp/adapter-sdk');}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;return {command:'opencli-mcp',args:['stdio'],entry:'opencli-mcp',source:'PATH'};}
 const root=path.resolve(path.dirname(sdk),'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 if(manifest.name!=='opencli-mcp'||manifest.version!=='0.0.30')throw Error('包内MCP依赖不是已审计的0.0.30，未启动');
 const entry=path.resolve(root,manifest.bin?.['opencli-mcp']??'');
 if(!entry.startsWith(root+path.sep)||!fs.statSync(entry).isFile())throw Error('包内MCP入口无效');
 return {command:process.execPath,args:[entry,'stdio'],entry,source:'package-local'};
}
