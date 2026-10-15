import {cli} from './lib/register.js';
import {setFavorite} from './lib/favorite.js';
cli({site:'liepin',name:'favorite',access:'write',browser:false,description:'当前详情收藏、取消或状态查询；需明确任务范围，收藏须指定分组',
 args:[{name:'action',type:'string',positional:true,required:true,help:'add/remove/status'},{name:'resumeId',type:'string',required:true,help:'当前详情简历ID'},{name:'page',type:'string',required:true,help:'connect返回的page'},{name:'file',type:'string',required:true,help:'任务文件'},{name:'operationId',type:'string',required:true,help:'持久操作ID'},{name:'group',type:'string',help:'add时明确指定收藏分组'}],
 columns:['resumeId','saved','changed','group'],func:async args=>{const result=await setFavorite(args);if(typeof result.saved!=='boolean')throw new Error('收藏操作未确认：'+result.reason);return [result];}});
