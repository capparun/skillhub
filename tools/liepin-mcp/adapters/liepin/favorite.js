import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {adapterFavorite} from '../../lib/site-adapter-favorite.mjs';
export default defineAdapter({
 description:'核对指定简历收藏状态，或按任务授权添加到指定分组、取消收藏；操作后回读确认',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'收藏状态、是否改变及回读结果'},
 args:[{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'resume_id',type:'string',required:true},{name:'action',type:'string',required:true,choices:['status','add','remove']},{name:'group',type:'string'}],
 run:withAdapterDeadline(adapterFavorite),
});
