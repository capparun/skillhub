import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {readAdapterCurrentDetail} from '../../lib/site-adapter-detail.mjs';
export default defineAdapter({
 description:'读取已绑定猎聘详情的可见内容并保存到本地任务；可选择展开经历，不新建或关闭标签',
 domain:'h.liepin.com',access:'write',
 result:{kind:'value',description:'已保存的可见详情、完整性状态及操作状态'},
 args:[
  {name:'expand',type:'boolean',default:false,help:'展开已识别的工作、项目、教育经历按钮'},
  {name:'file',type:'string',required:true,help:'已有任务的本机绝对路径'},
  {name:'operation_id',type:'string',required:true,help:'已授权的稳定操作ID'},
  {name:'tab_id',type:'string',required:true,help:'官方会话实际绑定的标签ID'},
  {name:'resume_id',type:'string',required:true,help:'已观察到的唯一简历ID'},
 ],
 run:withAdapterDeadline(readAdapterCurrentDetail),
});
