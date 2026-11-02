import {cli} from './lib/register.js';
import {runRound} from './lib/workflow.js';
import {SearchError} from './lib/engine.js';

import {executeBoundSearch} from './lib/bound-search-task.js';
export {executeBoundSearch} from './lib/bound-search-task.js';
export async function runSearchCommand(args,options={}) {
 if(typeof args.page!=='string' || !/^[A-Fa-f0-9]{16,128}$/.test(args.page))throw new Error('必须提供已观察到的 targetId');
 if(!args.file || !args.roundId)throw new Error('需要明确的本地任务和已授权轮次');
 return runRound(args.file,args.roundId,filters=>executeBoundSearch(args,filters,options));
}
export async function searchCli(args,options) {
 const task=await runSearchCommand(args,options);
 const operation=task.operations.find(item=>item.operationId===`round-${args.roundId}`);
 if(operation?.status!=='completed')throw new SearchError('SEARCH_STOPPED',
  `搜索未完成，结果已保存且任务暂停；不要自动重试。${operation?.evidence?.message ?? operation?.evidence?.reason ?? '请核对任务记录'}`);
 return [task];
}
cli({site: 'liepin',name: 'search',access:'write',browser:false,
 description:'执行已授权的寻访轮次：绑定现有搜索页、单次提交、持久保存；未知结果不重试',
 args:[
  {name:'file',type:'string',required:true,help:'本地寻访任务 JSON 路径'},
  {name:'roundId',type:'string',required:true,help:'已明确批准的搜索轮次 ID'},
  {name:'page',type:'string',required:true,help:'已观察到的猎聘搜索标签 targetId'},
 ],columns:['id','status','rounds','candidates','unlinkedObservations'],
 func:async args=>searchCli(args),
});
