import fs from 'fs';
import path from 'path';
import os from 'os';

const OUTPUT_DIR = path.join(os.homedir(), '.hunter', 'sourcing');

function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
}

function autoDetectRisks(candidate, targetCity) {
  const risks = [];
  const expectCity = candidate.expectCity || '';
  const activeStatus = candidate.activeStatus || '';
  const wantJob = candidate.wantJob || '';
  const detailText = candidate.detailText || '';

  if (targetCity && expectCity && !expectCity.includes(targetCity) && !targetCity.includes(expectCity)) {
    risks.push(`期望城市(${expectCity})与目标(${targetCity})不一致`);
  }

  if (activeStatus.includes('看看') || activeStatus.includes('观望')) {
    risks.push('在职观望状态，需确认意愿强度');
  }

  if (activeStatus.includes('离职') && activeStatus.includes('急')) {
    risks.push('离职急寻，可能时间压力大');
  }

  if (activeStatus.includes('30天') || activeStatus.includes('三个月') || activeStatus.includes('半年')) {
    risks.push('活跃时间较久，需确认当前状态');
  }

  const recentJobMatch = detailText.match(/（(\d{4})\.(\d{2})\s+-\s+至今[，,]\s*(\d+)年(\d*)个月?）/);
  if (recentJobMatch) {
    const years = parseInt(recentJobMatch[3]) || 0;
    const months = parseInt(recentJobMatch[4]) || 0;
    if (years === 0 && months < 6) {
      risks.push('近期刚跳槽，稳定性需关注');
    }
  }

  const targetKeywords = ['造价', '商务', '工程', '项目经理'];
  const hasMatch = targetKeywords.some(kw => wantJob.includes(kw));
  if (wantJob && !hasMatch) {
    risks.push(`期望职位(${wantJob})与目标方向有偏离`);
  }

  return risks;
}

function extractHighlights(candidate) {
  const highlights = [];
  const detailText = candidate.detailText || '';
  const bonusMatched = candidate.evaluation?.bonus_matched || [];

  const certMatch = detailText.match(/资格证书[\s\S]*?([^\n]{2,20})/);
  if (certMatch) {
    const certs = certMatch[1].split(/[、，,]/).filter(c => c.trim());
    highlights.push(...certs.map(c => c.trim()).filter(c => c.length > 1));
  }

  if (detailText.includes('抽水蓄能')) highlights.push('抽水蓄能项目经验');
  if (detailText.includes('水电站')) highlights.push('水电站项目经验');
  if (detailText.includes('EPC')) highlights.push('EPC项目经验');
  if (detailText.includes('变更索赔')) highlights.push('变更索赔经验');
  if (detailText.includes('结算审计')) highlights.push('结算审计经验');

  for (const bonus of bonusMatched) {
    if (bonus.startsWith('experience_years')) {
      const yearMatch = bonus.match(/\d+/);
      if (yearMatch) highlights.push(`${yearMatch[0]}年经验`);
    }
    if (bonus.startsWith('skills')) {
      const skillMatch = bonus.match(/\(([^)]+)\)/);
      if (skillMatch) highlights.push(`技能:${skillMatch[1]}`);
    }
    if (bonus === 'must_have_keywords') highlights.push('关键词匹配');
    if (bonus === 'certificates') highlights.push('证书匹配');
    if (bonus === 'company_background') highlights.push('目标公司背景');
  }

  return [...new Set(highlights)].slice(0, 6);
}

