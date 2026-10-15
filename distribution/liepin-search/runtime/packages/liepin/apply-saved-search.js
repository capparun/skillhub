import {cli} from './lib/register.js';
import {savedSearchTask,savedTaskArgs} from './lib/saved-search-task.js';
cli({site:'liepin',name:'apply-saved-search',access:'write',browser:false,
 description:'已绑定页面的搜索方案应用并核对新结果，保留任务记录',
 args:[{name:'name',type:'string',positional:true,required:true,help:'平台方案名称'},{name:'limit',type:'int',default:10,help:'当前页读取条数1–30'},...savedTaskArgs],columns:['name','schemes','saved','deleted','total','rows'],func:async args=>[await savedSearchTask('apply',args)]});
