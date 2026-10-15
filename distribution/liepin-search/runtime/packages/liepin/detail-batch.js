import {cli} from './lib/register.js';
import {runDetailBatch} from './lib/detail-batch.js';
cli({site:'liepin',name:'detail-batch',access:'read',browser:false,
 description:'顺序读取已保存的详情批次，逐条落盘并复用完成记录',
 args:[{name:'file',type:'string',required:true,help:'本地任务文件'},{name:'id',type:'string',required:true,help:'已创建的批次 ID'},{name:'intervalMs',type:'int',default:3000,help:'条目间隔毫秒，1000–60000'}],
 columns:['id','status','items'],func:async args=>[await runDetailBatch(args)]});
