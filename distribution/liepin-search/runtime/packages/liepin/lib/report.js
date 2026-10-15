import fs from 'node:fs';
import {reportControls,reportScriptHash} from './report-controls.js';
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
  for (const candidate of task.candidates) {
    sources[candidate.source] = (sources[candidate.source] ?? 0) + 1;
    observations += candidate.observations.length;
    if (candidate.observations.some(o => o.stage === 'detail' && ['readable', 'partial'].includes(o.data.status))) readableDetails++;
    if (candidate.evaluations?.length) evaluated++;
  }
  return {candidates:task.candidates.length, sources, observations, readableDetails, evaluated,unresolvedIdentities:(task.unlinkedObservations ?? []).filter(o=>o.identityStatus!=='linked').length,
    completedRounds:(task.rounds ?? []).filter(r => r.status === 'completed').length,
    unresolvedOperations:(task.operations ?? []).filter(o => ['started', 'unknown', 'blocked', 'failed'].includes(o.status)).length};
}
function rows(task) {
  return [...task.candidates.map(candidate => ({
    key:candidate.key, source:candidate.source, identity:candidate.identity, tags:candidate.tags.join('、'),
    identityStatus:'identified',
    findings:candidate.evaluations?.at(-1)?.findings ?? [], observations:candidate.observations,
  })),...(task.unlinkedObservations ?? []).filter(o=>o.identityStatus!=='linked').map(o=>({key:`未识别记录:${o.id}`,source:o.source,identity:'',tags:'',
    identityStatus:'unresolved',findings:[],observations:[o]}))];
}
export function renderReport(task, format) {
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
    const fields = ['taskTitle','requirements','name','position','company','city','shortlistStage','shortlistReason','evidenceLevel','changeReason','evidenceGaps','key','source','identity','identityStatus','reviewOrder','reviewReason','tags','findings','observations'];
    const requirements={criteria:task.requirements.criteria??[],sources:(task.requirements.sources??[]).map(({id,kind,title})=>({id,kind,title})),openQuestions:task.requirements.openQuestions??[]};
    return '\ufeff' + [fields.map(csv).join(','), ...entries.map(entry => {
      const row={...entry,...entry.presentation,taskTitle:task.requirements.title??'寻访任务',requirements};
      return fields.map(field => csv(typeof row[field] === 'object' ? JSON.stringify(row[field]) : row[field])).join(',');
    })].join('\r\n') + '\r\n';
  }
  const summary = taskSummary(task);
  if (format === 'markdown') return `# ${markdown(task.requirements.title ?? '寻访任务')}\n\n本地证据报告；所有判断均待人工复核。${rankingNotice}\n\n已识别候选人：${summary.candidates}；缺少稳定 ID 的记录：${summary.unresolvedIdentities}；观察记录：${summary.observations}；待确认操作：${summary.unresolvedOperations}。\n\n` + requirementContext(task,'markdown') + renderShortlist(task,'markdown',markdown) + entries.map(row => `## ${markdown(row.presentation.name)}\n\n人工复核顺序：${markdown(row.reviewOrder)}；理由：${markdown(row.reviewReason)}\n\n来源：${markdown(sourceLabel(row.source))}；标签：${markdown(row.tags)}\n\n${row.findings.map(f => `- ${markdown(findingTitle(f))}：${markdown(statusLabel(f.status))} — ${markdown(f.reason)}\n${f.evidence.map(e => `  - 原文：${markdown(e.quote)}（快照 ${markdown(e.hash)}）`).join('\n')}`).join('\n') || (row.identityStatus==='unresolved' ? '身份未确认；未合并、未评估。原始列表记录：'+markdown(JSON.stringify(row.observations)) : '尚未评估')}\n\n### 已保存的原始记录\n\n${markdown(JSON.stringify(row.observations, null, 2))}\n\n`).join('');
  if (format !== 'html') throw new Error('导出格式仅支持 json/csv/markdown/html');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${reportScriptHash}'; base-uri 'none'; form-action 'none'"><title>${html(task.requirements.title ?? '寻访任务')}</title><style>body{font:16px/1.8 system-ui,sans-serif;max-width:960px;margin:32px auto;padding:0 20px;color:#18232d}article{border-top:1px solid #ccd5dd;padding:16px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2{overflow-wrap:anywhere}small{font-size:14px;overflow-wrap:anywhere}p,blockquote{overflow-wrap:anywhere}summary{cursor:pointer}.report-toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:end;margin:16px 0}.report-toolbar input,.report-toolbar select,.report-toolbar button{font:inherit;padding:8px;max-width:100%;box-sizing:border-box}.report-toolbar label{display:flex;flex-direction:column;min-width:0}.report-toolbar [role=status]{flex-basis:100%}@media print{.report-toolbar{display:none}tr[hidden]{display:table-row}}.comparison-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:720px}th,td{border-bottom:1px solid #ccd5dd;text-align:left;vertical-align:top;padding:12px;font-size:14px}th{background:#eef2f5}td{overflow-wrap:anywhere}a{color:#18594c}h1{font-size:28px}h2{font-size:22px}@media(max-width:480px){body{margin:20px auto;padding:0 16px}h1{font-size:24px}h2{font-size:20px}}blockquote{border-left:3px solid #ccd5dd;margin:12px 0;padding-left:16px}</style><h1>${html(task.requirements.title ?? '寻访任务')}</h1><p>本地证据报告；所有判断均待人工复核。${rankingNotice}</p><p>已识别候选人 ${summary.candidates} · 缺少稳定 ID 的记录 ${summary.unresolvedIdentities} · 观察记录 ${summary.observations} · 待确认操作 ${summary.unresolvedOperations}</p>${requirementContext(task,'html')}${renderShortlist(task,'html',html)}${comparisonTable(entries)}${entries.map((row,index) => `<article id="candidate-${index}"><h2>${html(row.presentation.name)}</h2><p>${html([row.presentation.position,row.presentation.company,row.presentation.city].filter(Boolean).join(" · ") || "职位与公司待核实")}</p><p>${html(row.presentation.summary)}</p><p>资料状态：${html(row.presentation.detailStatus)} · ${row.findings.length ? "已有条件评估，待人工复核" : "尚未评估，不代表不匹配"}</p><p>人工复核顺序：${html(row.reviewOrder || '待复核')} · 理由：${html(row.reviewReason || '尚未记录')}</p><p>来源：${html(sourceLabel(row.source))} · 标签：${html(row.tags || '无')}</p>${row.findings.map(f => `<p><strong>${html(findingTitle(f))}：${html(statusLabel(f.status))}</strong> ${html(f.reason)}</p>${f.evidence.map(e => `<blockquote>${html(e.quote)}<br><small>快照：${html(e.hash)}</small></blockquote>`).join('')}`).join('') || '<p>尚未评估</p>'}${row.presentation.sections.map(section=>`<details><summary>${html(section.heading)}</summary><p style="white-space:pre-wrap">${html(section.text)}</p></details>`).join('')}<details><summary>审计附录：已保存的原始记录</summary><p>记录标识：${html(row.key)}</p><pre>${html(JSON.stringify(row.observations, null, 2))}</pre></details></article>`).join('')}<script>${reportControls}</script></html>`;
}
export function exportTask(file, {output, format}) {
  if (typeof output !== 'string' || !output.trim()) throw new Error('必须明确指定导出路径');
  const task = readTask(file);
  const content = renderReport(task, format);
  // Never overwrite a task, an existing report, or follow a destination symlink.
  fs.writeFileSync(output, content, {flag:'wx', mode:0o600});
  return {output, format, summary:taskSummary(task)};
}
