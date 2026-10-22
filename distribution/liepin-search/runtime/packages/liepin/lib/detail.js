/** Read only the authorized detail page. Never click unlock, buy or contact controls. */
export function detailUrl(resumeId) {
  if (typeof resumeId !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(resumeId)) {
    throw new Error('resumeId 必须为搜索结果返回的简历标识，不接受任意 URL');
  }
  return `https://h.liepin.com/resume/showresumedetail/?res_id_encode=${encodeURIComponent(resumeId)}`;
}

// Self-contained function: serialized by OpenCLI into the page context.
export function inspectDetail() {
  if (location.origin !== 'https://h.liepin.com' || location.pathname !== '/resume/showresumedetail/') {
    return {url:location.href,title:'',readyState:document.readyState,text:''};
  }
  const text = document.body?.innerText ?? '';
  return { url: location.href, title: document.title, readyState: document.readyState, text };
}

const headings = ['个人信息', '基本信息', '求职意向', '期望职位', '工作经历', '项目经历', '教育经历', '语言能力', '技能特长', '自我评价', '附加信息', '资格证书', '培训经历'];
const headingAliases = {'我的技能':'技能特长', '附加消息':'附加信息'};
function sectionHeading(line) {
  const normalized = line.trim().replace(/\s+/g, '').replace(/[：:]$/, '').replace(/[（(]共\d+段[）)]$/, '');
  const heading = headingAliases[normalized] ?? normalized;
  return headings.includes(heading) ? heading : null;
}

export function parseDetail(snapshot, resumeId, capturedAt = new Date().toISOString()) {
  const expected = new URL(detailUrl(resumeId));
  let actual;
  try { actual = new URL(snapshot.url); } catch { return { status: 'wrong_page', resumeId }; }
  const text = String(snapshot.text ?? '').replace(/\r\n?/g, '\n').trim();
  const base = { schemaVersion: 1, source: 'liepin', resumeId, url: actual.href, capturedAt };
  if (/请登录|扫码登录|登录后查看/.test(text) || /\/login(?:\/|\?|$)/.test(actual.pathname)) return { ...base, status: 'login_required' };
  if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.searchParams.get('res_id_encode') !== resumeId) return { ...base, status: 'wrong_page' };
  // Risk wording is decided together with the content scan below: a resume that
 // mentions 功能安全验证 is a resume, not a challenge page.
 const riskPhrase = /验证码|访问过于频繁|操作频繁|异常访问|账号异常/.test(text)
  || (/安全验证/.test(text) && (text.length < 400 || /(?:请|需|需要|进行)[^。\n]{0,6}安全验证|安全验证(?:后|未通过|失败)/.test(text)));
  if (/简历不存在|简历已删除|简历已下架|无权查看|暂无查看权限/.test(text)) return { ...base, status: 'unavailable' };
  if (!text || snapshot.readyState === 'loading') return { ...base, status: 'loading' };
  const lines = text.split('\n');
  const sections = [];
  // These delimit the end of resume content in the observed detail layout.
  // Keep the full raw text above, but do not attach sidebar/footer text to a section.
  const endMarkers = new Set(['附件简历','简历备注','简历信息','本次搜索匹配到的简历不够精准？点击这里进行反馈']);
  const endsResume = line => endMarkers.has(line.trim()) || /^声明[：:]该人选信息仅供公司招聘使用/.test(line.trim());
  for (let i = 0; i < lines.length; i++) {
    if (sections.length && endsResume(lines[i])) break;
    const heading = sectionHeading(lines[i]);
    if (!heading) continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && !sectionHeading(lines[end]) && !endsResume(lines[end])) end++;
    // Repeated headings may contain distinct visible records; source line ranges
    // preserve each block without deduplicating content by its label.
    sections.push({ heading, text: lines.slice(start, end).join('\n').trim(), startLine: start + 1, endLine: end });
    if (end < lines.length && endsResume(lines[end])) break;
    i = end - 1;
  }
 const contentSections = sections.filter(s => ['工作经历', '教育经历', '项目经历'].includes(s.heading) && s.text);
 // No resume content plus risk wording is a challenge page. Risk wording inside a
 // resume that does have content is just text from the candidate's experience.
 if (riskPhrase && !contentSections.length) return { ...base, status: 'blocked' };
 if (!contentSections.length) return { ...base, status: 'unrecognized', reason: '未识别到有内容的简历经历板块，不能确认详情读取成功' };
  const attachmentRestricted = /索要后可查看|索要简历后可查看|该段经历来自附件简历|TA上传了附件简历，点击开聊向TA索要/.test(text);
  const collapsedSections = [...text.matchAll(/显示其他\s*(\d+)\s*段\s*(工作|项目|教育)经历/g)].map(match => ({heading:`${match[2]}经历`,remaining:Number(match[1])}));
  const restricted = attachmentRestricted || /解锁(?:简历|后查看)|购买(?:简历|后查看)|开通.*查看|查看完整简历|部分信息.*隐藏/.test(text);
  return {
    ...base, status: restricted || collapsedSections.length || snapshot.expansion?.incomplete ? 'partial' : 'readable',
    title: String(snapshot.title ?? ''), text, sections,
    missingSections: ['工作经历', '教育经历', '项目经历'].filter(h => !sections.some(s => s.heading === h && s.text)),
    visibility: 'account-visible-only', truncated: false,
    ...(snapshot.expansion ? {expansion:snapshot.expansion} : {}),
    limitations: {attachmentRestricted,collapsedSections},
    warnings: [
      ...(snapshot.expansion?.incomplete ? ['经历展开未全部确认；已保存当前可见内容，未重复点击'] : []),
      ...(restricted ? ['页面提示部分信息受限；未尝试索要、解锁或购买'] : []),
      ...(collapsedSections.length ? ['仍有折叠经历未展开，当前文本不代表所有账号可见内容'] : []),
    ],
  };
}

export async function readDetail(page, resumeId, { pause = ms => new Promise(r => setTimeout(r, ms)), attempts = 8 } = {}) {
  const url = detailUrl(resumeId); // Validate before navigation.
  await page.goto(url);
  let result;
  for (let i = 0; i < attempts; i++) {
    result = parseDetail(await page.evaluate(inspectDetail), resumeId);
    if (result.status !== 'loading' && result.status !== 'unrecognized') return result;
    if (i + 1 < attempts) await pause(500);
  }
  return { ...result, reason: result?.reason ?? '页面未在限定检查次数内加载；未重试导航' };
}
