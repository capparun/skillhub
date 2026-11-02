import {reportToolbar} from './report-controls.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));

export function comparisonTable(entries,{interactive=true}={}) {
  const identified = entries.filter(row => row.identityStatus === 'identified');
  const showEvidence=interactive||identified.some(row=>row.findings.length||row.evaluationStale||row.evidenceGaps?.length);
  const showOrder=interactive||identified.some(row=>row.reviewOrder);
  const unresolved = entries.length - identified.length;
  return `<section aria-label="候选人比较"><h2>候选人比较</h2>
    <p>以下为已识别候选人，不等于推荐短名单。已评估 ${identified.filter(row => row.findings.length).length} 人；待评估 ${identified.filter(row => !row.findings.length).length} 人。</p>
    ${interactive?reportToolbar:'<p class="note">所有已识别候选人均列于下表，不分页、不隐藏。</p>'}<div class="comparison-scroll"><table><thead><tr><th>候选人</th><th>职位 / 公司 / 地点</th><th>资料状态</th>${showEvidence?'<th>已有支持证据</th><th>待核实与冲突</th>':''}${showOrder?'<th>复核顺序</th>':''}</tr></thead><tbody>
    ${identified.map(row => {
      const support = row.findings.filter(f => f.status === 'supported' && f.kind !== 'exclusion');
      const concerns = row.findings.filter(f => f.status === 'unknown' ||
        (f.kind === 'exclusion' && f.status === 'supported') ||
        (f.kind !== 'exclusion' && f.status === 'contradicted'));
      const label = findings => findings.map(f => escape(`${f.label ?? f.criterionId}：${f.reason}`)).join('<br>');
      return `<tr data-candidate-row data-detail-state="${escape(row.presentation.detailState)}"><td><a href="#candidate-${entries.indexOf(row)}">${escape(row.presentation.name)}</a></td>
        <td><strong>${escape(row.presentation.position||'职位待核实')}</strong><span class="candidate-secondary">${escape([row.presentation.company,row.presentation.city].filter(Boolean).join(' · ')||'公司与地点未记录')}</span></td>
        <td>${escape(row.presentation.detailStatus)}</td>${showEvidence?`<td>${label(support) || '尚无已记录的支持证据'}</td>
        <td>${[label(concerns),...(row.evidenceGaps ?? []).map(escape)].filter(Boolean).join('<br>') || (row.evaluationStale ? '历史评估已过期，需复评' : row.findings.length ? '已记录条件中暂无待核实或冲突项' : '尚未评估')}</td>`:''}
        ${showOrder?`<td>${escape(row.reviewOrder || '未排序')}</td>`:''}</tr>`;
    }).join('')}</tbody></table></div>
    ${unresolved ? `<p>${unresolved} 条身份待确认记录单列在末尾“未关联的搜索记录”，不代表新增候选人，无需逐条审核。</p>` : ''}</section>`;
}