export function generateMarkdownReport(meta, candidates, targetCity) {
  const { title, tag, keywords, city, timestamp, rounds, total, unique, detailEvaluated, finalQualified } = meta;
  const passRate = total > 0 ? Math.round((finalQualified / total) * 100) : 0;

  let md = `# 寻访报告 —— ${title || '未命名职位'}\n\n`;
  md += `| 项目 | 内容 |\n`;
  md += `|------|------|\n`;
  md += `| 寻访时间 | ${timestamp} |\n`;
  md += `| 标签 | ${tag} |\n`;
  md += `| 搜索关键词 | ${Array.isArray(keywords) ? keywords.join(' / ') : keywords} |\n`;
  md += `| 目标城市 | ${city || '不限'} |\n\n`;
  md += `## 数据概览\n\n`;
  md += `| 指标 | 数值 |\n`;
  md += `|------|------|\n`;
  md += `| 搜索轮次 | ${rounds || 1} |\n`;
  md += `| 累计收集 | ${total} |\n`;
  md += `| 去重后 | ${unique || total} |\n`;
  md += `| Detail 评估 | ${detailEvaluated || finalQualified} |\n`;
  md += `| 最终通过 | ${finalQualified} |\n`;
  md += `| 通过率 | ${passRate}% |\n\n`;
  md += `## 候选人名单（共 ${finalQualified} 人）\n\n`;
  md += `| 序号 | 姓名 | 年龄 | 学历 | 经验 | 当前公司 | 职位 | 期望城市 | 活跃状态 | 评分 | 匹配亮点 | 简历链接 |\n`;
  md += `|------|------|------|------|------|----------|------|----------|----------|------|----------|----------|\n`;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const highlights = extractHighlights(c).join('·');
    const profileUrl = c.profileUrl || c.resumeUrl || '#';
    const sourceLabel = c.channel === 'linkedin' || c.channel === 'linkedin-xray' || c.channel === 'linkedin-recruiter' ? 'LinkedIn' :
                        c.channel === 'maimai' ? '脉脉' :
                        c.channel === 'liepin' ? '猎聘' : (c.channel || '-');
    md += `| ${i + 1} | ${c.name || '未知'} | ${c.age || '-'} | ${c.education || '-'} | ${c.exp || c.expYears || '-'} | ${c.company || '-'} | ${c.title || '-'} | ${c.expectCity || '-'} | ${c.activeStatus || '-'} | **${c.evaluation?.score || 0}** | ${highlights} | ${sourceLabel}${profileUrl !== '#' ? ` · [查看](${profileUrl})` : ''} |\n`;
  }

  md += `\n`;
  const top20 = candidates.slice(0, 20);
  md += `## Top ${Math.min(top20.length, 20)} 候选人详细档案\n\n`;
  md += `---\n\n`;

  for (let i = 0; i < top20.length; i++) {
    const c = top20[i];
    const risks = autoDetectRisks(c, targetCity);
    const highlights = extractHighlights(c);
    const profileUrl = c.profileUrl || c.resumeUrl || '#';
    const isTop = i < 3 ? ' ⭐ 强烈推荐' : '';
    const sourceLabel = c.channel === 'linkedin' || c.channel === 'linkedin-xray' || c.channel === 'linkedin-recruiter' ? 'LinkedIn' :
                        c.channel === 'maimai' ? '脉脉' :
                        c.channel === 'liepin' ? '猎聘' : (c.channel || '-');
    md += `### #${i + 1} ${c.name || '未知'} | ${c.evaluation?.score || 0}分${isTop}\n\n`;
    md += `**来源渠道**：${sourceLabel}\n\n`;
    md += `**基本信息**\n`;
    md += `- 年龄：${c.age || '-'} | 性别：${c.gender || '-'} | 学历：${c.education || '-'}\n`;
    md += `- 经验：${c.exp || c.expYears || '-'} | 活跃状态：${c.activeStatus || '-'}\n\n`;
    md += `**职业信息**\n`;
    md += `- 当前公司：${c.company || '-'}\n`;
    md += `- 当前职位：${c.title || '-'}\n`;
    md += `- 期望职位：${c.wantJob || '-'}\n`;
    md += `- 期望城市：${c.expectCity || '-'}\n`;
    md += `- 当前地点：${c.location || c.city || '-'}\n\n`;
    md += `**评估详情**\n`;
    md += `- 硬性通过：${c.evaluation?.hard_passed?.join(', ') || '-'}\n`;
    if (c.evaluation?.bonus_matched?.length > 0) {
      md += `- 加分项：${c.evaluation.bonus_matched.map(b => `✅ ${b}`).join(' ')}\n`;
    }
    if (c.evaluation?.exclude_matched?.length > 0) {
      md += `- 排除项：${c.evaluation.exclude_matched.map(e => `❌ ${e}`).join(' ')}\n`;
    }
    md += `\n`;
    if (highlights.length > 0) {
      md += `**简历亮点**\n`;
      for (const h of highlights) {
        md += `- ${h}\n`;
      }
      md += `\n`;
    }
    if (risks.length > 0) {
      md += `**风险点** ⚠️\n`;
      for (const r of risks) {
        md += `- ${r}\n`;
      }
      md += `\n`;
    }
    if (profileUrl !== '#') {
      md += `**链接**：[打开 ${sourceLabel} 页面](${profileUrl})\n\n`;
    }
    md += `---\n\n`;
  }

  return md;
}

