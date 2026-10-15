import {cli} from './lib/register.js';
import {savedSearchTask,savedTaskArgs} from './lib/saved-search-task.js';
import {filters} from './lib/filters.js';
cli({site:'liepin',name:'save-search',access:'write',browser:false,
 description:'已绑定页面的搜索方案保存，保留任务记录',
 args:[{name:'name',type:'string',positional:true,required:true,help:'平台方案名称'},{name:'current',type:'boolean',help:'保存当前页面条件，不清空或重新设置；不能与筛选参数混用'},...Object.entries(filters).map(([name,[label,kind]])=>({name,type:kind==='check'?'boolean':'string',help:label})),...savedTaskArgs],columns:['name','schemes','saved','deleted','total','rows'],func:async args=>[await savedSearchTask('save',args)]});
