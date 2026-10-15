import fs from 'node:fs';
import path from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('用法：node scripts/render-review.mjs <review.json> <new-report.html>');
const data = JSON.parse(fs.readFileSync(input, 'utf8'));
if (!data.jbf?.version || !data.jbf?.summary || !Number.isSafeInteger(data.requestedCount) || data.requestedCount < 1 ||
    !Array.isArray(data.candidates) || !Array.isArray(data.failures)) {
  throw new Error('需要 JBF version/summary、正整数 requestedCount、candidates 和 failures 数组');
}
if (data.performance) {
  const metrics = ['durationMs', 'totalReadAttempts', 'successfulReads', 'failedReads', 'averageReadMs', 'maxReadMs'];
  if (metrics.some(key => !Number.isSafeInteger(data.performance[key]) || data.performance[key] < 0) ||
      typeof data.performance.checkpointsUsed !== 'boolean' ||
      data.performance.totalReadAttempts !== data.candidates.length + data.failures.length ||
      data.performance.successfulReads !== data.candidates.length ||
      data.performance.failedReads !== data.failures.length) {
    throw new Error('性能统计与批次数量不一致');
  }
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const show = value => value === undefined || value === null || value === '' ? '待确认'
  : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const field = (label, value) => `<div class="field"><dt>${escape(label)}</dt><dd>${escape(show(value))}</dd></div>`;
const empty = message => `<p class="empty">${escape(message)}</p>`;
const detailList = (items, render, message) => Array.isArray(items) && items.length
  ? `<div class="item-list">${items.map(item => render(item ?? {})).join('')}</div>` : empty(message);
const statusLabel = status => ({ met: '已观察到', unknown: '待补证据', qualified: '证据符合',
  pending_evidence: '待补证据', not_qualified: '未达线', complete: '已完整读取',
  incomplete: '读取不完整', visible_unverified: '可见，未验证', not_expanded: '未展开',
  missing: '未观察到', success: '读取成功' })[status] || String(status || '未知');
const renderEvidence = items => detailList(items, item => `<div class="evidence-item">
  <div class="evidence-heading"><strong>${escape(item.label || item.criterion || '未命名评分项')}</strong>${item.required ? '<span class="required">必需</span>' : ''}<span class="evidence-state ${item.status === 'met' ? 'met' : 'unknown'}">${escape(statusLabel(item.status))}</span>${item.status === 'met' && Number.isFinite(item.points) ? `<b>+${escape(item.points)} 分</b>` : ''}</div>
  <p>${item.status === 'met' ? `命中 ${escape(item.quote || '已观察证据')}${item.source ? ` · 来源 ${escape(item.source)}` : ''}` : escape(item.reason || '本次未观察到对应证据，不等于不具备')}</p>
  </div>`, '本轮尚未评分，不能据此判断候选人是否符合要求。');
const renderExperience = items => detailList(items, item => `<div class="resume-item"><strong>${escape(item.title || '职位未记录')}</strong><span>${escape(item.company_name || item.company || '机构未记录')}${item.time ? ` · ${escape(item.time)}` : ''}</span>${item.description ? `<details><summary>查看工作内容</summary><p>${escape(item.description)}</p></details>` : ''}</div>`, '本次网页未读取到工作经历，不能据此判断没有相关经历。');
const renderEducation = items => detailList(items, item => `<div class="resume-item"><strong>${escape(item.school || '学校未记录')}</strong><span>${escape([item.degree, item.major, item.time].filter(Boolean).join(' · ') || '学历信息未记录')}</span></div>`, '本次网页未读取到教育经历。');
const renderHistory = items => detailList(items, item => `<div class="resume-item"><strong>${escape(item.title || '职位未记录')}</strong><span>${escape([item.stageLabel, item.currentStep].filter(Boolean).join(' · ') || '阶段未知')}</span></div>`, '本次未读取到项目记录，不等于从未投递或没有在途项目。');
const renderContactRecords = items => detailList(items, item => `<div class="resume-item"><strong>${escape([item.date, item.author].filter(Boolean).join(' · ') || '日期与记录人未记录')}</strong><p>${escape(item.content || '内容未记录')}</p></div>`, '本次未读取到可见联系记录，不等于从未联系。');
const renderContactChannels = items => {
  const explicit = Array.isArray(items) ? items.filter(item => item && typeof item === 'object' &&
    typeof item.channel === 'string' && item.channel.trim()) : [];
  return detailList(explicit, item => `<div class="resume-item"><strong>${escape(item.channel)}</strong><span>${escape(statusLabel(item.status || 'unknown'))}</span>${item.evidence ? `<small>${escape(item.evidence)}</small>` : ''}</div>`,
    '未取得可核验的历史触达渠道；最近联系日期不能代替渠道证据。');
};
const renderContacts = candidate => {
  const channels = [['phone', '电话'], ['email', '邮箱'], ['wechat', '微信'], ['skype', 'Skype']];
  return `<div class="contact-grid">${channels.map(([key, label]) => `<div><span>${label}</span><strong>${escape(candidate[key] || statusLabel(candidate.contactStatus?.[key]))}</strong>${candidate[key] && candidate.contactStatus?.[key] ? `<small>${escape(statusLabel(candidate.contactStatus[key]))}</small>` : ''}</div>`).join('')}</div>`;
};
const renderScoringRules = scoring => `<div class="rule-body">
  <p>${escape(scoring.scope || '本轮确认的 JBF 规则')}${Number.isFinite(scoring.passScore) ? ` · 及格线 ${escape(scoring.passScore)} 分` : ''}</p>
  ${detailList(scoring.criteria, item => `<div class="rule-item"><strong>${escape(item.label || item.id || '未命名规则')}</strong><span>${escape(item.weight ?? '未知')} 分${item.required ? ' · 必需' : ''}</span>${Array.isArray(item.evidenceTerms) && item.evidenceTerms.length ? `<small>匹配词：${escape(item.evidenceTerms.join('、'))}</small>` : ''}</div>`, '本轮没有可展示的评分项。')}
  ${scoring.unknownPolicy ? `<p class="empty">未知证据：${escape(scoring.unknownPolicy)}</p>` : ''}
  <details class="raw-data"><summary>核对原始评分规则</summary><pre class="raw-text">${escape(JSON.stringify(scoring, null, 2))}</pre></details>
  </div>`;
const seenIds = new Set();
const cards = data.candidates.map((c, index) => {
  if (!c || !c.id) throw new Error('候选人缺少 Gllue ID');
  if (seenIds.has(String(c.id))) throw new Error('重复候选人 ID，拒绝重复统计');
  seenIds.add(String(c.id));
  const score = typeof c.evaluation?.score === 'number' && Number.isFinite(c.evaluation.score) ? c.evaluation.score : '待评分';
  const scoreStatus = ({ qualified: '证据符合', pending_evidence: '待补证据', not_qualified: '未达线' })[c.evaluation?.status]
    || (c.evaluation?.status ? String(c.evaluation.status) : '待评分');
  const outreach = c.outreach?.allowed === false ? '阻止触达' : '触达待确认';
  const reasons = Array.isArray(c.outreach?.reasons) ? c.outreach.reasons.filter(Boolean).join('；') : c.outreach?.reasons;
  return `<article class="candidate-row"><details class="candidate-detail"><summary class="candidate-summary"><span class="index">${String(index + 1).padStart(2, '0')}</span><span class="identity"><strong>${escape(c.name || '姓名待确认')}</strong><small>${escape(c.company || '公司待确认')} · ${escape(c.title || '职位待确认')}</small></span><span class="score">${escape(score)}${typeof score === 'number' ? '<small> 分</small>' : ''}</span><span class="review-state">${escape(scoreStatus)}</span><span class="touch-state ${c.outreach?.allowed === false ? 'blocked' : ''}">${escape(outreach)}</span><span class="expand-label">详情</span></summary><div class="detail-body">
  <p class="detail-meta">归属顾问：${escape(show(c.owner))} · Gllue ID：${escape(c.id)}${c.readStatus && c.readStatus !== 'success' ? ` · 读取状态：${escape(c.readStatus)}` : ''}</p>
  ${reasons ? `<p class="warning">触达原因：${escape(reasons)}</p>` : ''}
  <section class="detail-section"><h3>评分依据 <span>${escape(scoreStatus)}</span></h3>${renderEvidence(c.evaluation?.evidence)}${Array.isArray(c.missingFields) && c.missingFields.length ? `<p class="missing">待补：${escape(c.missingFields.join('、'))}</p>` : ''}</section>
  <details class="context-section"><summary>查看简历与联系背景</summary><div class="context-body">
  <section class="detail-section"><h3>工作经历</h3>${renderExperience(c.experience)}</section>
  <section class="detail-section"><h3>教育经历</h3>${renderEducation(c.education)}</section>
  <section class="detail-section"><h3>项目与联系</h3><p class="context-line">项目读取：${escape(statusLabel(c.projectContext?.readStatus))} · 活跃状态：未知，不能据此判断可触达${c.lastContact ? ` · 最近联系：${escape(c.lastContact)}` : ''}</p>${renderHistory(c.applyHistory)}<h4>联系方式</h4>${renderContacts(c)}<h4>历史触达渠道</h4>${renderContactChannels(c.contactChannels)}<h4>可见联系记录</h4>${renderContactRecords(c.contactRecords)}</section>
  </div></details>
  ${c.writePreview ? `<section class="detail-section"><h3>新建 / 更新预览</h3><p class="empty">预览不是写入授权。</p><pre class="raw-text">${escape(show(c.writePreview))}</pre></section>` : ''}
  <details class="raw-data"><summary>核对原始结构化记录</summary><pre class="raw-text">${escape(JSON.stringify({ evaluation: c.evaluation, experience: c.experience, education: c.education, applyHistory: c.applyHistory, projectContext: c.projectContext, contacts: c.contacts, contactStatus: c.contactStatus, contactRecords: c.contactRecords, contactChannels: c.contactChannels, sourceRecord: c.sourceRecord }, null, 2))}</pre></details>
  </div></details></article>`;
}).join('');
const failures = data.failures.map(f => `<li><strong>ID ${escape(show(f.id))}</strong><span>读取失败</span><details><summary>查看原始错误</summary><pre>${escape(show(f.error))}</pre></details></li>`).join('');
const proposals = (data.shortlistProposal || []).map(item =>
  `<li><b>${escape(item.candidate?.name || item.id)}</b> · ${escape(item.id)} · ${escape(show(item.score))} 分</li>`).join('');
const duration = milliseconds => {
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes ? `${minutes}分${remainder}秒` : `${remainder}秒`;
};
const search = data.searchConditions;
const searchBrief = search && typeof search === 'object' && !Array.isArray(search)
  ? [search.fullText || search.keyword, search.scope === 'mine' ? '我的候选人' : search.scope === 'accessible' ? '可访问的人才' : search.scope,
    Number.isSafeInteger(search.limit) ? `上限 ${search.limit} 人` : null].filter(Boolean).join(' · ')
  : search ? String(search) : '未记录';
const performance = data.performance ? `<section class="run" aria-label="本轮执行信息"><h2 class="sr-only">批次性能</h2><div class="run-metrics">
  <span>总耗时 <strong>${escape(duration(data.performance.durationMs))}</strong></span>
  <span>平均 <strong>${escape(duration(data.performance.averageReadMs))}</strong>/人</span>
  <span>最长 <strong>${escape(duration(data.performance.maxReadMs))}</strong></span>
  <span>失败率 <strong>${escape(`${(data.performance.failedReads / Math.max(1, data.performance.totalReadAttempts) * 100).toFixed(1)}%`)}</strong></span>
  </div><details><summary>查看检查点与执行说明</summary><dl>${field('检查点', data.performance.checkpointsUsed ? '已使用' : '未使用')}${field('检查点决策', data.performance.checkpointDecision)}</dl></details></section>` : '';
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Gllue 库内候选人审核</title><style>
:root{color-scheme:light;--ink:#26352f;--muted:#607168;--line:#d6ddd5;--accent:#315f4b}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f4f3ed;color:var(--ink);font:16px/1.55 "PingFang SC","Microsoft YaHei",sans-serif}
main{max-width:1100px;margin:auto;padding:18px 24px}h1{font-size:28px;margin:3px 0}h2{font-size:21px;margin:0}p{margin:5px 0}small{font-size:14px}
.eyebrow{color:var(--accent);font-size:13px;letter-spacing:1px}.intro{border-bottom:2px solid var(--accent);padding-bottom:10px}.intro>p{font-size:15px;line-height:1.45}.intro small{color:var(--muted)}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.overview{padding:10px 0;border-bottom:1px solid var(--line)}.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--line)}.stat-item{padding:7px 12px;border-right:1px solid var(--line);font-size:14px;color:var(--muted)}.stat-item:first-child{padding-left:0}.stat-item:last-child{border-right:0}.stats b{display:block;font-size:23px;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums}.stats .attention b{color:#87520b}
.guard{font-size:14px;color:#46574e;margin:8px 0 3px}.search-brief{font-size:14px;color:var(--muted);overflow-wrap:anywhere}.run{margin-top:8px}.run-metrics{display:flex;flex-wrap:wrap;gap:6px 20px;color:var(--muted);font-size:14px}.run-metrics strong{color:var(--ink)}.method-detail{margin-top:6px}.method-body{padding:4px 0 12px}.method-body>details{margin-top:4px}
.jump{display:flex;flex-wrap:wrap;gap:5px 14px;font-size:14px}.jump a{color:var(--accent);text-decoration:none}.jump a:hover{text-decoration:underline}.jump a:focus-visible,summary:focus-visible{outline:2px solid var(--accent)}
.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:14px 0 8px}.candidates{scroll-margin-top:16px}
.list-head,.candidate-summary{display:grid;grid-template-columns:36px minmax(0,1fr) 82px 94px 104px 56px;align-items:center;gap:12px}.list-head{padding:7px 14px;background:#e8ede7;color:#53655a;font-size:13px;font-weight:600}.list-head span:nth-child(3),.list-head span:nth-child(4),.list-head span:nth-child(5){text-align:center}
.candidate-row{background:#fff;border-bottom:1px solid var(--line)}.candidate-row:first-of-type{border-top:1px solid var(--line)}.candidate-summary{border:0;padding:11px 14px;min-height:70px;color:var(--ink);font-size:14px}.candidate-summary:hover{background:#f5f8f4}.candidate-summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}.candidate-summary::-webkit-details-marker{display:none}.candidate-summary::marker{content:''}.identity{min-width:0}.identity strong{display:block;font-size:16px;line-height:1.35;overflow-wrap:anywhere}.identity small{display:block;color:var(--muted);font-size:14px;line-height:1.35;overflow-wrap:anywhere}.score{text-align:center;font-size:20px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums}.score small{font-size:12px;font-weight:400}.index{font-size:14px;color:#71847a;font-variant-numeric:tabular-nums}.review-state,.touch-state{text-align:center;color:#405d4c;font-size:14px}.touch-state.blocked{color:#87520b}.expand-label{text-align:right;color:var(--accent);font-size:14px}.expand-label::after{content:' ▾'}.candidate-detail[open] .expand-label::after{content:' ▴'}
.detail-body{padding:0 18px 16px 62px;border-top:1px solid var(--line);background:#fbfcfa}.detail-meta{font-size:14px;color:var(--muted);padding:10px 0 2px}.context-section{margin-top:6px}.context-section>summary{font-weight:600}.context-body{padding:0 0 10px}
dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 16px;margin:12px 0}.field{min-width:0}dt{font-size:14px;color:#66756d}dd{margin:2px 0;white-space:pre-wrap;overflow-wrap:anywhere}.warning{color:#87520b;background:#faf3df;padding:6px 10px;margin:6px 0}summary{cursor:pointer;color:var(--accent);padding:7px 0 2px;border-top:1px solid var(--line);font-size:14px}
.detail-section{padding:14px 0;border-bottom:1px solid var(--line)}.detail-section h3{font-size:16px;margin:0 0 8px}.detail-section h3 span{font-size:14px;font-weight:400;color:var(--muted)}.detail-section h4{font-size:14px;margin:14px 0 6px}.item-list{display:grid}.evidence-item{padding:7px 0;border-bottom:1px solid var(--line)}.evidence-heading{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px}.evidence-heading strong{font-size:15px}.evidence-heading b{margin-left:auto;font-size:14px;color:var(--accent)}.evidence-item p{font-size:14px;color:#526158;overflow-wrap:anywhere}.evidence-state{font-size:13px;color:#87520b}.evidence-state.met{color:var(--accent)}.required{font-size:12px;color:var(--muted)}.missing{font-size:14px;color:#87520b;margin-top:10px}.resume-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;padding:5px 0}.resume-item strong{font-size:15px}.resume-item span,.resume-item p{font-size:14px;color:var(--muted)}.resume-item details{flex-basis:100%}.resume-item details summary{border:0;padding:2px 0}.resume-item details p{white-space:pre-wrap}.empty,.context-line{font-size:14px;color:var(--muted)}.contact-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.contact-grid>div{min-width:0;padding:7px 8px;background:#f7f8f5}.contact-grid span,.contact-grid small{display:block;font-size:13px;color:var(--muted)}.contact-grid strong{display:block;font-size:14px;font-weight:500;overflow-wrap:anywhere}.raw-data{margin-top:10px}.raw-text{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;background:#f7f8f5;padding:12px;font:13px/1.5 ui-monospace,monospace}
.rule-body{padding:8px 0}.rule-body>p{font-size:14px;color:var(--muted)}.rule-item{display:flex;flex-wrap:wrap;gap:2px 12px;padding:7px 0;border-bottom:1px solid var(--line)}.rule-item strong{font-size:15px}.rule-item span,.rule-item small{font-size:14px;color:var(--muted)}.rule-item small{flex-basis:100%}
.bottom-section{margin-top:28px;border-top:1px solid var(--line);padding-top:16px;scroll-margin-top:16px}.bottom-section p{color:var(--muted)}.failures{list-style:none;margin:10px 0;padding:0}.failures li{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 14px;padding:8px 0;border-bottom:1px solid var(--line)}.failures li span{color:#87520b}.failures details{margin-left:auto}.failures details[open]{flex-basis:100%;margin-left:0}.failures pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.5 ui-monospace,monospace;background:#fff;padding:10px;max-width:100%}footer{margin-top:28px;border-top:2px solid var(--accent);padding-top:16px}footer small{color:var(--muted)}
@media(max-width:760px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.stat-item:nth-child(2){border-right:0}.stat-item:nth-child(-n+2){border-bottom:1px solid var(--line)}.stat-item:nth-child(3){padding-left:0}.contact-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.list-head,.candidate-summary{grid-template-columns:30px minmax(0,1fr) 72px 88px 48px}.list-head span:nth-child(5){display:none}.candidate-summary .touch-state{grid-column:2 / span 3;grid-row:2;text-align:left}.detail-body{padding-left:44px}}@media(max-width:640px){main{padding:14px 16px}h1{font-size:25px}dl{grid-template-columns:1fr}.list-head{display:none}.candidate-summary{grid-template-columns:26px minmax(0,1fr) 64px 30px;gap:8px;padding:10px 4px}.candidate-summary .review-state{grid-column:2;grid-row:2;text-align:left}.candidate-summary .touch-state{grid-column:3 / span 2;grid-row:2;text-align:right;font-size:12px}.candidate-summary .expand-label{grid-column:4;grid-row:1;font-size:0}.candidate-summary .expand-label::after{font-size:16px}.identity strong{font-size:16px}.identity small{font-size:13px}.score{font-size:18px}.detail-body{padding:0 8px 14px 34px}.section-head{display:block}.jump{margin-top:4px}.failures details{margin-left:0}}
@media print{html{scroll-behavior:auto}body{background:#fff}main{padding:0}.jump,.list-head{display:none}details::details-content{display:block}summary{display:none}.candidate-detail>summary{display:grid}.candidate-summary{break-after:avoid}.detail-section{break-inside:avoid}}
</style><main><section class="intro"><div class="eyebrow">GLLUE / 清单式审核 · 首屏优化版</div><h1>库内候选人审核</h1><p>${escape(data.jbf.summary)}</p><small>JBF ${escape(data.jbf.version)} · 本报告不执行发送或人才库写入</small></section>
<section class="overview" aria-label="本轮概览"><div class="stats"><span class="stat-item"><b>${data.candidates.filter(c => c.readStatus === 'success').length} / ${data.requestedCount}</b>读取成功 / 目标人数</span><span class="stat-item attention"><b>${data.candidates.filter(c => c.evaluation?.status === 'pending_evidence').length}</b>证据待核验</span><span class="stat-item attention"><b>${data.failures.length}</b>读取失败</span><span class="stat-item"><b>${data.candidates.filter(c => c.evaluation?.qualified === true).length}</b>评分合格</span></div>
<p class="guard"><strong>评分合格不等于允许触达。</strong>归属、项目和联系方式仍须核对。</p>
<p class="search-brief">检索：${escape(searchBrief)}</p>
<details class="method-detail"><summary>查看检索、评分与执行记录</summary><div class="method-body">${performance}
<details><summary>查看搜索条件与资料范围</summary><div class="rule-body"><p>检索：${escape(searchBrief)}</p><p>资料范围：标准简历与可见记录；未读取 PDF 附件。</p><details class="raw-data"><summary>核对原始搜索条件</summary><pre class="raw-text">${escape(JSON.stringify(data.searchConditions ?? null, null, 2))}</pre></details></div></details>
${data.jbf.scoring ? `<details><summary>查看本轮评分规则</summary>${renderScoringRules(data.jbf.scoring)}</details>` : ''}</div></details>
</section>
<section id="candidates" class="candidates"><div class="section-head"><h2>候选人审核</h2><nav class="jump" aria-label="页面导航"><a href="#candidates">候选人 ${data.candidates.length}</a>${data.shortlistProposal ? '<a href="#shortlist">短名单建议</a>' : ''}<a href="#failures">读取失败 ${data.failures.length}</a><a href="#next">下一步</a></nav></div><div class="list-head" aria-hidden="true"><span>序号</span><span>候选人 / 当前经历</span><span>评分</span><span>证据状态</span><span>触达状态</span><span></span></div>${cards || '<p>暂无候选记录，不能据此断言人才库无人匹配。</p>'}</section>
${data.shortlistProposal ? `<section id="shortlist" class="bottom-section"><h2>待人工选择的短名单建议</h2><p>这是评分建议，不是最终短名单，也不产生触达或写入授权。</p><ul>${proposals || '<li>本轮无评分合格建议。</li>'}</ul></section>` : ''}
<section id="failures" class="bottom-section"><h2>读取失败与待补证据</h2><ul class="failures">${failures || '<li>本输入未记录失败，请结合批次数量核对。</li>'}</ul></section>
<footer id="next"><h2>下一步由你决定</h2><p>是否继续 LinkedIn 等外部寻访？是否将选定人选加入最终短名单？</p><p>触达渠道、个性化话术及逐人新建 / 更新内容均需人工确认。此报告不会自动提交。</p><small>仅供本地审核，含敏感人才信息，请勿公开上传。</small></footer></main></html>`;
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, html, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log(path.resolve(output));
