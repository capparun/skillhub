#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const JBF_SECTIONS = [
  ['meta', '01', '职位与客户信息', [
    ['consultant', '顾问'], ['date', '日期'], ['positionTitle', '职位名称'], ['client', '客户'],
    ['location', '工作地点'], ['website', '官方网站'], ['contactName', '联系人'],
    ['contactTitle', '联系人职位'], ['contactEmail', '联系邮箱'], ['contactPhone', '联系电话'],
  ]],
  ['companyProfile', '02', '公司概况', [
    ['globalRevenue', '全球营收'], ['globalHeadcount', '全球员工数'],
    ['countryRegionRevenue', '国家/地区营收'], ['countryRegionHeadcount', '国家/地区员工数'],
    ['historyProductsServices', '公司历史、产品与服务', true],
    ['majorCustomersSuppliersCompetitors', '主要客户、供应商、竞争对手及目标公司', true],
    ['objectivesGrowthTargets', '公司目标与增长计划', true], ['offLimits', '禁止寻访公司', true],
  ]],
  ['vacancy', '03', '招聘背景', [
    ['type', '新增或替补'], ['reason', '招聘原因', true], ['openDuration', '职位开放时长'],
    ['competingAgencies', '其他招聘机构数量'], ['interviewedCandidates', '已面试候选人与未通过原因', true],
    ['availableCandidates', '已有候选人及优劣势', true], ['confidential', '是否保密'],
    ['disclosureStage', '客户名称披露阶段'],
  ]],
  ['candidatePersonalData', '04', '候选人基本要求', [
    ['ageExperience', '年龄/经验'], ['preferredNationality', '国籍偏好'],
    ['education', '学历'], ['languages', '语言能力'],
  ]],
  ['positionScope', '05', '岗位职责与范围', [
    ['mainChallenges', '岗位主要挑战', true], ['keyFocus', '核心关注事项', true],
    ['mustHave', '必备技能与资质', true], ['travelRate', '出差比例'], ['careerPath', '职业发展路径', true],
  ]],
  ['organization', '06', '组织架构', [
    ['directManagerName', '直属上级姓名'], ['directManagerTitleLocation', '直属上级职位与地点'],
    ['organizationChart', '相关组织架构', true], ['dottedManagerName', '虚线汇报上级姓名'],
    ['dottedManagerTitleLocation', '虚线汇报上级职位与地点'],
    ['directIndirectReports', '直接/间接下属人数'], ['entitiesCovered', '覆盖实体与地点', true],
  ]],
  ['cultureLeadership', '07', '文化与领导力', [
    ['companyCulture', '公司文化', true], ['lineManagerBackgroundStyle', '上级背景与管理风格', true],
    ['idealPersonalityStyle', '理想个性与工作方式', true], ['teamLeadershipNeeds', '团队现状与所需领导风格', true],
  ]],
  ['compensation', '08', '薪酬福利与面试流程', [
    ['salary', '基础薪资'], ['bonus', '奖金'], ['benefits', '福利与津贴', true],
    ['interviewProcess', '面试流程', true], ['finalDecisionMaker', '最终决策人'],
  ]],
  ['sellingPoints', '09', '候选人吸引点', [['items', '机会卖点', true]]],
  ['screeningQuestions', '10', '初筛淘汰问题', [['items', '必须询问或一票否决的问题', true]]],
];

try {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) throw new Error('Usage: render-align-report --input <align.json> --output <report.html>');
  const input = JSON.parse(await readFile(path.resolve(args.input), 'utf8'));
  validateInput(input);
  const output = path.resolve(args.output);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, renderReport(input));
  console.log(output);
} catch (error) {
  console.error(`Align report failed: ${error.message}`);
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
  if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  if (!input.projectId || !roleTitle(input.role)) throw new Error('projectId and role are required');
  if (!input.confirmations?.persona) throw new Error('persona must be confirmed before rendering');
  if (!input.confirmations?.channels) throw new Error('channel strategy must be confirmed before rendering');
  if (!input.persona || !input.channelStrategy || !input.searchParameters) {
    throw new Error('persona, channelStrategy and searchParameters are required');
  }
  if (/apify/i.test(JSON.stringify(input.channelStrategy))) throw new Error('unsupported LinkedIn discovery mode');
}

