import {cli} from './lib/register.js';
import {savedSearchTask,savedTaskArgs} from './lib/saved-search-task.js';
cli({site:'liepin',name:'delete-saved-search',access:'write',browser:false,
 description:'已绑定页面的搜索方案删除，保留任务记录',
 args:[{name:'name',type:'string',positional:true,required:true,help:'平台方案名称'},...savedTaskArgs],columns:['name','schemes','saved','deleted','total','rows'],func:async args=>[await savedSearchTask('delete',args)]});
