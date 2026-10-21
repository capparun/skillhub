import {logger} from './workflow.mjs';
import {readAdapterExpandedDetail} from './site-adapter-expansion.mjs';
import {readCurrentDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/current-detail.js';
import {inspectDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail.js';
import {executeMcpOperation} from './execution.mjs';
import {assertLiepinUrl} from './transport.mjs';

// Official AdapterContext only. No hidden browser/close/CDP properties or child MCP.
export async function readAdapterCurrentDetail({args,tab,signal}){
 const check=()=>{if(signal?.aborted)throw Error('操作已取消；停止后续读取');};
 check();
 if(String(tab.id)!==args.tab_id)throw Error('官方 Adapter 绑定的页面与指定标签不一致；未读取正文');
 const onAction=logger(args.file,{operationId:args.operation_id,tabId:args.tab_id});
 return readCurrentDetail({file:args.file,page:args.tab_id,operationId:args.operation_id,resumeId:args.resume_id,expand:args.expand===true},{
  validatePage:page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page)),
  execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openReader:async()=>{
   check();const url=assertLiepinUrl(await tab.url(),'/resume/showresumedetail/');
   const ids=url.searchParams.getAll('res_id_encode');
   if(ids.length!==1||ids[0]!==args.resume_id)throw Error('详情身份不匹配，未读取正文');
   return {read:async()=>{
    check();onAction({phase:'reading',description:args.expand?'读取已绑定详情并展开已识别的经历':'读取已绑定详情的可见内容，不点击或移动鼠标'});
    const result=args.expand===true?await readAdapterExpandedDetail(tab,args.resume_id,{signal,onAction}):await tab.evaluate(inspectDetail);check();onAction({phase:'returned',description:'详情快照已返回，完整性由字段解析和保存结果判断'});return result;
   }}; // The official session owns the bound tab; this adapter never closes it.
  },
 });
}
