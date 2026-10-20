import fs from 'node:fs';
import {cli} from './lib/register.js';
import {recoverBlankPrepare} from './lib/blank-recovery.js';
cli({site:'liepin',name:'recover-prepare',access:'write',browser:false,
 description:'核对原任务白屏记录，最多恢复一次原独立搜索页并重建未完成筛选；不提交搜索',
 args:[{name:'file',type:'string',required:true,help:'原任务文件'},
 {name:'page',type:'string',required:true,help:'原搜索目标'},
 {name:'previousOperationId',type:'string',required:true,help:'白屏操作 ID'},
 {name:'input',type:'string',required:true,help:'原筛选 JSON 文件，必须与已登记请求完全一致'},
 {name:'executorStopped',type:'boolean',required:true,help:'已确认原执行器退出'}],
 columns:['applied','submitted','recovery'],func:async args=>[await recoverBlankPrepare({...args,filters:JSON.parse(fs.readFileSync(args.input,'utf8'))})]});