export function generateCSV(candidates, targetCity) {
  const headers = ['序号', '姓名', '年龄', '性别', '学历', '工作年限', '当前公司', '当前职位', '期望职位', '期望城市', '当前地点', '活跃状态', '评分', '硬性通过项', '加分项', '排除项', '风险点', '资料链接', '来源渠道', '标签'];
  let csv = headers.join(',') + '\n';

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const risks = autoDetectRisks(c, targetCity);
    const profileUrl = c.profileUrl || c.resumeUrl || '';
    const sourceLabel = c.channel === 'linkedin' || c.channel === 'linkedin-xray' || c.channel === 'linkedin-recruiter' ? 'LinkedIn' :
                        c.channel === 'maimai' ? '脉脉' :
                        c.channel === 'liepin' ? '猎聘' : (c.channel || '');

    const row = [
      i + 1,
      c.name || '未知',
      c.age || '',
      c.gender || '',
      c.education || '',
      c.exp || c.expYears || '',
      (c.company || '').replace(/,/g, '，'),
      (c.title || '').replace(/,/g, '，'),
      (c.wantJob || '').replace(/,/g, '，'),
      c.expectCity || '',
      c.location || c.city || '',
      c.activeStatus || '',
      c.evaluation?.score || 0,
      (c.evaluation?.hard_passed || []).join(';'),
      (c.evaluation?.bonus_matched || []).join(';'),
      (c.evaluation?.exclude_matched || []).join(';'),
      risks.join(';'),
      profileUrl,
      sourceLabel,
      c.tag || ''
    ];

    csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\n';
  }

  return csv;
}

export function generateJSON(meta, candidates, targetCity) {
  const enriched = candidates.map((c, i) => ({
    rank: i + 1,
    name: c.name,
    age: c.age,
    gender: c.gender,
    education: c.education,
    exp: c.exp || c.expYears,
    company: c.company,
    title: c.title,
    wantJob: c.wantJob,
    city: c.city,
    location: c.location,
    expectCity: c.expectCity,
    activeStatus: c.activeStatus,
    profileUrl: c.profileUrl || c.resumeUrl,
    evaluation: c.evaluation,
    highlights: extractHighlights(c),
    risks: autoDetectRisks(c, targetCity),
    channel: c.channel,
    sources: c.sources,
    tag: c.tag
  }));

  return JSON.stringify({
    meta: {
      ...meta,
      passRate: meta.total > 0 ? Math.round((meta.finalQualified / meta.total) * 100) + '%' : '0%'
    },
    candidates: enriched
  }, null, 2);
}

export function saveOutputs(meta, candidates, targetCity) {
  ensureOutputDir();

  const projectId = sanitizeFilename(meta.title || meta.tag || 'report');
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `${projectId}-${timestamp}`;

  const mdPath = path.join(OUTPUT_DIR, `${prefix}-report.md`);
  const csvPath = path.join(OUTPUT_DIR, `${prefix}-candidates.csv`);
  const jsonPath = path.join(OUTPUT_DIR, `${prefix}-candidates.json`);

  const md = generateMarkdownReport(meta, candidates, targetCity);
  const csv = generateCSV(candidates, targetCity);
  const json = generateJSON(meta, candidates, targetCity);

  fs.writeFileSync(mdPath, md, 'utf-8');
  fs.writeFileSync(csvPath, csv, 'utf-8');
  fs.writeFileSync(jsonPath, json, 'utf-8');

  return { mdPath, csvPath, jsonPath };
}

/**
 * 从候选人评估数据中提取权重字段值。
 * 返回对象，key 为字段名，value 为具体值（如 "PYP"、"5年"、"管理层"）。
 */
