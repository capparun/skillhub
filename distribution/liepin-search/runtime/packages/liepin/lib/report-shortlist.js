import {currentShortlist} from './shortlist.js';
import {candidatePresentation} from './report-presentation.js';

export function renderShortlist(task, format, escape) {
  const shortlist = currentShortlist(task);
  const notice = shortlist ? (shortlist.stage === 'final' ? '最终短名单' : '初选名单：待完成最终复核') :
    task.shortlists?.length ? '短名单已过期：请按当前条件和证据重新复核' : '尚未形成短名单：下方候选人仅供比较';
  const entries = (shortlist?.entries ?? []).map(entry => {
    const candidate = task.candidates.find(item => item.key === entry.candidateKey);
    return {...entry,name:candidatePresentation(candidate ?? {}).name};
  });
  const evidence = shortlist ? (shortlist.deepReview ? '已选择详情核验；部分可见详情不等于完整简历。' : '本轮未开启详情深读，仅依据列表证据。') : '';
  if (format === 'markdown') return `## ${escape(notice)}\n\n${escape(evidence)}\n\n` +
    (shortlist && !entries.length ? '本轮名单为空。\n\n' : '') + entries.map(entry =>
      `### ${escape(entry.name)}\n\n入选理由：${escape(entry.reason)}\n\n${entry.changeReason ? `复评变化：${escape(entry.changeReason)}\n\n` : ''}待核实：${escape(entry.evidenceGaps.join('；') || '未记录额外待核实项')}\n\n`).join('');
  return `<section aria-label="短名单"><h2>${escape(notice)}</h2><p>${escape(evidence)}</p>
    ${shortlist && !entries.length ? '<p>本轮名单为空。</p>' : ''}
    ${entries.map(entry => `<article><h3>${escape(entry.name)}</h3><p>入选理由：${escape(entry.reason)}</p>
      ${entry.changeReason ? `<p>复评变化：${escape(entry.changeReason)}</p>` : ''}
      <p>待核实：${escape(entry.evidenceGaps.join('；') || '未记录额外待核实项')}</p></article>`).join('')}</section>`;
}
