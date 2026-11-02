import fs from 'node:fs';
import {cli} from './lib/register.js';
import {runLocalTask,readOnlyTaskModes,taskModes} from './lib/task-service.js';

// CLI file transport only; MCP uses the same business service with JSON arguments.
export function runTaskCommand(args){
 if(!args.file)throw new Error('必须明确指定本地任务文件');
 if(!taskModes.includes(args.mode))throw new Error('不支持的本地任务 mode');
 if(readOnlyTaskModes.includes(args.mode))return runLocalTask(args);
 if(!args.input)throw new Error('该操作需要本地 JSON 输入文件');
 const stat=fs.lstatSync(args.input);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>20*1024*1024)throw new Error('输入必须是不超过 20MB 的普通 JSON 文件');
 return runLocalTask({...args,input:JSON.parse(fs.readFileSync(args.input,'utf8'))});
}

cli({site: 'liepin', name: 'task',access:'write',browser:false,
 description:'本地寻访任务：计划、授权、导入、证据评估、标签、统计与导出；不访问平台',
 args:[
  {name:'mode',type:'string',positional:true,required:true,help:'init/import/show/brief/trial-quality/detail-targets/detail-batch/restoration-request/approve/authorize/grant/review/revise/evaluate/shortlist/rank/link/tag/stats/export/resolve/resume/retry/scope-init/scope-bind'},
  {name:'file',type:'string',required:true,help:'本地任务 JSON 路径'},
  {name:'input',type:'string',help:'用于初始化或导入的 JSON 路径'},
  {name:'source',type:'string',help:'导入来源 liepin/linkedin/maimai'},
  {name:'roundId',type:'string',help:'采集轮次 ID'},
  {name:'stage',type:'string',default:'list',help:'list/detail'},
 ],columns:['id','status','candidates','rounds','updatedAt'],func:async(args)=>[runTaskCommand(args)],
});