function extractWeightedFieldValues(c) {
  const text = [
    ...(c.evaluation?.reasons || []),
    ...(c.evaluation?.highlights || []),
    c.headline || '',
    c.title || '',
  ].join(' ').toLowerCase();

  const values = {};
  const headline = (c.headline || c.title || '').toLowerCase();

  // 课程体系
  const currMatch = text.match(/(eyfs|ib\s*pyp|pyp|montessori|reggio|waldorf)/i);
  if (currMatch) values.curriculum = currMatch[0].replace(/\s+/g, ' ').toUpperCase();

  // 管理经验
  const yearMatch = headline.match(/(\d+)\s*年.*管理|管理.*(\d+)\s*年/) || text.match(/(\d+)\s*年.*管理/);
  if (yearMatch) values.management = `${yearMatch[1] || yearMatch[2]}年`;
  else if (/head|principal|director|leader|园长/i.test(headline)) values.management = '管理层';

  // 母语英语信号
  if (/native|母语/i.test(text) || /^(us|uk|ca|au)$/i.test((c.location || '').trim())) {
    values.nativeEnglish = '✓';
  }

  // 国际背景
  if (/international|国际/i.test(text)) values.international = '✓';

  // 地域匹配（成都/四川）
  if (/chengdu|成都|sichuan|四川/i.test(text)) values.location = '成都';

  return values;
}

