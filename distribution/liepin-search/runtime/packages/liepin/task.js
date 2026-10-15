import {recordShortlist} from './lib/shortlist.js';
import {createDetailBatch} from './lib/detail-batch.js';
import {requirementBrief} from './lib/requirements.js';
import {detailTargets} from './lib/detail-targets.js';
import {trialQuality} from './lib/trial-quality.js';
import {restorationRequest} from './lib/search-restoration.js';
import {linkListObservation} from './lib/identity-link.js';
import fs from 'node:fs';
import {recordRanking} from './lib/ranking.js';
import { cli } from './lib/register.js';
import { readTask } from './lib/task-store.js';
import { initializeWorkflow, importCandidates, approveRound, reviewTrial, proposeRevision } from './lib/workflow.js';
import { recordEvaluation, tagCandidate } from './lib/evaluation.js';
import { taskSummary, exportTask } from './lib/report.js';
import { resolveOperation, resumeTask, authorizeTask, grantOperations } from './lib/operation-gate.js';
import {createSiteScope,bindSiteScope,authorizeScopedRetry} from './lib/site-scope.js';

export function runTaskCommand(args) {
  if (!args.file) throw new Error('必须明确指定本地任务文件');
  if(args.mode==='brief')return requirementBrief(readTask(args.file));
  if(args.mode==='detail-targets')return detailTargets(readTask(args.file));
  if(args.mode==='show')return readTask(args.file);
  if(args.mode==='stats')return taskSummary(readTask(args.file));
  if(args.mode==='trial-quality')return trialQuality(readTask(args.file));
  if(!['shortlist','restoration-request','detail-batch','init','import','approve','review','revise','evaluate','rank','link','tag','export','resolve','resume','authorize','grant','scope-init','scope-bind','retry'].includes(args.mode))throw new Error('不支持的本地任务 mode');
  if(!args.input)throw new Error('该操作需要本地 JSON 输入文件');
  const stat=fs.lstatSync(args.input);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.size>20*1024*1024)throw new Error('输入必须是不超过 20MB 的普通 JSON 文件');
  const input=JSON.parse(fs.readFileSync(args.input,'utf8'));
  if(args.mode==='restoration-request')return {allowedRequests:[restorationRequest(readTask(args.file),input.roundId,input.page,input.operationId)]};
  if(args.mode==='detail-batch')return createDetailBatch(args.file,input);
  if(args.mode==='init')return initializeWorkflow(args.file,input);
  if(args.mode==='approve')return approveRound(args.file,input.roundId,input);
  if(args.mode==='review')return reviewTrial(args.file,input);
  if(args.mode==='revise')return proposeRevision(args.file,input);
  if(args.mode==='evaluate')return recordEvaluation(args.file,input);
  if(args.mode==='link')return linkListObservation(args.file,input);
  if(args.mode==='shortlist')return recordShortlist(args.file,input);
  if(args.mode==='rank')return recordRanking(args.file,input);
  if(args.mode==='tag')return tagCandidate(args.file,input);
  if(args.mode==='export')return exportTask(args.file,input);
  if(args.mode==='resolve')return resolveOperation(args.file,input);
  if(args.mode==='resume')return resumeTask(args.file,input);
  if(args.mode==='retry')return authorizeScopedRetry(args.file,input);
  if(args.mode==='grant')return grantOperations(args.file,input);
  if(args.mode==='authorize')return authorizeTask(args.file,input);
  if(args.mode==='scope-init')return createSiteScope(args.file,input);
  if(args.mode==='scope-bind')return bindSiteScope(args.file,input.scopeFile);
  return importCandidates(args.file,input,{source:args.source,roundId:args.roundId,stage:args.stage});
}
cli({site: 'liepin', name: 'task',access:'write',browser:false,
 description:'本地寻访任务：计划、授权、导入、证据评估、标签、统计与导出；不访问平台',
 args:[
  {name:'mode',type:'string',positional:true,required:true,help:'init/import/show/brief/trial-quality/detail-targets/detail-batch/restoration-request/approve/authorize/grant/review/revise/evaluate/shortlist/rank/link/tag/stats/export/resolve/resume/retry/scope-init/scope-bind'},
  {name:'file',type:'string',required:true,help:'本地任务 JSON 路径'},
  {name:'input',type:'string',help:'用于初始化或导入的 JSON 路径'},
  {name:'source',type:'string',help:'导入来源 liepin/linkedin/maimai'},
  {name:'roundId',type:'string',help:'采集轮次 ID'},
  {name:'stage',type:'string',default:'list',help:'list/detail'},
 ],columns:['id','status','candidates','rounds','updatedAt'],func:async(args)=>[runTaskCommand(args)],
});