function renderReport(input) {
  const title = roleTitle(input.role);
  const location = input.role?.location ?? field(input.jobBrief?.meta, 'location');
  const client = field(input.jobBrief?.meta, 'client');
  const confidentiality = field(input.jobBrief?.vacancy, 'confidential');
  const completeness = jbfCompleteness(input.jobBrief);
  const jbfBaseline = jbfBaselineStatus(input.jbfCompletion);
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} · Job Briefing & Alignment Report</title>
<style>
:root{--ink:#13283a;--ink-2:#304657;--paper:#f3f0e9;--sheet:#fffdfa;--line:#dcd7cc;--muted:#78838b;--gold:#b7904b;--jade:#17725f;--mist:#eaf1f2;--warn:#9a6727}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Avenir Next","PingFang SC","Microsoft YaHei",sans-serif;font-size:15px;line-height:1.72}.page{width:min(1120px,calc(100% - 32px));margin:32px auto 72px}.cover{position:relative;overflow:hidden;min-height:340px;padding:48px 54px;background:var(--ink);color:#fff;border-radius:4px;box-shadow:0 22px 55px rgba(19,40,58,.16)}.cover:after{content:"";position:absolute;right:-110px;top:-150px;width:450px;height:450px;border:1px solid rgba(255,255,255,.12);border-radius:50%;box-shadow:0 0 0 55px rgba(255,255,255,.025),0 0 0 110px rgba(255,255,255,.02)}.kicker{position:relative;z-index:1;color:#d5bb89;font-size:11px;letter-spacing:.22em;text-transform:uppercase}.cover h1{position:relative;z-index:1;max-width:720px;margin:38px 0 12px;font-family:"Iowan Old Style","Songti SC",serif;font-size:clamp(38px,6vw,68px);font-weight:500;line-height:1.06;letter-spacing:-.025em}.cover-sub{position:relative;z-index:1;color:#c8d2d9;font-size:15px}.cover-meta{position:absolute;z-index:1;left:54px;right:54px;bottom:40px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px;border-top:1px solid rgba(255,255,255,.18);padding-top:20px}.cover-meta small{display:block;color:#91a3af;font-size:9px;letter-spacing:.15em;text-transform:uppercase}.cover-meta strong{display:block;margin-top:4px;font-weight:500;color:#f6f2ea}.progress{margin-top:14px;height:3px;background:rgba(255,255,255,.14)}.progress i{display:block;height:100%;width:${completeness.percent}%;background:#d5bb89}.toc{display:flex;gap:6px;overflow:auto;margin:16px 0;padding:8px;background:rgba(255,255,255,.72);border:1px solid var(--line);border-radius:4px;backdrop-filter:blur(12px)}.toc a{flex:0 0 auto;padding:7px 11px;color:var(--ink-2);font-size:11px;text-decoration:none;border-radius:3px}.toc a:hover{background:var(--ink);color:#fff}.sheet{background:var(--sheet);border:1px solid var(--line);box-shadow:0 12px 32px rgba(19,40,58,.06)}.section{display:grid;grid-template-columns:116px 1fr;border-bottom:1px solid var(--line);scroll-margin-top:16px}.section:last-child{border-bottom:0}.section-mark{padding:30px 20px;border-right:1px solid var(--line);color:var(--gold);font-family:"Iowan Old Style",serif;font-size:32px}.section-body{padding:30px 34px}.section-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:20px}.section h2{margin:0;font-family:"Iowan Old Style","Songti SC",serif;font-size:24px;font-weight:500}.section-note{color:var(--muted);font-size:11px}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 32px}.field{padding:13px 0;border-top:1px solid #ece8df}.field.wide{grid-column:1/-1}.field-label{margin-bottom:5px;color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase}.field-value{white-space:pre-wrap;color:var(--ink-2)}.field-value ul,.analysis-list{margin:0;padding-left:18px}.pending{display:inline-flex;align-items:center;gap:6px;color:var(--warn);font-size:12px}.pending:before{content:"";width:5px;height:5px;border-radius:50%;background:#d5a24f}.analysis{margin-top:18px;border-color:#cbd6d8}.analysis .section-mark{background:#f0f5f4;color:var(--jade)}.analysis-title{margin:46px 0 12px;color:var(--jade);font-size:11px;letter-spacing:.18em;text-transform:uppercase}.analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.analysis-card{padding:22px;border:1px solid #dbe3e3;background:#f9fbfa}.analysis-card h3{margin:0 0 12px;font-family:"Iowan Old Style","Songti SC",serif;font-size:19px;font-weight:500}.analysis-card.full{grid-column:1/-1}.analysis-list li{margin:5px 0}.channel{padding:12px 0;border-top:1px solid #dfe6e5}.channel:first-of-type{border-top:0}.channel strong{display:block}.channel small{color:var(--muted)}table{width:100%;border-collapse:collapse}th,td{padding:11px 12px;text-align:left;vertical-align:top;border-bottom:1px solid #e5e8e6}th{width:170px;color:var(--muted);font-size:10px;letter-spacing:.08em;text-transform:uppercase;font-weight:500}.risk{margin:7px 0;padding-left:16px;position:relative}.risk:before{content:"";position:absolute;left:0;top:.65em;width:6px;height:1px;background:var(--gold)}.approval{display:flex;justify-content:space-between;align-items:center;gap:28px;margin-top:18px;padding:26px 30px;background:var(--ink);color:#fff;border-radius:4px}.approval strong{font-family:"Iowan Old Style","Songti SC",serif;font-size:21px;font-weight:500}.approval p{margin:4px 0 0;color:#b9c6ce;font-size:12px}.status{flex:0 0 auto;padding:7px 10px;border:1px solid rgba(255,255,255,.25);color:#d5bb89;font-size:10px;letter-spacing:.12em}.footer{padding:18px 4px;color:var(--muted);font-size:10px;text-align:center}@media(max-width:760px){.page{width:min(100% - 18px,1120px);margin-top:9px}.cover{padding:34px 26px;min-height:430px}.cover-meta{left:26px;right:26px;grid-template-columns:1fr 1fr}.section{grid-template-columns:1fr}.section-mark{padding:20px 24px 0;border-right:0;font-size:22px}.section-body{padding:16px 24px 26px}.fields,.analysis-grid{grid-template-columns:1fr}.field.wide,.analysis-card.full{grid-column:auto}.approval{align-items:flex-start;flex-direction:column}}@media print{body{background:#fff}.page{width:100%;margin:0}.cover,.sheet,.approval{box-shadow:none}.toc{display:none}.section{break-inside:avoid}.cover{border-radius:0}}
</style></head><body><main class="page">
<style>
.page{width:min(1180px,calc(100% - 28px));margin:20px auto 56px}
.page{--font-min:12px}
body{font-size:16px;line-height:1.64}
.cover{min-height:auto;padding:34px 42px 30px}
.cover h1{margin:24px 0 0;font-size:clamp(34px,5vw,58px)}
.cover-meta{position:relative;left:auto;right:auto;bottom:auto;grid-template-columns:minmax(0,1.35fr) minmax(0,1.15fr) minmax(120px,.7fr) minmax(180px,1fr);gap:18px;margin-top:28px;padding-top:14px}
.cover-meta strong{overflow-wrap:anywhere;line-height:1.45}
.toc-grid{position:sticky;top:8px;z-index:10;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;margin:12px 0;padding:7px;background:rgba(255,253,250,.94);border:1px solid var(--line);border-radius:4px;box-shadow:0 6px 20px rgba(19,40,58,.06);backdrop-filter:blur(14px)}
.toc-grid a{min-width:0;padding:7px 8px;color:var(--ink-2);font-size:var(--font-min);line-height:1.4;text-decoration:none;border-radius:3px;white-space:normal}
.toc-grid a:hover{background:var(--ink);color:#fff}
.brief-status{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:-1px 0 12px;border:1px solid var(--line);background:#f8f5ee}
.brief-status div{padding:10px 14px;border-right:1px solid var(--line)}.brief-status div:last-child{border-right:0}
.brief-status small{display:block;color:var(--muted);font-size:var(--font-min);line-height:1.4}.brief-status strong{display:block;margin-top:2px;color:var(--ink-2);font-size:14px;font-weight:500}
.section{grid-template-columns:76px 1fr}
.section-mark{padding:22px 15px;font-size:27px}
.section-body{padding:22px 26px}
.section-head{margin-bottom:12px}
.section h2{font-size:21px}
.fields{grid-template-columns:repeat(3,minmax(0,1fr));gap:0 22px}
.field{padding:9px 0}
.analysis-title{margin:30px 0 9px}
.analysis-grid{gap:12px}
.analysis-card{padding:17px}
.analysis-card h3{margin-bottom:9px;font-size:17px}
.analysis-card{position:relative;border-left:3px solid #cfd8d8;box-shadow:0 3px 10px rgba(19,40,58,.025)}
.analysis-card.must-have{border-left-color:var(--jade);background:#f2f7f5}
.analysis-card.nice-to-have{border-left-color:#80936b;background:#f7f8f2}
.analysis-card.exclusion{border-left-color:#a85f4c;background:#fbf4f2}
.analysis-card.unknown{border-left-color:var(--gold);background:#fcf8ef}
.analysis-card.channel-card{border-left-color:#46768b;background:#f2f6f8}
.analysis-card.risk-card{border-left-color:#b87935;background:#fbf5ed}
.analysis-card.search-card{border-left-color:var(--ink);background:#f5f3ee;box-shadow:none}
.channel-plan-card{border-left-color:var(--jade);background:#f4f8f6;box-shadow:none}
.channel-plan-card h3{padding-bottom:10px;border-bottom:1px solid #d5ddd8}
.plan-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.plan-grid h4{margin:0 0 8px;color:var(--jade);font-size:11px;letter-spacing:.1em}
.plan-grid th{width:96px;font-size:9px}
.plan-grid th,.plan-grid td{padding:6px 8px}
@media(max-width:900px){.plan-grid{grid-template-columns:1fr}}
.analysis-card.search-card h3{padding-bottom:10px;border-bottom:1px solid #d9d4c9}
th,td{padding:8px 10px}
.kicker,.cover-meta small,.section-note,.field-label,.analysis-title,th,.status,.footer{font-size:var(--font-min)}
.field-label{line-height:1.45;letter-spacing:.04em}.section-note{letter-spacing:.06em}.pending{font-size:13px}.footer{line-height:1.5}
.field-label{display:flex;align-items:center;justify-content:space-between;gap:8px}.field-status{flex:0 0 auto;padding:2px 5px;border:1px solid #d6ddda;border-radius:2px;color:#55716a;font-size:var(--font-min);font-weight:500;letter-spacing:0;background:#f1f6f3}.field-status.pending{border-color:#e3d2aa;color:#946b2d;background:#fff9eb}.field-status.not-applicable{border-color:#d7dbe0;color:#667380;background:#f4f5f6}.not-applicable{color:#667380}
@media(max-width:960px){.cover-meta{grid-template-columns:repeat(2,minmax(0,1fr))}.toc-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.cover{min-height:auto;padding:28px 24px 26px}.cover-meta{grid-template-columns:1fr;margin-top:22px}.toc-grid{top:4px;grid-template-columns:repeat(2,minmax(0,1fr))}.brief-status{grid-template-columns:1fr}.brief-status div{border-right:0;border-bottom:1px solid var(--line)}.brief-status div:last-child{border-bottom:0}.section{grid-template-columns:1fr}.section-mark{padding:16px 20px 0;border-right:0;font-size:20px}.section-body{padding:13px 20px 22px}.fields,.analysis-grid{grid-template-columns:1fr}.field.wide,.analysis-card.full{grid-column:auto}}
@media print{.toc-grid{display:none}}
</style>
<header class="cover"><div class="kicker">Job Briefing Form · Alignment Report</div><h1>${escapeHtml(title)}</h1><div class="cover-meta"><div><small>客户</small><strong>${displayText(client)}</strong></div><div><small>工作地点</small><strong>${displayText(location)}</strong></div><div><small>保密级别</small><strong>${displayText(confidentiality)}</strong></div><div><small>JBF 完整度</small><strong>${completeness.filled}/${completeness.total} 项 · ${completeness.percent}%</strong><div class="progress"><i></i></div></div></div></header>
<nav class="toc-grid" aria-label="JBF 章节导航">${JBF_SECTIONS.map(([key, number, label]) => `<a href="#jbf-${key}">${number} ${label}</a>`).join('')}<a href="#alignment">11 对齐结论</a></nav>
<aside class="brief-status"><div><small>JBF 基线</small><strong>${jbfBaseline.label}</strong></div><div><small>字段状态</small><strong>${completeness.filled}/${completeness.total} 项已有内容</strong></div><div><small>当前阶段</small><strong>${jbfBaseline.status === 'confirmed' ? '可确认交付与搜索决策' : '继续补全并确认 JBF'}</strong></div></aside>
<div class="sheet">${renderJbf(input.jobBrief, input.jbfCompletion)}</div>
<div class="analysis-title">Aligned Sourcing Brief · 经确认的寻访输入</div>
<div class="sheet analysis" id="alignment">${renderAnalysis(input)}</div>
<footer class="footer">cskh-align · ${escapeHtml(input.projectId)} · JBF 原始字段与对齐结论均作为只读交接物</footer>
</main></body></html>`;
}

function renderJbf(jobBrief = {}, jbfCompletion = {}) {
  return JBF_SECTIONS.map(([key, number, label, fields]) => {
    const source = normalizeSection(jobBrief[key]);
    const sectionStates = fields.map(([fieldKey]) => resolveFieldState(jbfCompletion, `${key}.${fieldKey}`, source[fieldKey]));
    const completed = sectionStates.filter(state => state.status === 'confirmed' || state.status === 'not_applicable').length;
    return `<section class="section" id="jbf-${key}"><div class="section-mark">${number}</div><div class="section-body"><div class="section-head"><h2>${label}</h2><span class="section-note">${completed}/${fields.length} 项已处理</span></div><div class="fields">${fields.map(([fieldKey, fieldLabel, wide]) => renderField(fieldLabel, source[fieldKey], wide, resolveFieldState(jbfCompletion, `${key}.${fieldKey}`, source[fieldKey]))).join('')}</div></div></section>`;
  }).join('');
}

function renderAnalysis(input) {
  const params = input.searchParameters;
  return `<section class="section"><div class="section-mark">11</div><div class="section-body"><div class="section-head"><h2>人才画像与寻访方案</h2><span class="section-note">已确认</span></div><div class="analysis-grid">
  ${analysisList('硬性要求', input.persona.mustHave, 'must-have')}${analysisList('加分项', input.persona.niceToHave, 'nice-to-have')}${analysisList('排除项', input.persona.exclusions, 'exclusion')}${analysisList('尚未确认', input.persona.unknowns, 'unknown')}
  <article class="analysis-card channel-card"><h3>渠道策略</h3>${renderChannelGroup('主渠道', input.channelStrategy.primary)}${renderChannelGroup('辅助渠道', input.channelStrategy.secondary)}${renderChannelGroup('补充渠道', input.channelStrategy.supplementary, { optional: true })}</article>
  <article class="analysis-card risk-card"><h3>风险提示</h3>${(input.risks ?? []).map(risk => `<div class="risk">${escapeHtml(risk)}</div>`).join('') || '<span class="pending">待确认</span>'}</article>
  <article class="analysis-card search-card full"><h3>搜索参数草案</h3><table><tbody>${tableRow('关键词组', params.keywordGroups)}${tableRow('地点', params.locations)}${tableRow('目标机构', params.targetCompanies)}${tableRow('排除公司', params.excludedCompanies)}${tableRow('排除条件', params.exclusions)}${tableRow('候选人池目标', params.poolTarget)}${tableRow('短名单目标', params.shortlistTarget)}</tbody></table></article>
  ${renderChannelPlans(input.channelPlans)}
  </div></div></section>`;
}

function renderChannelPlans(plans) {
  const channels = Object.entries(plans ?? {}).filter(([, plan]) => plan && typeof plan === 'object');
  if (!channels.length) return '';
  return channels.map(([channel, plan]) => {
    const search = plan.search ?? {};
    const filters = plan.filters ?? {};
    const scoring = plan.scoring ?? {};
    return '<article class="analysis-card channel-plan-card full"><h3>渠道寻访方案 · ' + escapeHtml(channel) + '</h3>'
      + '<div class="plan-grid"><div><h4>search（平台原生）</h4><table><tbody>'
      + tableRow('关键词', search.keywords) + tableRow('职位限定', search.title) + tableRow('地点', search.location)
      + tableRow('当前公司', search.currentCompany) + tableRow('过往公司', search.pastCompany) + tableRow('学校', search.school)
      + tableRow('行业', search.industry) + tableRow('人脉度数', search.connection) + tableRow('语言', search.language)
      + tableRow('数量上限', search.limit)
      + '</tbody></table></div><div><h4>filters（硬淘汰/保留）</h4><table><tbody>'
      + tableRow('头衔必含', filters.titleMustInclude) + tableRow('头衔排除', filters.titleExclude)
      + tableRow('最低年限', filters.minExperienceYears) + tableRow('偏好公司', filters.preferredCompanies)
      + tableRow('排除公司', filters.excludedCompanies) + tableRow('必备技能', filters.requiredSkills)
      + tableRow('地点匹配', filters.locationMatch) + tableRow('最低学历', filters.degreeMin)
      + tableRow('逻辑推导规则', filters.derived)
      + '</tbody></table></div><div><h4>scoring（软性加分）</h4><table><tbody>'
      + tableRow('mustHave', scoring.mustHave) + tableRow('niceToHave', scoring.niceToHave)
      + tableRow('权重', scoring.weights ? Object.entries(scoring.weights).map(([k, v]) => k + '=' + v) : undefined)
      + '</tbody></table></div></div></article>';
  }).join('');
}

function analysisList(title, values, variant) {
  return `<article class="analysis-card ${variant}"><h3>${title}</h3>${listValue(values)}</article>`;
}

function renderChannelGroup(label, channels = [], { optional = false } = {}) {
  if (optional && !channels.length) return '';
  if (!channels.length) return `<div class="channel"><strong>${label}</strong><span class="pending">待确认</span></div>`;
  return channels.map(channel => {
    const details = [
      (channel.modes ?? []).map(modeLabel).join(' / '),
      channel.reason,
      channel.manualNextStep ? `下一步：${channel.manualNextStep}` : '',
    ].filter(hasValue).join(' · ');
    return `<div class="channel"><strong>${escapeHtml(label)} · ${escapeHtml(channel.label ?? channelLabel(channel.channel))}</strong><small>${escapeHtml(details)}</small></div>`;
  }).join('');
}

function channelLabel(channel) {
  return {
    'target-organization-mapping': '目标机构图谱',
    'professional-association': '行业协会与活动',
    'alumni-network': '校友网络',
    'referral-network': '推荐网络',
    'conference-speaker-list': '会议演讲者与专业内容作者',
  }[channel] ?? channel ?? '';
}

function renderField(label, value, wide = false, state = resolveFieldState({}, '', value)) {
  return `<div class="field${wide ? ' wide' : ''}"><div class="field-label"><span>${escapeHtml(label)}</span><span class="field-status ${escapeHtml(state.status)}">${escapeHtml(fieldStateLabel(state))}</span></div><div class="field-value">${valueHtml(value, state)}</div></div>`;
}

function valueHtml(value, state = {}) {
  if (state.status === 'not_applicable') return '<span class="not-applicable">不适用</span>';
  if (!hasValue(value)) return '<span class="pending">待确认</span>';
  if (Array.isArray(value)) return listValue(value);
  return escapeHtml(value);
}

function resolveFieldState(jbfCompletion, fieldPath, value) {
  const configured = jbfCompletion?.fields?.[fieldPath];
  if (configured?.status) return configured;
  return hasValue(value) ? { status: 'confirmed', source: 'document' } : { status: 'pending', source: 'missing' };
}

function fieldStateLabel(state) {
  if (state.status === 'not_applicable') return '不适用';
  if (state.status === 'pending') return '暂缺';
  if (state.source === 'user_confirmation') return '本轮确认';
  if (state.source === 'meeting_notes') return '会议记录';
  if (state.source === 'derived') return '待核实推导';
  return '源文件';
}

function jbfBaselineStatus(jbfCompletion = {}) {
  return jbfCompletion.status === 'confirmed'
    ? { status: 'confirmed', label: 'JBF 基线：已确认' }
    : { status: 'draft', label: 'JBF 基线：待确认' };
}

function listValue(values) {
  const list = Array.isArray(values) ? values.filter(hasValue) : hasValue(values) ? [values] : [];
  if (!list.length) return '<span class="pending">待确认</span>';
  return `<ul class="analysis-list">${list.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function tableRow(label, value) {
  const display = Array.isArray(value) ? value.filter(hasValue).join('；') : value;
  return `<tr><th>${escapeHtml(label)}</th><td>${hasValue(display) ? escapeHtml(display) : '<span class="pending">待确认</span>'}</td></tr>`;
}

function jbfCompleteness(jobBrief = {}) {
  let total = 0;
  let filled = 0;
  for (const [key, , , fields] of JBF_SECTIONS) {
    const source = normalizeSection(jobBrief[key]);
    for (const [fieldKey] of fields) {
      total += 1;
      if (hasValue(source[fieldKey])) filled += 1;
    }
  }
  return { total, filled, percent: Math.round((filled / total) * 100) };
}

function normalizeSection(value) {
  if (Array.isArray(value)) return { items: value };
  return value && typeof value === 'object' ? value : {};
}

function field(source, key) {
  return source && typeof source === 'object' ? source[key] : '';
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some(hasValue);
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function displayText(value) {
  return hasValue(value) ? escapeHtml(value) : '待确认';
}

function modeLabel(mode) {
  if (mode === 'xray') return 'X-Ray';
  if (mode === 'browser') return 'Browser';
  return mode;
}

function roleTitle(role) {
  return typeof role === 'string' ? role : role?.title;
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}