export function generateHTMLReport(meta, candidates, targetCity, options = {}) {
  const { title, keywords, city, timestamp, total, finalQualified } = meta;
  const passRate = total > 0 ? Math.round((finalQualified / total) * 100) : 0;
  const getScore = c => c.totalScore ?? c.evaluation?.score ?? 0;
  const avgScore = candidates.length > 0
    ? Math.round(candidates.reduce((s, c) => s + getScore(c), 0) / candidates.length)
    : 0;

  const tagHtml = [
    { num: total, label: '搜索收集' },
    { num: finalQualified, label: '通过初筛' },
    { num: passRate + '%', label: '通过率' },
    { num: avgScore, label: '平均分' },
  ].map(t => `<span class="tag"><b>${t.num}</b>${t.label}</span>`).join('');

  // 检测可用的权重字段（取并集）；调用方显式指定 fields 时以指定为准（保持传入顺序）
  const allFields = ['curriculum', 'management', 'nativeEnglish', 'international', 'location'];
  const fieldLabels = {
    curriculum: '课程体系',
    management: '管理经验',
    nativeEnglish: '母语英语',
    international: '国际背景',
    location: '地域'
  };
  const activeFields = Array.isArray(options.fields) && options.fields.length > 0
    ? options.fields.filter(f => allFields.includes(f))
    : allFields.filter(f =>
        candidates.some(c => extractWeightedFieldValues(c)[f])
      );

  // 构建表格行
  const tableRows = candidates.map((c, i) => {
    const v = extractWeightedFieldValues(c);
    const score = getScore(c);
    const recLevel = score >= 80 ? 'strong' : score >= 60 ? 'good' : score >= 40 ? 'maybe' : 'no';
    const recText = score >= 80 ? '强烈推荐' : score >= 60 ? '推荐' : score >= 40 ? '待定' : '不推荐';
    const scoreClass = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low';
    const profileUrl = c.profileUrl || (c.profileId ? `https://linkedin.com/in/${c.profileId}` : '#');

    const fieldCells = activeFields.map(f =>
      `<td>${v[f] ? `<span class="match-badge" title="从候选人资料提取">${v[f]}</span>` : '<span style="color:var(--muted)">—</span>'}</td>`
    ).join('');

    return `<tr data-score="${score}" data-qualified="${c.evaluation?.qualified ? 1 : 0}" data-has-curriculum="${v.curriculum ? 1 : 0}" data-has-management="${v.management ? 1 : 0}" data-location="${c.location || ''}">
      <td class="rank">${i + 1}</td>
      <td class="name"><a href="${profileUrl}" target="_blank">${c.name || '未知'}</a></td>
      <td class="title" title="${c.title || ''}">${(c.title || '').slice(0, 48)}${(c.title || '').length > 48 ? '…' : ''}</td>
      <td>${c.location || '—'}</td>
      <td><div class="score-cell"><span class="score-dot ${scoreClass}"></span><span class="score-num">${score}</span></div></td>
      <td><span class="rec-badge ${recLevel}">${recText}</span></td>
      ${fieldCells}
      <td class="link-cell"><a href="${profileUrl}" target="_blank" class="link-btn">LinkedIn ↗</a></td>
    </tr>`;
  }).join('');

  const fieldHeaders = activeFields.map(f => `<th>${fieldLabels[f]}</th>`).join('') + '<th>链接</th>';

  let tocItems = '';
  let contentSections = '';

  candidates.forEach((c, i) => {
    const risks = c.risks || autoDetectRisks(c, targetCity);
    const highlights = c.highlights || extractHighlights(c);
    const ch = c.channel || 'liepin';
    const isMaimai = ch === 'maimai';
    const resumeUrl = c.resumeUrl || c.profileUrl || c.link || (isMaimai && c.profileId ? `https://maimai.cn/contact/share/card?uid=${c.profileId}` : ch === 'linkedin' && c.profileId ? `https://linkedin.com/in/${c.profileId}` : c.resumeId ? `https://h.liepin.com/resume/showresumedetail/?res_id_encode=${c.resumeId}` : '#');
    const rawScore = getScore(c);
    const hasScore = rawScore > 0;
    const score = hasScore ? rawScore : '-';
    const rec = c.recommendation || (hasScore ? (rawScore >= 80 ? '强烈推荐' : rawScore >= 60 ? '推荐' : rawScore >= 40 ? '待定' : '不推荐') : '待评估');

    // 提取权重字段值
    const weightedValues = extractWeightedFieldValues(c);
    const weightedEntries = Object.entries(weightedValues);
    const weightedHtml = weightedEntries.length > 0
      ? `<div class="weight-bar">${weightedEntries.map(([k, val]) => `<span class="weight-badge"><b>${fieldLabels[k] || k}</b>${val}</span>`).join('')}</div>`
      : '';

    // 猎头视角：构建信息丰富的候选人卡片
    const infoLines = [];
    if (c.currentTitle || c.title) infoLines.push(['职位', c.currentTitle || c.title]);
    if (c.currentCompany || c.company) infoLines.push(['公司', c.currentCompany || c.company]);
    if (c.location || c.city) infoLines.push(['地点', c.location || c.city]);
    if (c.work_year || c.yearsOfExperience || c.exp) infoLines.push(['年限', c.work_year || (c.yearsOfExperience ? c.yearsOfExperience + '年' : c.exp)]);
    if (c.school || c.education) infoLines.push(['学校', c.school || c.education]);
    if (c.degree) infoLines.push(['学历', c.degree]);
    if (c.age) infoLines.push(['年龄', c.age + '岁']);
    if (c.active_status || c.activeStatus) infoLines.push(['活跃', c.active_status || c.activeStatus]);

    const infoHtml = infoLines.map(([k, v]) => `<span class="info-tag"><b>${k}</b>${v}</span>`).join('');

    // 经历概览
    const histCompanies = c.historical_companies || c.historicalCompanies || '';
    const expSummary = [];
    if (histCompanies) expSummary.push(`历任：${histCompanies}`);
    if (c.work_year || c.yearsOfExperience) expSummary.push(`总经验 ${c.work_year || c.yearsOfExperience + '年'}`);

    // 技能标签
    const tagsStr = c.tags || '';
    const tagList = typeof tagsStr === 'string' ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean).slice(0, 12) : [];

    // 简历摘要
    const summaryText = c.rawProfileText || c.listPageText || c.detailText || '';
    const summaryHtml = summaryText ? `<p class="summary">${summaryText.slice(0, 300)}${summaryText.length > 300 ? '…' : ''}</p>` : '';

    const hId = `h-${i}`;
    tocItems += `<a href="#${hId}" class="h2" data-target="${hId}">${c.name || '未知'} <small>${score}</small></a>`;

    contentSections += `
    <section id="${hId}">
      <h2>${c.name || '未知'}${hasScore ? ` <span class="score">${score}</span>` : ''} <span class="rec">${rec}</span></h2>
      ${weightedHtml}
      <div class="info-bar">${infoHtml}</div>
      ${expSummary.length > 0 ? `<p class="exp">${expSummary.join(' · ')}</p>` : ''}
      ${tagList.length > 0 ? `<p class="tags-line">${tagList.map(t => `<span class="tag-pill">${t}</span>`).join('')}</p>` : ''}
      ${highlights.length > 0 ? `<p class="hl"><strong>亮点</strong>　${highlights.join('；')}</p>` : ''}
      ${risks.length > 0 ? `<p class="risk"><strong>风险</strong>　${risks.join('；')}</p>` : ''}
      ${summaryHtml}
      ${!isMaimai && resumeUrl !== '#' ? `<p><a href="${resumeUrl}" target="_blank">查看简历 →</a></p>` : ''}
    </section>`;
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>寻访报告 — ${title || '未命名职位'}</title>
<style>
:root {
  --bg: #f5f5f7;
  --fg: #1d1d1f;
  --muted: #666;
  --border: #d2d2d7;
  --container-bg: #fff;
  --sidebar-bg: #fafafc;
  --accent: #0066cc;
  --accent-fg: #fff;
  --hl: #2d5a2d;
  --risk: #8b4513;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #c9d1d9;
    --muted: #8b949e;
    --border: #30363d;
    --container-bg: #161b22;
    --sidebar-bg: #0d1117;
    --accent: #58a6ff;
    --accent-fg: #0d1117;
    --hl: #7ee787;
    --risk: #f0883e;
  }
}
*{margin:0;padding:0;box-sizing:border-box}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
               "Noto Sans SC", "PingFang SC", "Hiragino Sans GB",
               "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.6;
  color: var(--fg);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}
