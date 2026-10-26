#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) throw new Error('Usage: render-sourcing-plan --input <sourcing-request.json> --output <sourcing-plan.html>');
  const input = JSON.parse(await readFile(path.resolve(args.input), 'utf8'));
  validateInput(input);
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderPlan(input));
  console.log(output);
} catch (error) {
  console.error(`Sourcing plan render failed: ${error.message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument !== '--input' && argument !== '--output') throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    parsed[argument.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function validateInput(input) {
  // Runtime schema check for the SourcingRequest envelope. Skill scripts ship
  // standalone (no node_modules in distribution skill dirs), so this validator
  // is intentionally self-contained rather than imported from @hunter/core.
  const isoDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (input.requestType !== 'hunter-sourcing') throw new Error('requestType must be hunter-sourcing');
  if (!input.projectId) throw new Error('projectId is required');
  const auth = input.startAuthorization;
  // Strict boolean and strict ISO-8601: a historical "approved": "true"
  // string, a bare date, or a free-form timestamp must not count as consent.
  if (!auth || auth.approved !== true) throw new Error('startAuthorization.approved must be true');
  if (typeof auth.approvedAt !== 'string' || !isoDateTime.test(auth.approvedAt) || Number.isNaN(Date.parse(auth.approvedAt))) {
    throw new Error('startAuthorization.approvedAt must be a valid ISO-8601 timestamp');
  }
  if (auth.source !== 'current_conversation') throw new Error('startAuthorization.source must be "current_conversation"');
  if (!input.persona || !input.confirmedChannels || !input.searchParameters) {
    throw new Error('persona, confirmedChannels and searchParameters are required');
  }
}

function renderPlan(input) {
  const channels = Object.keys(input.channelPlans ?? {}).filter(channel => input.channelPlans[channel] && typeof input.channelPlans[channel] === 'object');
  const authorized = input.startAuthorization?.approved === true;
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.projectId)} · 寻访方案 Sourcing Plan</title>
<style>
:root{--ink:#13283a;--ink-2:#304657;--paper:#f3f0e9;--sheet:#fffdfa;--line:#dcd7cc;--muted:#78838b;--gold:#b7904b;--jade:#17725f;--warn:#9a6727}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.64}.page{width:min(1180px,calc(100% - 28px));margin:20px auto 56px}.cover{position:relative;overflow:hidden;padding:34px 42px 30px;background:var(--ink);color:#fff;border-radius:4px;box-shadow:0 22px 55px rgba(19,40,58,.16)}.cover:after{content:"";position:absolute;right:-110px;top:-150px;width:450px;height:450px;border:1px solid rgba(255,255,255,.12);border-radius:50%;box-shadow:0 0 0 55px rgba(255,255,255,.025),0 0 0 110px rgba(255,255,255,.02)}.kicker{position:relative;z-index:1;color:#d5bb89;font-size:12px;letter-spacing:.22em;text-transform:uppercase}.cover h1{position:relative;z-index:1;margin:24px 0 0;font-family:"Iowan Old Style","Songti SC",serif;font-size:clamp(34px,5vw,58px);font-weight:500;line-height:1.08;letter-spacing:-.02em}.cover-meta{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1.15fr) minmax(120px,.7fr) minmax(180px,1fr);gap:18px;margin-top:28px;padding-top:14px;border-top:1px solid rgba(255,255,255,.18)}.cover-meta small{display:block;color:#91a3af;font-size:12px;letter-spacing:.08em}.cover-meta strong{display:block;margin-top:4px;font-weight:500;color:#f6f2ea;overflow-wrap:anywhere}.status-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:-1px 0 12px;border:1px solid var(--line);background:#f8f5ee}.status-strip div{padding:10px 14px;border-right:1px solid var(--line)}.status-strip div:last-child{border-right:0}.status-strip small{display:block;color:var(--muted);font-size:12px}.status-strip strong{display:block;margin-top:2px;color:var(--ink-2);font-size:14px;font-weight:500}.sheet{background:var(--sheet);border:1px solid var(--line);box-shadow:0 12px 32px rgba(19,40,58,.06)}.section{display:grid;grid-template-columns:76px 1fr;border-bottom:1px solid var(--line)}.section:last-child{border-bottom:0}.section-mark{padding:22px 15px;border-right:1px solid var(--line);color:var(--gold);font-family:"Iowan Old Style",serif;font-size:27px}.section-body{padding:22px 26px}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:12px}.section h2{margin:0;font-family:"Iowan Old Style","Songti SC",serif;font-size:21px;font-weight:500}.section-note{color:var(--muted);font-size:12px}.analysis-title{margin:30px 0 9px;color:var(--jade);font-size:12px;letter-spacing:.18em;text-transform:uppercase}.analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.analysis-card{position:relative;padding:17px;border:1px solid #dbe3e3;border-left:3px solid #cfd8d8;background:#f9fbfa;box-shadow:0 3px 10px rgba(19,40,58,.025)}.analysis-card h3{margin:0 0 9px;font-family:"Iowan Old Style","Songti SC",serif;font-size:17px;font-weight:500}.analysis-card.must-have{border-left-color:var(--jade);background:#f2f7f5}.analysis-card.nice-to-have{border-left-color:#80936b;background:#f7f8f2}.analysis-card.exclusion{border-left-color:#a85f4c;background:#fbf4f2}.analysis-card.unknown{border-left-color:var(--gold);background:#fcf8ef}.analysis-card.search-card{border-left-color:var(--ink);background:#f5f3ee;box-shadow:none}.analysis-card.channel-plan-card{border-left-color:var(--jade);background:#f4f8f6;box-shadow:none}.analysis-card.channel-plan-card h3{padding-bottom:10px;border-bottom:1px solid #d5ddd8}.analysis-card.search-card h3{padding-bottom:10px;border-bottom:1px solid #d9d4c9}.analysis-list{margin:0;padding-left:18px}.analysis-list li{margin:5px 0}.plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.plan-grid h4{margin:0 0 8px;color:var(--jade);font-size:11px;letter-spacing:.1em}table{width:100%;border-collapse:collapse}th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #e5e8e6}th{width:96px;color:var(--muted);font-size:12px;font-weight:500}.pending{display:inline-flex;align-items:center;gap:6px;color:var(--warn);font-size:13px}.pending:before{content:"";width:5px;height:5px;border-radius:50%;background:#d5a24f}.badge{display:inline-block;padding:3px 9px;border:1px solid #bcd2c9;border-radius:2px;color:var(--jade);font-size:12px;background:#eef5f1}.badge+.badge{margin-left:6px}.approval{display:flex;justify-content:space-between;align-items:center;gap:28px;margin-top:18px;padding:22px 30px;background:var(--ink);color:#fff;border-radius:4px}.approval strong{font-family:"Iowan Old Style","Songti SC",serif;font-size:19px;font-weight:500}.approval p{margin:4px 0 0;color:#b9c6ce;font-size:12px}.approval .status{flex:0 0 auto;padding:7px 10px;border:1px solid rgba(255,255,255,.25);color:#d5bb89;font-size:12px;letter-spacing:.12em}.paths{margin-top:16px;padding:14px 18px;border:1px dashed var(--line);background:#faf8f2;color:var(--muted);font-size:12px;line-height:1.9}.paths code{color:var(--ink-2)}.footer{padding:18px 4px;color:var(--muted);font-size:12px;text-align:center}@media(max-width:960px){.cover-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.plan-grid{grid-template-columns:1fr}.analysis-grid{grid-template-columns:1fr}}@media(max-width:760px){.cover{padding:28px 24px 26px}.cover-meta{grid-template-columns:1fr;margin-top:22px}.status-strip{grid-template-columns:1fr}.status-strip div{border-right:0;border-bottom:1px solid var(--line)}.status-strip div:last-child{border-bottom:0}.section{grid-template-columns:1fr}.section-mark{padding:16px 20px 0;border-right:0;font-size:20px}.section-body{padding:13px 20px 22px}.approval{flex-direction:column;align-items:flex-start}}@media print{body{background:#fff}.page{width:100%;margin:0}.cover,.sheet,.approval{box-shadow:none}.cover{border-radius:0}}
</style></head><body><main class="page">
<header class="cover"><div class="kicker">Hunter Works · Sourcing Plan · 寻访方案</div><h1>${escapeHtml(input.projectId)}</h1><div class="cover-meta">
  <div><small>已确认渠道</small><strong>${input.confirmedChannels.map(escapeHtml).join('、') || '待确认'}</strong></div>
  <div><small>候选人池 / 短名单目标</small><strong>${displayText(input.searchParameters.poolTarget)} / ${displayText(input.searchParameters.shortlistTarget)}</strong></div>
  <div><small>授权状态</small><strong>${authorized ? '已授权开始搜索' : '未授权'}</strong></div>
  <div><small>授权时间</small><strong>${escapeHtml(input.startAuthorization?.approvedAt || '待确认')}</strong></div>
</div></header>
<aside class="status-strip">
  <div><small>人才画像</small><strong>已确认</strong></div>
  <div><small>寻访方案</small><strong>${channels.length} 个渠道 · search / filters / scoring</strong></div>
  <div><small>方案用途</small><strong>只读执行依据，执行中不得修改口径</strong></div>
</aside>
<div class="sheet">
  <section class="section"><div class="section-mark">01</div><div class="section-body"><div class="section-head"><h2>人才画像</h2><span class="section-note">用户已确认</span></div><div class="analysis-grid">
    ${analysisList('硬性要求 mustHave', input.persona.mustHave, 'must-have')}
    ${analysisList('加分项 niceToHave', input.persona.niceToHave, 'nice-to-have')}
    ${analysisList('排除项 exclusions', input.persona.exclusions, 'exclusion')}
    ${analysisList('尚未确认 unknowns', input.persona.unknowns, 'unknown')}
  </div></div></section>
  <section class="section"><div class="section-mark">02</div><div class="section-body"><div class="section-head"><h2>平台中立搜索参数</h2><span class="section-note">跨渠道通用</span></div>
    <article class="analysis-card search-card"><table><tbody>
      ${tableRow('关键词组 keywordGroups', input.searchParameters.keywordGroups)}
      ${tableRow('地点 locations', input.searchParameters.locations)}
      ${tableRow('目标机构 targetCompanies', input.searchParameters.targetCompanies)}
      ${tableRow('排除公司 excludedCompanies', input.searchParameters.excludedCompanies)}
      ${tableRow('排除条件 exclusions', input.searchParameters.exclusions)}
      ${tableRow('候选人池目标 poolTarget', input.searchParameters.poolTarget)}
      ${tableRow('短名单目标 shortlistTarget', input.searchParameters.shortlistTarget)}
    </tbody></table></article>
  </div></section>
  ${renderChannelPlans(input.channelPlans)}
</div>
<div class="approval"><div><strong>寻访方案已就绪</strong><p>${authorized ? '已获本次对话授权；本文件是只读执行依据，搜索与评估过程不得修改人才画像、渠道策略或方案口径。' : '尚未获得开始搜索授权。'}</p></div><span class="status">${authorized ? 'AUTHORIZED' : 'PENDING'}</span></div>
<div class="paths">对齐报告：<code>${escapeHtml(input.alignReportPath || '待确认')}</code><br>对齐数据：<code>${escapeHtml(input.alignResultPath || '待确认')}</code><br>交接数据：<code>sourcing-request.json（本文件的数据来源，机器可读）</code></div>
<footer class="footer">cskh-align · ${escapeHtml(input.projectId)} · 寻访方案为只读业务文档，执行权在 cskh-sourcing</footer>
</main></body></html>`;
}

function renderChannelPlans(plans) {
  const channels = Object.entries(plans ?? {}).filter(([, plan]) => plan && typeof plan === 'object');
  if (!channels.length) return '';
  return channels.map(([channel, plan], index) => {
    const search = plan.search ?? {};
    const filters = plan.filters ?? {};
    const scoring = plan.scoring ?? {};
    return `<section class="section"><div class="section-mark">${String(index + 3).padStart(2, '0')}</div><div class="section-body"><div class="section-head"><h2>渠道寻访方案 · ${escapeHtml(channel)}</h2><span class="section-note">search / filters / scoring 三层</span></div>
    <article class="analysis-card channel-plan-card"><h3>${escapeHtml(channel)} 执行口径</h3>
    <div class="plan-grid">
      <div><h4>search · 平台原生可传</h4><table><tbody>
        ${tableRow('关键词 keywords', search.keywords)}
        ${tableRow('职位限定 title', search.title)}
        ${tableRow('地点 location', search.location)}
        ${tableRow('当前公司 currentCompany', search.currentCompany)}
        ${tableRow('过往公司 pastCompany', search.pastCompany)}
        ${tableRow('学校 school', search.school)}
        ${tableRow('行业 industry', search.industry)}
        ${tableRow('人脉度数 connection', search.connection)}
        ${tableRow('语言 language', search.language)}
        ${tableRow('数量上限 limit', search.limit)}
      </tbody></table></div>
      <div><h4>filters · 硬淘汰 / 保留</h4><table><tbody>
        ${tableRow('头衔必含 titleMustInclude', filters.titleMustInclude)}
        ${tableRow('头衔排除 titleExclude', filters.titleExclude)}
        ${tableRow('最低年限 minExperienceYears', filters.minExperienceYears)}
        ${tableRow('偏好公司 preferredCompanies', filters.preferredCompanies)}
        ${tableRow('排除公司 excludedCompanies', filters.excludedCompanies)}
        ${tableRow('必备技能 requiredSkills', filters.requiredSkills)}
        ${tableRow('地点匹配 locationMatch', filters.locationMatch)}
        ${tableRow('最低学历 degreeMin', filters.degreeMin)}
        ${tableRow('逻辑推导规则 derived', filters.derived)}
      </tbody></table></div>
      <div><h4>scoring · 软性加分</h4><table><tbody>
        ${tableRow('mustHave', scoring.mustHave)}
        ${tableRow('niceToHave', scoring.niceToHave)}
        ${tableRow('权重 weights', scoring.weights ? Object.entries(scoring.weights).map(([key, value]) => `${key}=${value}`) : undefined)}
      </tbody></table></div>
    </div></article></div></section>`;
  }).join('');
}

function analysisList(title, values, variant) {
  return `<article class="analysis-card ${variant}"><h3>${title}</h3>${listValue(values)}</article>`;
}

function tableRow(label, value) {
  const display = Array.isArray(value) ? value.filter(hasValue).join('；') : value;
  return `<tr><th>${escapeHtml(label)}</th><td>${hasValue(display) ? escapeHtml(display) : '<span class="pending">待确认</span>'}</td></tr>`;
}

function listValue(values) {
  const list = Array.isArray(values) ? values.filter(hasValue) : hasValue(values) ? [values] : [];
  if (!list.length) return '<span class="pending">待确认</span>';
  return `<ul class="analysis-list">${list.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function displayText(value) {
  return hasValue(value) ? escapeHtml(value) : '待确认';
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
