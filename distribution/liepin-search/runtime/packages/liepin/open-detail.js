import {cli} from './lib/register.js';
import {openListDetail} from './lib/open-list-detail.js';
cli({site:'liepin',name:'open-detail',access:'read',browser:false,
 description:'从已保存的当前列表卡片打开一次详情，读取并关联；不联系或解锁',
 args:[{name:'file',help:'本地任务 JSON 文件',type:'string',required:true},{name:'observationId',help:'已保存列表记录的 id',type:'string',required:true},{name:'page',help:'connect 返回的当前页面 targetId',type:'string',required:true},{name:'operationId',help:'持久操作标识',type:'string',required:true}],
 columns:['observationId','detail','method'],func:async args=>{const result=await openListDetail(args);if(!['readable','partial'].includes(result.detail?.status))throw new Error('详情未确认，任务记录已保留；'+(result.reason ?? result.detail?.status ?? '请核对任务'));return [result];}});