.page { display: flex; min-height: 100vh; }
.sidebar {
  width: 200px;
  position: fixed;
  left: 0; top: 0;
  height: 100vh;
  overflow-y: auto;
  padding: 24px 12px 24px 16px;
  border-right: 1px solid var(--border);
  background: var(--sidebar-bg);
  z-index: 100;
}
.sidebar-header {
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.4px;
  color: var(--muted);
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.toc-list a {
  display: block;
  padding: 4px 8px;
  border-radius: 4px;
  color: var(--muted);
  text-decoration: none;
  font-size: 13px;
  line-height: 1.5;
  transition: all 0.12s;
}
.toc-list a:hover { color: var(--accent); background: var(--bg); }
.toc-list a.active { color: var(--accent); background: var(--bg); font-weight: 500; }
.toc-list a small { color: var(--muted); font-weight: 400; margin-left: 4px; }
.main {
  margin-left: 200px;
  flex: 1;
  padding: 28px 32px 48px;
  max-width: 780px;
}
.toc-toggle {
  display: none;
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  border: none;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0,0,0,0.2);
  z-index: 200;
  align-items: center;
  justify-content: center;
}
.overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 90;
}
.overlay.show { display: block; }

/* Header */
.report-header { margin-bottom: 28px; padding-bottom: 16px; border-bottom: 2px solid var(--border); }
.kicker { font-size: 12px; color: var(--muted); letter-spacing: 0.08em; margin-bottom: 8px; }
h1 { font-size: 24px; font-weight: 600; line-height: 1.3; margin: 0 0 12px; letter-spacing: -0.3px; }
.byline { font-size: 13px; color: var(--muted); }
.byline span { color: var(--border); margin: 0 8px; }

/* Tags */
.tags { display: flex; flex-wrap: wrap; gap: 16px; margin: 20px 0 32px; }
.tag { display: flex; align-items: baseline; gap: 6px; font-size: 13px; color: var(--muted); }
.tag b { font-size: 20px; font-weight: 600; color: var(--fg); }

/* Content */
h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 28px 0 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
  scroll-margin-top: 20px;
}
h2 .score { font-size: 16px; color: var(--muted); font-weight: 400; margin-left: 8px; }
h2 .rec { font-size: 12px; color: var(--accent-fg); background: var(--accent); padding: 2px 8px; border-radius: 3px; margin-left: 8px; vertical-align: middle; font-weight: 500; }
p { margin: 8px 0; }
.lead { color: var(--fg); font-size: 15px; margin-bottom: 8px; }
.meta { font-size: 13px; color: var(--muted); margin-bottom: 12px; }
.risk { color: var(--risk); }
.summary { color: var(--muted); line-height: 1.7; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
strong { font-weight: 600; }

section { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
section:last-of-type { border-bottom: none; }

.info-bar { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 10px 0 12px; }
.info-tag { font-size: 13px; color: var(--muted); }
.info-tag b { color: var(--fg); font-weight: 500; margin-right: 4px; }

.weight-bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 12px; }
.weight-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--accent-fg);
  background: var(--accent);
  border-radius: 12px;
}
.weight-badge b { font-weight: 600; opacity: 0.9; }
.weight-badge::after { content: ''; }

.exp { font-size: 13px; color: var(--muted); margin: 8px 0; line-height: 1.6; }

.tags-line { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.tag-pill {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 3px;
}

.summary { color: var(--muted); line-height: 1.7; margin: 10px 0; }
.muted { font-size: 13px; color: var(--muted); }

/* Table View */
.view-toggle {
  display: inline-flex;
  gap: 0;
  margin: 24px 0 20px;
  background: var(--sidebar-bg);
  border-radius: 8px;
  padding: 4px;
}
.view-toggle button {
  padding: 8px 20px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--muted);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.view-toggle button:hover {
  color: var(--fg);
}
.view-toggle button.active {
  background: var(--container-bg);
  color: var(--fg);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin: 0 0 20px;
  padding: 14px 16px;
  background: var(--sidebar-bg);
  border-radius: 8px;
  font-size: 13px;
}
.filters label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--fg);
  cursor: pointer;
  font-weight: 500;
}
.filters input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
  cursor: pointer;
}
.filter-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
}
.filter-count {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}

