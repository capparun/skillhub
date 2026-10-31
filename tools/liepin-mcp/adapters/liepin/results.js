import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {readAdapterResults} from '../../lib/site-adapter-search.mjs';
export default defineAdapter({
 description:'读取并保存已绑定猎聘搜索页当前列表，不重新搜索或翻页',
 domain:'h.liepin.com',access:'read',result:{kind:'value',description:'已保存数量及绑定标签ID'},
 args:[{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'limit',type:'int',min:1,max:30,default:3}],
 run:withAdapterDeadline(readAdapterResults),
});
