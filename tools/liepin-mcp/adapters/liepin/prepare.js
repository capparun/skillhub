import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {adapterFilterProperties} from '../../lib/site-adapter-filters.mjs';
import {prepareAdapterFilters} from '../../lib/site-adapter-prepare.mjs';
export default defineAdapter({
 description:'设置并回读猎聘筛选，不点击搜索；站点可能自动查询，需已有任务授权',
 domain:'h.liepin.com',access:'write',
 result:{kind:'value',description:'已回读的筛选条件与未提交搜索说明'},
 args:[
  {name:'file',type:'string',required:true},
  {name:'operation_id',type:'string',required:true},
  {name:'tab_id',type:'string',required:true},
  {name:'filters',type:'object',required:true,properties:adapterFilterProperties},
  {name:'options_only',type:'boolean',help:'仅打开选择类控件查看选项后收起，不选择值、不提交搜索；须精确授权filter-options请求'},
  {name:'verify_only',type:'boolean',help:'只读当前筛选与已选摘要；不清空、不点击、不恢复任务'},
 ],run:withAdapterDeadline(prepareAdapterFilters),
});