.candidates-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  margin: 0;
}
.candidates-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
}
.candidates-table th {
  text-align: left;
  padding: 12px 16px;
  background: var(--container-bg);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-weight: 500;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
}
.candidates-table td {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.candidates-table tbody tr {
  transition: background 0.12s ease;
}
.candidates-table tbody tr:hover {
  background: var(--sidebar-bg);
}
.candidates-table tbody tr:nth-child(even) {
  background: var(--sidebar-bg);
}
.candidates-table tbody tr:nth-child(even):hover {
  background: var(--border);
}
.candidates-table .rank {
  color: var(--muted);
  font-size: 12px;
  width: 40px;
}
.candidates-table .name {
  min-width: 140px;
}
.candidates-table .name a {
  font-weight: 600;
  color: var(--fg);
}
.candidates-table .name a:hover {
  color: var(--accent);
}
.candidates-table .title {
  max-width: 280px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
}
.score-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.score-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.score-dot.high { background: var(--hl); }
.score-dot.mid { background: var(--accent); }
.score-dot.low { background: var(--muted); }
.score-num {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.rec-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
  white-space: nowrap;
}
.rec-badge.strong {
  background: var(--hl);
  color: #fff;
}
.rec-badge.good {
  background: var(--accent);
  color: var(--accent-fg);
}
.rec-badge.maybe {
  background: var(--bg);
  color: var(--muted);
  border: 1px solid var(--border);
}
.rec-badge.no {
  background: var(--risk);
  color: #fff;
}
.match-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: help;
  white-space: nowrap;
}
.match-badge:hover {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}

.table-container {
  overflow-x: auto;
  margin: 0 -32px;
  padding: 0 32px;
}
.link-cell { white-space: nowrap; }
.link-btn {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--accent);
  border: 1px solid var(--border);
  border-radius: 4px;
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.12s ease;
}
.link-btn:hover {
  background: var(--accent);
  color: var(--accent-fg);
  border-color: var(--accent);
}

.empty-state {
  text-align: center;
  padding: 48px 24px;
  color: var(--muted);
  font-size: 14px;
}
.empty-state-icon {
  font-size: 32px;
  margin-bottom: 12px;
  opacity: 0.5;
}

footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 12px; color: var(--muted); }

@media (max-width: 1060px) {
  .sidebar { transform: translateX(-100%); transition: transform 0.2s ease; box-shadow: 4px 0 24px rgba(0,0,0,0.12); background: var(--container-bg); }
  .sidebar.open { transform: translateX(0); }
  .main { margin-left: 0; max-width: 100%; padding: 28px 24px 48px; }
  .toc-toggle { display: flex; }
}
@media (max-width: 600px) {
  .main { padding: 24px 18px 40px; }
  h1 { font-size: 20px; }
  h2 { font-size: 16px; }
}
</style>
</head>
<body>
<div class="page">
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">候选人</div>
    <div class="toc-list" id="toc-list">${tocItems}</div>
  </aside>
  <div class="overlay" id="overlay"></div>
  <main class="main">
    <div class="report-header">
      <div class="kicker">人才寻访报告</div>
      <h1>${title || '未命名职位'}</h1>
      <div class="byline">${timestamp}<span>|</span>${city || '不限'}<span>|</span>${Array.isArray(keywords) ? keywords.join('、') : keywords || '—'}</div>
    </div>
    <div class="tags">${tagHtml}</div>

    <div class="view-toggle">
      <button id="btn-table" class="active" onclick="switchView('table')">表格视图</button>
      <button id="btn-card" onclick="switchView('card')">卡片视图</button>
    </div>

    <div id="table-view">
      <div class="filters">
        <label><input type="checkbox" id="filter-qualified" checked onchange="applyFilters()"> 通过初筛</label>
        <span class="filter-divider"></span>
        <label><input type="checkbox" id="filter-curriculum" onchange="applyFilters()"> 课程体系</label>
        <label><input type="checkbox" id="filter-management" onchange="applyFilters()"> 管理经验</label>
        <span class="filter-divider"></span>
        <label><input type="checkbox" id="filter-high-score" onchange="applyFilters()"> ≥80分</label>
        <span class="filter-count" id="filter-count"></span>
      </div>
      <div class="table-container">
        <table class="candidates-table" id="candidates-table">
          <thead>
            <tr>
              <th>#</th>
              <th>姓名</th>
              <th>职位</th>
              <th>地点</th>
              <th>评分</th>
              <th>推荐</th>
              ${fieldHeaders}
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div id="empty-state" class="empty-state" style="display:none">
          <div class="empty-state-icon">○</div>
          <p>没有符合筛选条件的候选人</p>
          <p style="font-size:12px;margin-top:8px">试试调整筛选条件</p>
        </div>
      </div>
    </div>

    <div id="card-view" style="display:none">
      ${contentSections}
    </div>

    <footer>Generated by Hunter · ${timestamp}</footer>
  </main>
  <button class="toc-toggle" id="toc-toggle">☰</button>
