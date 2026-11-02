import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {adapterDetailBatch} from '../../lib/site-adapter-detail-batch.mjs';
export default defineAdapter({
 description:'继续本地已创建并授权的详情队列，逐条保存并返回搜索页；跳过已完成项，未知状态暂停',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'持久批次及各详情完成状态'},
 args:[{name:'file',type:'string',required:true},{name:'id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'interval_ms',type:'int',min:1000,max:60000,default:6000}],
 run:withAdapterDeadline(adapterDetailBatch),
});
