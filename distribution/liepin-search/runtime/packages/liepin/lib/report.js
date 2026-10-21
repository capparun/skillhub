import {renderLinkedEvaluation,exportEvaluationBundle} from './report-delivery.js';
import {evaluationReportStyles} from './report-theme.js';
import {currentEvaluation} from './evaluation.js';
import fs from 'node:fs';
import {reportOutcome} from './report-outcome.js';
import {reportBrief} from './report-brief.js';
import {candidateProfile,unlinkedTable} from './report-profile.js';
import {currentShortlist} from './shortlist.js';
import {renderShortlist} from './report-shortlist.js';
import {comparisonTable} from './report-comparison.js';
import { candidatePresentation } from './report-presentation.js';
import {currentRanking} from './ranking.js';
import { readTask } from './task-store.js';

const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const markdown = value => String(value ?? '').replace(/[&<>]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;'}[c])).replace(/[\\`*_{}\[\]()#+.!|~-]/g, '\\$&').replace(/\r?\n/g, '<br>');
function csv(value) {
  let text = String(value ?? '');
  // Spreadsheet applications interpret these prefixes, even inside CSV quotes.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
const statusLabel=value=>({supported:'有证据支持',contradicted:'有相反证据',unknown:'待核实'}[value] ?? value);
const sourceLabel=value=>({liepin:'猎聘',linkedin:'LinkedIn',maimai:'脉脉'}[value] ?? value);
function requirementContext(task,format){
  const requirements=task.requirements??{},criteria=requirements.criteria??[],sources=requirements.sources??[];
  const kind=value=>({required:'硬性条件',bonus:'加分项',exclusion:'排除项'}[value]??value);
  const sourceTitle=id=>{const source=sources.find(s=>s.id===id);return source?`${source.title??source.id}（${source.kind}）`:`未找到来源 ${id}`;};
  const missing=!criteria.length?'尚未记录岗位条件，不能据此完成岗位匹配评估。':!sources.length?'需求原文尚未记录，条件来源待确认。':'';
  if(format==='markdown')return `## 需求与依据\n\n${missing?markdown(missing)+'\n\n':''}${criteria.map(c=>`- ${markdown(kind(c.kind))}：${markdown(c.label)}\n${(c.evidence??[]).map(e=>`  - ${markdown(sourceTitle(e.sourceId))}：${markdown(e.quote)}`).join('\n')}`).join('\n')}\n\n${requirements.openQuestions?.length?'### 待确认事项\n\n'+requirements.openQuestions.map(q=>`- ${markdown(q)}`).join('\n')+'\n\n':''}`;
  return `<section aria-label="需求与依据"><h2>需求与依据</h2>${missing?`<p>${html(missing)}</p>`:''}${criteria.map(c=>`<p><strong>${html(kind(c.kind))}：${html(c.label)}</strong></p>${(c.evidence??[]).map(e=>`<blockquote>${html(e.quote)}<br><small>来源：${html(sourceTitle(e.sourceId))}</small></blockquote>`).join('')}`).join('')}${requirements.openQuestions?.length?`<h3>待确认事项</h3><ul>${requirements.openQuestions.map(q=>`<li>${html(q)}</li>`).join('')}</ul>`:''}</section>`;
}
function findingTitle(finding) {
  const kind={required:'硬性条件',bonus:'加分项',exclusion:'排除项'}[finding.kind];
  return `${kind?kind+' · ':''}${finding.label ?? finding.criterionId}${finding.reviewFlag?' · '+finding.reviewFlag:''}`;
}
export function taskSummary(task) {
  const sources = {};
  let observations = 0, readableDetails = 0, evaluated = 0;
  const detailStatuses={readable:0,partial:0,other:0};
  for (const candidate of task.candidates) {
    sources[candidate.source] = (sources[candidate.source] ?? 0) + 1;
    observations += candidate.observations.length;
    const detail=candidate.observations.filter(o=>o.stage==='detail').at(-1);
    if(detail){const status=detail.data.status;if(['readable','partial'].includes(status)){readableDetails++;detailStatuses[status]++;}else detailStatuses.other++;}
    if (currentEvaluation(task,candidate)) evaluated++;
  }
  return {candidates:task.candidates.length, sources, observations, readableDetails, detailStatuses, evaluated,unresolvedIdentities:(task.unlinkedObservations ?? []).filter(o=>o.identityStatus!=='linked').length,
    completedRounds:(task.rounds ?? []).filter(r => r.status === 'completed').length,
    unresolvedOperations:(task.operations ?? []).filter(o => ['started', 'unknown', 'blocked', 'failed'].includes(o.status)).length};
}
function rows(task) {
  return [...task.candidates.map(candidate => ({
    key:candidate.key, source:candidate.source, identity:candidate.identity, tags:candidate.tags.join('、'),
    identityStatus:'identified',
    findings:currentEvaluation(task,candidate)?.findings ?? [], evaluationStale:Boolean(candidate.evaluations?.length&&!currentEvaluation(task,candidate)), observations:candidate.observations,
  })),...(task.unlinkedObservations ?? []).filter(o=>o.identityStatus!=='linked').map(o=>({key:`未识别记录:${o.id}`,source:o.source,identity:'',tags:'',
    identityStatus:'unresolved',findings:[],observations:[o]}))];
}
export function renderReport(task, format, options={}) {
  if (format === 'json') return JSON.stringify({task, summary:taskSummary(task)}, null, 2) + '\n';
  const ranking=currentRanking(task);
  const shortlist=currentShortlist(task);
  const entries = rows(task).map(row=>{
    const index=ranking?.entries.findIndex(e=>e.candidateKey===row.key) ?? -1;
    const selected=shortlist?.entries.find(entry=>entry.candidateKey===row.key);
    return {...row,presentation:candidatePresentation(row),shortlistStage:selected?shortlist.stage:'',shortlistReason:selected?.reason??'',evidenceLevel:selected?.evidenceLevel??'',changeReason:selected?.changeReason??'',evidenceGaps:selected?.evidenceGaps??[],reviewOrder:index<0?'':index+1,reviewReason:index<0?'':ranking.entries[index].reason};
  }).sort((a,b)=>(a.reviewOrder || Infinity)-(b.reviewOrder || Infinity));
  const rankingNotice=ranking?'人工复核顺序已记录；未列入者保留在后。':task.rankings?.length?'人工排序已过期，请重新复核。':'尚未记录人工排序。';
  if (format === 'csv') {
    const fields = ['taskTitle','requirements','name','position','company','city','shortlistStage','shortlistReason','evidenceLevel','changeReason','evidenceGaps','key','source','identity','identityStatus','reviewOrder','reviewReason','tags','evaluationStale','findings','observations'];
    const requirements={criteria:task.requirements.criteria??[],sources:(task.requirements.sources??[]).map(({id,kind,title})=>({id,kind,title})),openQuestions:task.requirements.openQuestions??[]};
    return '\ufeff' + [fields.map(csv).join(','), ...entries.map(entry => {
      const row={...entry,...entry.presentation,taskTitle:task.requirements.title??'寻访任务',requirements};
      return fields.map(field => csv(typeof row[field] === 'object' ? JSON.stringify(row[field]) : row[field])).join(',');
    })].join('\r\n') + '\r\n';
  }
  const summary = taskSummary(task);
  if (format === 'markdown') return `# ${markdown(task.requirements.title ?? '寻访任务')}\n\n本地证据报告；所有判断均待人工复核。${rankingNotice}\n\n已识别候选人：${summary.candidates}；缺少稳定 ID 的记录：${summary.unresolvedIdentities}；详情可读：${summary.detailStatuses.readable}；部分可见：${summary.detailStatuses.partial}；观察记录：${summary.observations}；待确认操作：${summary.unresolvedOperations}。\n\n` + requirementContext(task,'markdown') + renderShortlist(task,'markdown',markdown) + entries.map(row => `## ${markdown(row.presentation.name)}\n\n人工复核顺序：${markdown(row.reviewOrder)}；理由：${markdown(row.reviewReason)}\n\n来源：${markdown(sourceLabel(row.source))}；标签：${markdown(row.tags)}\n\n${row.findings.map(f => `- ${markdown(findingTitle(f))}：${markdown(statusLabel(f.status))} — ${markdown(f.reason)}\n${f.evidence.map(e => `  - 原文：${markdown(e.quote)}（快照 ${markdown(e.hash)}）`).join('\n')}`).join('\n') || (row.evaluationStale ? '历史评估已过期，需按当前需求与证据复评。' : row.identityStatus==='unresolved' ? '身份未确认；未合并、未评估。原始列表记录：'+markdown(JSON.stringify(row.observations)) : '尚未评估')}\n\n### 已保存的原始记录\n\n${markdown(JSON.stringify(row.observations, null, 2))}\n\n`).join('');
  if (format !== 'html') throw new Error('导出格式仅支持 json/csv/markdown/html');
  const identifiedProfiles=entries.map((row,index)=>row.identityStatus==='identified'?candidateProfile(row,index,html):'').join('');
  if(options.linkedFiles)return renderLinkedEvaluation(task,{entries,summary,profiles:identifiedProfiles,requirements:requirementContext(task,'html'),shortlistHTML:task.shortlists?.length?renderShortlist(task,'html',html):'',shortlist,rankingNotice:task.rankings?.length?rankingNotice:'',...options});
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><title>${html(task.requirements.title ?? '寻访任务')}</title><style>${evaluationReportStyles}</style><header><p>猎聘 · 本地评估材料</p><h1>候选人评估报告</h1><p class="report-subtitle">${html(task.requirements.title ?? '寻访任务')}</p><p class="note">所有判断均待人工复核。${rankingNotice}</p></header><main>${reportBrief(task,entries,summary,html)}<details class="full-report-appendix"><summary>完整资料与评估依据（需要时查看）</summary>${reportOutcome(task,html,{includeAll:true})}<div id="comparison">${comparisonTable(entries,{interactive:false})}</div>${renderShortlist(task,'html',html)}<div id="profiles"><h2 class="section-heading">简历详情与评估依据</h2><p class="note">已识别候选人的资料直接展示在下方，无需逐项展开。未关联记录单列在后，不计入名单。</p>${identifiedProfiles}${unlinkedTable(entries,html)}</div><div id="requirements">${requirementContext(task,'html')}</div><footer class="note">观察记录 ${summary.observations} 条 · 待确认操作 ${summary.unresolvedOperations} 项。观察记录数量不等于候选人人数；原始记录保留在下方审计附录中。</footer></details><details class="audit-appendix"><summary>原始采集记录（技术审计，可选查看）</summary>${entries.map(row=>`<h3>${html(row.key)}</h3><pre>${html(JSON.stringify(row.observations,null,2))}</pre>`).join('')}</details></main></html>`;
}
export function exportTask(file, {output, format}) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('必须明确指定导出路径');
  const task = readTask(file);
  if(format==='html')return exportEvaluationBundle(task,output,{render:options=>renderReport(task,'html',options),summary:taskSummary(task)});
  const content = renderReport(task, format);
  // Never overwrite a task, an existing report, or follow a destination symlink.
  fs.writeFileSync(output, content, {flag:'wx', mode:0o600});
  return {output, format, summary:taskSummary(task)};
}
