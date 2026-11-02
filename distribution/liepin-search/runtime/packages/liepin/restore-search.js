import {cli} from './lib/register.js';
import {restoreSearch} from './lib/restore-search-task.js';
export {restoreSearch} from './lib/restore-search-task.js';
export {restorationRequest,isEmptyRecoveryScene} from './lib/search-restoration.js';

cli({site:'liepin',name:'restore-search',access:'write',browser:false,
 description:'在没有可复用结果或草稿的搜索页恢复原已完成轮次的相同条件；保留原记录，不新建重复轮次',
 args:[{name:'file',type:'string',required:true,help:'原寻访任务 JSON'},
  {name:'roundId',type:'string',required:true,help:'原已完成的搜索轮次'},
  {name:'page',type:'string',required:true,help:'当前实际搜索目标'},
  {name:'operationId',type:'string',required:true,help:'本次恢复的持久操作ID'},
  {name:'reason',type:'string',required:true,help:'实际页面丢失或重建原因'}],
 columns:['status','roundId','collectionRoundId'],func:async args=>{const result=await restoreSearch(args);if(result.status!=='completed')throw new Error('搜索恢复未完成：'+result.reason);return [result];}});
