import {cli} from './lib/register.js';
import {disconnectManagedSearch} from './connect.js';
import {cleanupManagedDetails} from './lib/official-cleanup.js';
cli({site:'liepin',name:'disconnect',access:'write',browser:false,
 description:'结束独立寻访；提供任务文件先清理已保存详情，再释放搜索会话。官方可能保留空白占位与保存组',
 args:[{name:'page',type:'string',required:true,help:'独立寻访 connect 返回的原搜索目标'},
 {name:'file',type:'string',help:'原任务文件；清理本任务有来源证明的已保存详情'}],
 columns:['session','released','cleanup'],func:async args=>{
  const cleanup=args.file?await cleanupManagedDetails(args):undefined;
  if(cleanup && !cleanup.complete)return [{released:false,cleanup}];
  return [{...await disconnectManagedSearch(args.page),...(cleanup?{cleanup}:{})}];
 }});
