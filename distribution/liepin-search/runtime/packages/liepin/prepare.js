import {cli} from './lib/register.js';
import {filters} from './lib/filters.js';
import {prepareFilters} from './lib/prepare-task.js';
export {prepareFilters};

cli({site:'liepin',access:'write',name:'prepare',browser:false,
 description:'在已绑定搜索页清空并设置全部支持的筛选，不点击搜索；结果记录在本地任务',
 args:[...Object.entries(filters).map(([name,[label,kind]])=>({name,type:kind==='check'?'boolean':'string',positional:name==='keyword',help:label})),
  {name:'recoverBlank',type:'boolean',help:'白屏时最多恢复一次，仅原官方独立搜索页；再次失败即停'},
  {name:'file',type:'string',required:true,help:'本地任务文件'},
  {name:'page',type:'string',required:true,help:'connect 返回的搜索页 targetId'},
  {name:'operationId',type:'string',required:true,help:'持久操作标识'}],
 columns:['applied','submitted'],func:async args=>[await prepareFilters(args)]});
