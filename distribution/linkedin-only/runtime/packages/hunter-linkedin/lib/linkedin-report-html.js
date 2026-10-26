import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[char]);

function safeLinkedInUrl(candidate) {
  const raw = candidate.profileUrl || (candidate.profileId ? `https://www.linkedin.com/in/${candidate.profileId}/` : '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase())) return '';
    if (!/^\/in\/[^/?#]+\/?$/.test(url.pathname)) return '';
    return `https://www.linkedin.com${url.pathname.replace(/\/?$/, '/')}`;
  } catch { return ''; }
}

function scoreOf(candidate) {
  return Number(candidate.totalScore ?? candidate.evaluation?.score ?? candidate.score ?? 0) || 0;
}

function listOf(candidate, key) {
  const direct = candidate[key];
  const evaluated = candidate.evaluation?.[key];
  const value = Array.isArray(direct) ? direct : Array.isArray(evaluated) ? evaluated : [];
  return [...new Set(value.map(item => String(item).trim()).filter(Boolean))];
}

function detailStatus(candidate) {
  const fetches = candidate.detailFetch || {};
  const entries = Object.values(fetches);
  if (entries.some(item => item?.status === 'failed')) return { key: 'partial', label: '详情部分缺失' };
  if (entries.some(item => item?.status === 'success')) return { key: 'ready', label: '详情已补全' };
  if (entries.some(item => item?.status === 'empty')) return { key: 'empty', label: '暂无公开详情' };
  return { key: 'unread', label: '未读取详情' };
}

function evidenceRows(candidate) {
  const detail = candidate.detail || {};
  const experiences = Array.isArray(detail.experiences) ? detail.experiences : [];
  const projects = Array.isArray(detail.projects) ? detail.projects : [];
  const posts = Array.isArray(detail.posts) ? detail.posts : [];
  const services = Array.isArray(detail.services) ? detail.services : [];
  const profile = detail.profile || {};
  const sections = [];
  if (profile.about) sections.push(['关于', profile.about]);
  if (profile.education) sections.push(['教育', profile.education]);
  if (experiences.length) sections.push(['工作经历', experiences.map(row => row.raw_text || [row.title, row.company, row.date_range, row.description].filter(Boolean).join(' · ')).join('\n\n')]);
  if (projects.length) sections.push(['项目', projects.map(row => row.raw_text || [row.title, row.description].filter(Boolean).join(' · ')).join('\n\n')]);
  if (posts.length) sections.push(['公开内容', posts.slice(0, 5).map(row => row.body || row.raw_text || '').filter(Boolean).join('\n\n')]);
  if (services.length) sections.push(['专业服务', services.map(row => row.overview || row.raw_text || '').filter(Boolean).join('\n\n')]);
  if (!sections.length && candidate.detailText) sections.push(['资料摘要', candidate.detailText]);
  return sections;
}

function statusItems(candidate) {
  const labels = { profile: '主页', experience: '经历', projects: '项目', posts: '内容', services: '服务' };
  return Object.entries(candidate.detailFetch || {}).map(([key, value]) => {
    const status = value?.status || 'unread';
    const text = status === 'success' ? '已读取' : status === 'empty' ? '无公开数据' : status === 'failed' ? '读取失败' : '未读取';
    return `<span class="fetch fetch-${escapeHtml(status)}"><b>${escapeHtml(labels[key] || key)}</b>${escapeHtml(text)}</span>`;
  }).join('');
}

function renderCandidate(candidate, index) {
  const score = scoreOf(candidate);
  const status = detailStatus(candidate);
  const reasons = listOf(candidate, 'reasons');
  const highlights = listOf(candidate, 'highlights');
  const risks = listOf(candidate, 'risks');
  const url = safeLinkedInUrl(candidate);
  const title = candidate.currentTitle || candidate.title || candidate.headline || candidate.detail?.profile?.headline || '职位暂缺';
  const company = candidate.currentCompany || candidate.company || candidate.detail?.experiences?.[0]?.company || '';
  const location = candidate.location || candidate.city || candidate.detail?.profile?.location || '';
  const evidence = evidenceRows(candidate);
  const recommendation = score >= 80 ? '优先沟通' : score >= 65 ? '建议沟通' : score >= 50 ? '补充核验' : '暂缓';
  const basis = [...highlights, ...reasons];
  return `<tr class="candidate-row" data-index="${index}" data-score="${score}" data-status="${status.key}">
    <td class="rank">${String(index + 1).padStart(2, '0')}</td>
    <td class="identity"><strong>${escapeHtml(candidate.name || '未知候选人')}</strong><span>${escapeHtml(title)}</span></td>
    <td><strong>${escapeHtml(company || '—')}</strong><span>${escapeHtml(location || '地点待确认')}</span></td>
    <td class="score"><strong>${score || '—'}</strong><span>${recommendation}</span></td>
    <td><span class="status status-${status.key}">${status.label}</span></td>
    <td class="basis" title="${escapeHtml(basis.join('；'))}">${basis.length ? escapeHtml(basis.slice(0, 2).join('；')) : '<span class="muted">暂无明确依据</span>'}</td>
    <td class="row-actions">${url ? `<a class="linkedin-action" href="${escapeHtml(url)}" target="_blank" rel="noreferrer" aria-label="打开 ${escapeHtml(candidate.name || '候选人')} 的 LinkedIn 主页"><span>查看 LinkedIn</span><b aria-hidden="true">↗</b></a>` : '<span class="linkedin-unavailable">无主页链接</span>'}<button type="button" class="detail-action" data-expand aria-expanded="false" aria-controls="candidate-detail-${index}">报告详情</button></td>
  </tr><tr class="detail-row" id="candidate-detail-${index}" data-detail-for="${index}" hidden><td colspan="7"><div class="details">
    <div class="status-line"><span class="status status-${status.key}">${status.label}</span>${statusItems(candidate)}</div>
    <div class="decision-grid"><section><h3>推荐依据</h3>${basis.length ? `<ul>${basis.slice(0, 6).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">暂无明确推荐依据</p>'}</section><section class="risk-block"><h3>待核验</h3>${risks.length ? `<ul>${risks.slice(0, 5).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="muted">暂未识别明显风险</p>'}</section></div>
    ${evidence.length ? evidence.map(([label, text]) => `<section class="evidence"><h3>${escapeHtml(label)}</h3><p>${escapeHtml(text)}</p></section>`).join('') : '<p class="muted evidence-empty">本轮没有读取到可展示的详细资料。</p>'}
  </div></td></tr>`;
}

export function generateLinkedInHTMLReport(meta, candidates) {
  const total = Number(meta.total ?? candidates.length) || candidates.length;
  const qualified = candidates.length;
  const average = qualified ? Math.round(candidates.reduce((sum, candidate) => sum + scoreOf(candidate), 0) / qualified) : 0;
  const detailed = candidates.filter(candidate => detailStatus(candidate).key === 'ready').length;
  const partial = candidates.filter(candidate => detailStatus(candidate).key === 'partial').length;
  const passRate = total ? Math.round(qualified / total * 100) : 0;
  const title = meta.title || 'LinkedIn 人才寻访';
  const keywords = Array.isArray(meta.keywords) ? meta.keywords.join(' / ') : meta.keywords || '—';
  const rows = candidates.map(renderCandidate).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}｜人才寻访报告</title>
  <style>
  :root{--paper:#f2efe8;--ink:#1c2523;--muted:#67716d;--line:#d8d3c8;--card:#fffdfa;--green:#194f43;--green-soft:#e3eee9;--amber:#a85d20;--amber-soft:#f7e8d8;--red:#9a3c34;--red-soft:#f6e2df}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Avenir Next","PingFang SC","Microsoft YaHei","Noto Sans CJK SC",sans-serif;font-size:16px;line-height:1.65}
  body:before{content:"";position:fixed;inset:0;pointer-events:none;opacity:.24;background-image:radial-gradient(#8b8374 .45px,transparent .45px);background-size:7px 7px}
  .shell{position:relative;max-width:1180px;margin:auto;padding:52px 28px 80px}.masthead{border-top:5px solid var(--ink);padding-top:22px;display:grid;grid-template-columns:1fr auto;gap:32px;align-items:end}.eyebrow{font-size:13px;letter-spacing:.16em;font-weight:700;color:var(--green);text-transform:uppercase}.masthead h1{font-family:"Songti SC","STSong",Georgia,serif;font-size:clamp(34px,5vw,62px);line-height:1.08;margin:12px 0 16px;letter-spacing:-.04em}.meta{color:var(--muted);font-size:14px}.stamp{text-align:right;border-left:1px solid var(--line);padding-left:28px}.stamp strong{display:block;font:700 30px Georgia,serif}.stamp span{font-size:13px;color:var(--muted)}
  .metrics{display:grid;grid-template-columns:repeat(5,1fr);margin:36px 0;border:1px solid var(--line);background:rgba(255,253,250,.58)}.metric{padding:20px;border-right:1px solid var(--line)}.metric:last-child{border:0}.metric strong{display:block;font:700 28px Georgia,serif}.metric span{font-size:13px;color:var(--muted)}
  .toolbar{position:sticky;top:0;z-index:10;display:flex;gap:10px;align-items:center;padding:14px 0;background:rgba(242,239,232,.94);backdrop-filter:blur(10px)}.toolbar input,.toolbar select{height:42px;border:1px solid var(--line);border-radius:2px;background:var(--card);padding:0 13px;color:var(--ink);font:inherit;font-size:14px}.toolbar input{flex:1;min-width:180px}.toolbar button{height:42px;border:1px solid var(--ink);border-radius:2px;background:transparent;padding:0 16px;color:var(--ink);cursor:pointer}.toolbar button.active{background:var(--ink);color:white}.result-count{margin-left:auto;color:var(--muted);font-size:13px;white-space:nowrap}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid rgba(25,79,67,.22);outline-offset:2px}
  .table-wrap{background:var(--card);border:1px solid var(--line);border-radius:3px;overflow-x:auto;overflow-y:visible;box-shadow:0 12px 30px rgba(43,38,29,.04)}table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:1100px}th{position:static;padding:11px 14px;background:#e9e4da;color:#58615d;font-size:12px;font-weight:700;letter-spacing:.05em;text-align:left;white-space:nowrap;border-bottom:1px solid #cbc4b7}td{padding:14px;border-top:1px solid #e5e0d6;vertical-align:middle;font-size:14px}.candidate-row:nth-of-type(4n+1){background:#fcfaf5}.candidate-row:hover{background:#f4f0e7}.candidate-row.is-open{background:var(--green-soft)}.rank{width:48px;font:700 14px Georgia,serif;color:var(--amber)}td strong{display:block}.identity{min-width:190px}.identity strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:"Songti SC","STSong",Georgia,serif;font-size:18px}.identity span,td>span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px}.score{width:84px}.score strong{font:700 23px Georgia,serif;line-height:1}.score span{color:var(--green);font-weight:700}.status{white-space:nowrap}.basis{display:-webkit-box;overflow:hidden;max-width:330px;line-height:1.5;-webkit-box-orient:vertical;-webkit-line-clamp:2}.row-actions{width:138px;white-space:normal}.linkedin-action{display:inline-flex;align-items:center;gap:8px;padding:5px 8px;border-radius:2px;background:var(--green-soft);color:var(--green);font-size:12px;font-weight:800;line-height:1.35;text-decoration:none;transition:background .15s ease,color .15s ease}.linkedin-action:hover{background:var(--green);color:white}.linkedin-action span{color:inherit;font-size:inherit}.linkedin-action b{font-size:14px;font-weight:600}.detail-action{display:block;margin-top:7px;padding:0;border:0;background:transparent;color:var(--muted);font-family:inherit;font-size:12px;cursor:pointer;text-decoration:underline;text-decoration-color:#b8b2a7;text-underline-offset:3px}.detail-action:hover{color:var(--ink);text-decoration-color:var(--ink)}.linkedin-unavailable{display:block;color:var(--muted);font-size:12px}.detail-row td{padding:0;border-top:0}.details{padding:22px 28px 26px;background:#f7f4ed;border-left:4px solid var(--green);box-shadow:inset 0 -1px #d8d3c8}
  .status-line{display:flex;flex-wrap:wrap;gap:7px;margin:18px 0}.status,.fetch{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;font-size:12px;border-radius:99px;background:#efede7;color:var(--muted)}.status-ready,.fetch-success{background:var(--green-soft);color:var(--green)}.status-partial,.fetch-failed{background:var(--red-soft);color:var(--red)}.status-empty,.fetch-empty{background:var(--amber-soft);color:var(--amber)}.fetch b{font-weight:700}
  .decision-grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.decision-grid section{padding:17px 20px 17px 0}.decision-grid section+section{border-left:1px solid var(--line);padding-left:24px}.decision-grid h3,.evidence h3{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}.decision-grid ul{margin:0;padding-left:18px}.decision-grid li{margin:4px 0}.risk-block li::marker{color:var(--red)}.muted{color:var(--muted);margin:0}
  .evidence{margin-top:20px}.evidence p{max-width:90ch;white-space:pre-line;margin:0;color:#39433f;font-size:14px}.evidence-empty{margin-top:20px}.pager{display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:15px 0}.pager button{min-width:76px;border:1px solid var(--line);border-radius:2px;background:var(--card);padding:8px 13px;cursor:pointer}.pager button:disabled{opacity:.35;cursor:not-allowed}.pager span{min-width:88px;text-align:center;font-size:13px;color:var(--muted)}
  .empty{display:none;padding:64px;text-align:center;color:var(--muted);border:1px dashed var(--line)}footer{margin-top:38px;border-top:1px solid var(--line);padding-top:16px;color:var(--muted);font-size:12px}
  @media(max-width:980px){.toolbar{flex-wrap:wrap}.toolbar input{flex-basis:100%}.result-count{margin-left:0}}
  @media(max-width:760px){.shell{padding:28px 16px 48px}.masthead{grid-template-columns:1fr}.stamp{text-align:left;border-left:0;padding:0}.metrics{grid-template-columns:repeat(2,1fr)}.metric{border-bottom:1px solid var(--line)}.toolbar input{width:100%}.toolbar button{flex:1}.toolbar select{flex:1;min-width:170px}.decision-grid{grid-template-columns:1fr}.decision-grid section+section{border-left:0;border-top:1px solid var(--line);padding-left:0}.table-wrap{margin:0 -16px;border-left:0;border-right:0}}
  @media print{body{background:white;font-size:12px}body:before,.toolbar,.pager{display:none}.shell{max-width:none;padding:0}.table-wrap{overflow:visible;border:0;box-shadow:none}table{min-width:0;table-layout:auto}.candidate-row[hidden],.detail-row[hidden]{display:table-row}.details{break-inside:avoid}.metrics{background:white}th{position:static}.row-actions{display:none}th:last-child{display:none}.detail-row td{display:table-cell}.detail-row td[colspan]{border-bottom:1px solid var(--line)}}
  </style></head><body><main class="shell">
  <header class="masthead"><div><div class="eyebrow">Hunter · Candidate Brief</div><h1>${escapeHtml(title)}</h1><div class="meta">${escapeHtml(meta.city || '地点不限')}　·　${escapeHtml(keywords)}　·　${escapeHtml(meta.timestamp || '')}</div></div><div class="stamp"><strong>${qualified}</strong><span>建议进入下一步</span></div></header>
  <section class="metrics" aria-label="寻访概览"><div class="metric"><strong>${total}</strong><span>收集候选人</span></div><div class="metric"><strong>${qualified}</strong><span>进入报告</span></div><div class="metric"><strong>${passRate}%</strong><span>通过率</span></div><div class="metric"><strong>${average}</strong><span>平均评分</span></div><div class="metric"><strong>${detailed}/${qualified}</strong><span>详情完整${partial ? ` · ${partial} 部分缺失` : ''}</span></div></section>
  <nav class="toolbar" aria-label="候选人筛选"><input id="search" type="search" placeholder="搜索姓名、职位或公司"><button class="active" data-filter="all">全部</button><button data-filter="high">80 分以上</button><select id="detail-filter" aria-label="详情状态"><option value="all">全部详情状态</option><option value="ready">详情已补全</option><option value="partial">部分缺失</option><option value="unread">未读取</option></select><span class="result-count" id="result-count"></span></nav>
  <div class="table-wrap"><table><colgroup><col style="width:5%"><col style="width:19%"><col style="width:16%"><col style="width:8%"><col style="width:13%"><col style="width:25%"><col style="width:14%"></colgroup><thead><tr><th>#</th><th>候选人 / 职位</th><th>公司 / 地点</th><th>评分</th><th>资料状态</th><th>推荐依据</th><th>查看候选人</th></tr></thead><tbody id="candidate-list">${rows}</tbody></table></div><div class="empty" id="empty">没有符合当前条件的候选人</div><nav class="pager" aria-label="候选人分页"><button id="prev" type="button">上一页</button><span id="page-info"></span><button id="next" type="button">下一页</button></nav>
  <footer>本报告用于招聘决策参考；候选人资料以 LinkedIn 当前公开信息及后续人工核验为准。</footer></main>
  <script>(()=>{const rows=[...document.querySelectorAll('.candidate-row')],search=document.getElementById('search'),detail=document.getElementById('detail-filter'),count=document.getElementById('result-count'),empty=document.getElementById('empty'),pageInfo=document.getElementById('page-info'),prev=document.getElementById('prev'),next=document.getElementById('next');let scoreFilter='all',page=1;const size=20;function detailRow(row){return document.querySelector('[data-detail-for="'+row.dataset.index+'"]')}function close(row){row.classList.remove('is-open');detailRow(row).hidden=true;const button=row.querySelector('[data-expand]');button.textContent='报告详情';button.setAttribute('aria-expanded','false')}function matched(){const q=search.value.trim().toLowerCase();return rows.filter(row=>(!q||row.textContent.toLowerCase().includes(q))&&(scoreFilter==='all'||Number(row.dataset.score)>=80)&&(detail.value==='all'||row.dataset.status===detail.value))}function apply(reset=false){if(reset)page=1;const list=matched(),pages=Math.max(1,Math.ceil(list.length/size));page=Math.min(page,pages);rows.forEach(row=>{row.hidden=true;close(row)});list.slice((page-1)*size,page*size).forEach(row=>row.hidden=false);count.textContent='筛选到 '+list.length+' / '+rows.length+' 人';pageInfo.textContent='第 '+page+' / '+pages+' 页';prev.disabled=page<=1;next.disabled=page>=pages;empty.style.display=list.length?'none':'block'}document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{scoreFilter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(item=>item.classList.toggle('active',item===button));apply(true)}));document.querySelectorAll('[data-expand]').forEach(button=>button.addEventListener('click',()=>{const row=button.closest('.candidate-row'),panel=detailRow(row),opening=panel.hidden;if(opening){row.classList.add('is-open');panel.hidden=false}else close(row);button.textContent=opening?'收起详情':'报告详情';button.setAttribute('aria-expanded',String(opening))}));search.addEventListener('input',()=>apply(true));detail.addEventListener('change',()=>apply(true));prev.addEventListener('click',()=>{page--;apply()});next.addEventListener('click',()=>{page++;apply()});apply()})();</script></body></html>`;
}

export function saveLinkedInHTMLReport(meta, candidates, outputDir) {
  const directory = outputDir || path.join(os.homedir(), '.hunter', 'output');
  fs.mkdirSync(directory, { recursive: true });
  const safeName = String(meta.title || meta.tag || 'linkedin').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_');
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filePath = path.join(directory, `${safeName}-${date}-report.html`);
  fs.writeFileSync(filePath, generateLinkedInHTMLReport(meta, candidates), 'utf8');
  return filePath;
}
