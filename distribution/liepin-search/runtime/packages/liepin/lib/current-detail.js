import {createLiepinPage} from './page-connection.js';
import {readExpandedDetail} from './expanded-detail.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { inspectDetail, parseDetail, detailUrl } from './detail.js';
import { executeScopedOperation } from './site-scope.js';
import { readTask, updateTask, mergeObservations } from './task-store.js';
import {readBoundLocation} from './bound-page.js';

const reviewedFiles = {
  'page.js':'167218ee8cbb0913f84297bf6b694c22b1e15d0266b592fe87ae0799c1babc2e',
  'daemon-client.js':'02a027718c1617547b69031756c5303eb9a8cc392f720e317b14642c1744f48d',
};
// This review only permits a fixed, read-only evaluator on an explicitly bound
// existing page. It does not approve navigation, writes or another runtime build.
export function checkReadRuntime(pageModuleUrl = import.meta.resolve('@jackwener/opencli/browser/page')) {
  const version = JSON.parse(fs.readFileSync(new URL('../../../package.json',pageModuleUrl),'utf8')).version;
  if (version !== '2.0.0') throw new Error('详情只读通道尚未审查此 OpenCLI 版本；未启动浏览器');
  for (const [file,hash] of Object.entries(reviewedFiles)) {
    const actual=crypto.createHash('sha256').update(fs.readFileSync(new URL(file,pageModuleUrl))).digest('hex');
    if (actual !== hash) throw new Error('OpenCLI 执行文件与已审查版本不一致；未启动浏览器');
  }
  return {version,mode:'existing-page-read-only'};
}

export async function openCurrentDetailReader(pageId,{expand=false,resumeId}={}) {
  checkReadRuntime();
  const page = await createLiepinPage();
  page.setActivePage(pageId);
  try {await readBoundLocation(page,pageId,'/resume/showresumedetail/',{requireConnection:true});}
  catch(error) {await page.closeWindow();throw error;}
  // Expose only fixed reading and optional experience-expansion behavior.
  return {read:() => expand ? readExpandedDetail(page,resumeId) : page.evaluate(inspectDetail),close:()=>page.closeWindow()};
}

export async function readCurrentDetail(args, {openReader=openCurrentDetailReader,validatePage=page=>typeof page==='string'&&/^[A-Fa-f0-9]{16,128}$/.test(page),execute=executeScopedOperation} = {}) {
  detailUrl(args.resumeId);
  if (!validatePage(args.page)) throw new Error('必须提供已观察到的浏览器标签 targetId，不猜测或自动打开标签');
  if (typeof args.file !== 'string' || !args.file.trim()) throw new Error('必须明确指定本地任务文件');
  const request={operationId:args.operationId,kind:'detail',payload:{resumeId:args.resumeId,page:args.page,...(args.expand===true?{expand:true}:{})}};
  const evidence=await execute(args.file,request,async()=>{
    const reader=await openReader(args.page,{expand:args.expand===true,resumeId:args.resumeId});
    let detail;
    try {detail=parseDetail(await reader.read(),args.resumeId);}
    finally {await reader.close?.();}
    const success=['readable','partial'].includes(detail.status);
    return {status:success?'completed':'blocked',evidence:{detail}};
  });
  // Cache/recovery must still bind the evidence to the originally authorized ID.
  if (!evidence.detail || evidence.detail.resumeId !== args.resumeId || evidence.detail.source !== 'liepin') throw new Error('详情证据与授权对象不一致；停止保存');
  updateTask(args.file,task=>mergeObservations(task,[evidence.detail],{stage:'detail',roundId:`detail-${args.operationId}`}));
  return {...evidence.detail,operationStatus:readTask(args.file).operations.find(op=>op.operationId===args.operationId).status};
}
