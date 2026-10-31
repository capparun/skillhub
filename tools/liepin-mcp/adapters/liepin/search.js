import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {searchAdapterRound} from '../../lib/site-adapter-search.mjs';
export default defineAdapter({
 description:'执行已批准轮次，提交一次搜索并读取授权页数，逐页保存；restore显式恢复已完成搜索，未知结果停止',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'轮次状态、读取数量、页数及中断提示'},
 args:[{name:'file',type:'string',required:true},{name:'round_id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'restore',type:'boolean',default:false,help:'仅在已授权的新空结果页恢复已完成轮次；会提交真实查询'},{name:'operation_id',type:'string',help:'restore必填，新恢复操作ID'},{name:'reason',type:'string',help:'restore必填，实际页面丢失原因'}],
 run:withAdapterDeadline(searchAdapterRound),
});
