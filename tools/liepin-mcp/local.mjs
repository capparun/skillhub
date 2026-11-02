#!/usr/bin/env node
import {exportPlatformReport} from './lib/platform-report.mjs';
import {diagnose} from './lib/diagnostics.mjs';
// Local counterpart to official Site Adapters. No MCP server or browser client.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {runLocalTask,taskModes} from '../../distribution/liepin-search/runtime/packages/liepin/lib/task-service.js';
import {createTask} from '../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {createDetailBatch} from '../../distribution/liepin-search/runtime/packages/liepin/lib/detail-batch.js';
import {exportTask} from '../../distribution/liepin-search/runtime/packages/liepin/lib/report.js';
import {filters} from '../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
import {validate} from './lib/validate.mjs';
const str={type:'string',minLength:1};
const schemas={
 doctor:{properties:{},required:[]},
 conditions:{properties:{},required:[]},
 create:{properties:{file:str,title:str},required:['file','title']},
 task:{properties:{file:str,mode:{type:'string',enum:taskModes},input:{type:['object','array']},source:{type:'string',enum:['liepin','linkedin','maimai']},roundId:str,stage:{type:'string',enum:['list','detail']}},required:['file','mode']},
 report:{properties:{file:str,output:str,view:{type:'string',enum:['platform','evaluation']},format:{type:'string',enum:['html','json','markdown','csv']}},required:['file','output','format']},
};
export function localCommand(command,args){
 const schema=schemas[command];if(!schema)throw Error('仅支持本地 conditions/create/task/report；浏览器操作使用官方 Site Adapter');
 validate(args,{type:'object',additionalProperties:false,...schema});
 if(command==='doctor')return diagnose();
 if(command==='conditions')return Object.entries(filters).map(([key,[label,type]])=>({key,adapterKey:key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),label,type}));
 if(command==='create'){const task=createTask(args.file,{title:args.title});return {id:task.id,file:args.file};}
 if(command==='report'){
  if(args.format==='html'&&args.view!=='evaluation')return exportPlatformReport(args.file,args.output);
  return exportTask(args.file,args);
 }
 if(args.mode==='detail-batch')return createDetailBatch(args.file,args.input,{validatePage:page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page))});
 return runLocalTask(args);
}
if(process.argv[1]&&fs.existsSync(process.argv[1])&&import.meta.url===pathToFileURL(fs.realpathSync(process.argv[1])).href){
 try{
  const [command,input,...extra]=process.argv.slice(2);
  if(extra.length||!command)throw Error('用法：node local.mjs conditions | <create|task|report> <JSON文件或 ->');
  const args=input?JSON.parse(fs.readFileSync(input==='-'?0:input,'utf8')):{};
  process.stdout.write(JSON.stringify(await localCommand(command,args))+'\n');
 }catch(error){process.stderr.write(JSON.stringify({error:error.message})+'\n');process.exitCode=1;}
}
