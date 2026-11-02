import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {adapterSavedSearch} from '../../lib/site-adapter-business.mjs';
import {adapterFilterProperties} from '../../lib/site-adapter-filters.mjs';
export default defineAdapter({
 description:'列出、保存、应用或删除猎聘搜索方案；写操作需已有任务授权',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'方案操作及回读结果'},
 args:[
  {name:'file',type:'string',required:true},
  {name:'operation_id',type:'string',required:true},
  {name:'tab_id',type:'string',required:true},
  {name:'action',type:'string',required:true,choices:['list','save','apply','delete']},
  {name:'name',type:'string'},
  {name:'current',type:'boolean',default:false},
  {name:'filters',type:'object',properties:adapterFilterProperties},
  {name:'limit',type:'int',min:1,max:30,default:3},
 ],run:withAdapterDeadline(adapterSavedSearch),
});