</div>
<script>
function switchView(view) {
  const sidebar = document.getElementById('sidebar');
  const main = document.querySelector('.main');
  document.getElementById('table-view').style.display = view === 'table' ? 'block' : 'none';
  document.getElementById('card-view').style.display = view === 'card' ? 'block' : 'none';
  document.getElementById('btn-table').classList.toggle('active', view === 'table');
  document.getElementById('btn-card').classList.toggle('active', view === 'card');
  if (view === 'table') {
    sidebar.style.display = 'none';
    main.style.marginLeft = '0';
    main.style.maxWidth = '100%';
  } else {
    sidebar.style.display = 'block';
    main.style.marginLeft = '200px';
    main.style.maxWidth = '780px';
  }
}

function applyFilters() {
  const qualified = document.getElementById('filter-qualified').checked;
  const curriculum = document.getElementById('filter-curriculum').checked;
  const management = document.getElementById('filter-management').checked;
  const highScore = document.getElementById('filter-high-score').checked;

  let visible = 0;
  document.querySelectorAll('#candidates-table tbody tr').forEach(row => {
    let show = true;
    if (qualified && row.dataset.qualified !== '1') show = false;
    if (curriculum && row.dataset.hasCurriculum !== '1') show = false;
    if (management && row.dataset.hasManagement !== '1') show = false;
    if (highScore && parseInt(row.dataset.score) < 80) show = false;
    row.style.display = show ? '' : 'none';
    if (show) visible++;
  });

  const countEl = document.getElementById('filter-count');
  const emptyEl = document.getElementById('empty-state');
  const tableEl = document.getElementById('candidates-table');

  countEl.textContent = '显示 ' + visible + ' / ' + document.querySelectorAll('#candidates-table tbody tr').length + ' 人';

  if (visible === 0) {
    tableEl.style.display = 'none';
    emptyEl.style.display = 'block';
  } else {
    tableEl.style.display = '';
    emptyEl.style.display = 'none';
  }
}

// Initialize
switchView('table');
applyFilters();

// TOC functionality
(function() {
  var headings = document.querySelectorAll('h2');
  var tocList = document.getElementById('toc-list');
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('toc-toggle');
  var overlay = document.getElementById('overlay');

  if (tocList && headings.length > 0) {
    headings.forEach(function(h) {
      var a = tocList.querySelector('a[href="#' + h.id + '"]');
      if (a) a.dataset.target = h.id;
    });
    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var id = entry.target.id;
          tocList.querySelectorAll('a').forEach(function(a) {
            a.classList.toggle('active', a.dataset.target === id);
          });
        }
      });
    }, { rootMargin: '-10% 0px -75% 0px', threshold: 0 });
    headings.forEach(function(h) { observer.observe(h); });
  }

  if (toggle) {
    toggle.addEventListener('click', function() {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }
  tocList.querySelectorAll('a').forEach(function(a) {
    a.addEventListener('click', function() {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  });
})();
</script>
</body>
</html>`;

  return html;
}

export function saveHTMLReport(meta, candidates, targetCity, outputDir, options = {}) {
  const dir = outputDir || path.join(os.homedir(), '.hunter', 'output');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const projectId = sanitizeFilename(meta.title || meta.tag || 'report');
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const htmlPath = path.join(dir, `${projectId}-${timestamp}-report.html`);
  const html = generateHTMLReport(meta, candidates, targetCity, options);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  return htmlPath;
}
