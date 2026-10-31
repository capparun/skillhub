import {reportOutcome} from './report-outcome.js';
/** Evidence-first brief. Summarizes saved evaluations, never invents suitability or ranking. */
export function reportBrief(task,entries,summary,escape){
 if(task.sourcing?.contracts?.length)return `${reportOutcome(task,escape)}<section class="report-brief" aria-label="覆盖与下一步"><h2>覆盖与下一步</h2><p>已识别 ${summary.candidates} 位，${summary.evaluated} 位有当前有效评估；详情可读 ${summary.detailStatuses.readable} 位、部分可见 ${summary.detailStatuses.partial} 位。另 ${summary.unresolvedIdentities} 条观察尚未关联身份，不计作新增人选。</p><p>${task.sourcing.contracts.at(-1).goal==='favorites'?'已确认入组者不重复收藏；':'本任务不执行收藏；'}优先处理未确认结果和需要校准的条件。尚未处理的列表与未覆盖轮次保留为缺口，不能因生成报告就宣称寻访完成。完整条件核对和不跟进依据见附录。</p></section>`;
 const people=entries.filter(row=>row.identityStatus==='identified');
 const focus=people.filter(row=>row.findings.length||row.evaluationStale||row.evidenceGaps?.length);
 const pending=people.length-focus.length;
 const supported=people.filter(row=>row.findings.some(f=>f.status==='supported'&&f.kind!=='exclusion')).length;
 const criteria=task.requirements.criteria??[];
 const excerpt=text=>{text=String(text??'');return escape(text.length>100?text.slice(0,100)+'…（完整原文见附录）':text);};
 const evidence=row=>row.findings.filter(f=>f.status==='supported'&&f.kind!=='exclusion');
 const concerns=row=>row.findings.filter(f=>f.status==='unknown'||(f.kind==='exclusion'?f.status==='supported':f.status==='contradicted'));
 return `${reportOutcome(task,escape)}<section class="report-brief" aria-label="结论摘要"><h2>先看结论</h2><p class="brief-lead">${summary.evaluated?'已有部分条件证据，可供进一步核实；当前不形成最终适岗或推荐结论。':'当前资料尚未完成条件评估，暂不能给出匹配结论。'}</p><ul><li>已识别 ${summary.candidates} 位候选人；${summary.evaluated} 位有当前有效评估，其中 ${supported} 位有至少一项条件的支持证据。这不代表全部条件通过。</li><li>详情可读 ${summary.detailStatuses.readable} 位，部分可见 ${summary.detailStatuses.partial} 位；其余资料仍需补齐。</li><li>当前记录 ${criteria.length} 条岗位条件${criteria.length<2?'，不足以覆盖完整岗位要求':''}。${summary.unresolvedIdentities?`${summary.unresolvedIdentities} 条搜索记录尚未关联身份，不计入人选数量。`:''}</li></ul><h2>已有评估的重点对照</h2><p class="note">沿用已有顺序，摘录已保存的依据与缺口，不新增评分或推荐排序。</p>${focus.length?`<div class="comparison-scroll"><table class="brief-table"><thead><tr><th scope="col">候选人 / 当前职位</th><th scope="col">已知重点</th><th scope="col">还缺什么</th></tr></thead><tbody>${focus.map(row=>{
  const support=evidence(row),gaps=[...concerns(row).map(f=>`${f.label??f.criterionId}：${f.reason}`),...(row.evidenceGaps??[])];
  if(row.presentation.detailState==='unread')gaps.push('尚未读取可用详情');
  if(row.presentation.detailState==='partial')gaps.push('详情部分可见，完整经历仍需核实');
  if(row.evaluationStale)gaps.push('历史评估已过期，需复评');else if(!row.findings.length)gaps.push('尚未完成条件评估');
  return `<tr data-brief-row><th scope="row">${escape(row.presentation.name)}<span class="candidate-secondary">${escape(row.presentation.position||'职位未记录')}</span></th><td>${support.length?support.slice(0,2).map(f=>`<strong>${escape(f.label??f.criterionId)}</strong>${f.evidence[0]?`<p class="brief-quote">原文：${excerpt(f.evidence[0].quote)}</p>`:''}`).join(''):row.findings.length?'暂无已记录的支持证据':'尚未形成评估依据'}${support.length>2?`<small>另有 ${support.length-2} 项支持证据，见附录。</small>`:''}</td><td>${gaps.length?gaps.slice(0,2).map(excerpt).join('<br>'):'完整岗位要求仍需确认；已记录条件中暂无额外缺口'}${gaps.length>2?`<small>另有 ${gaps.length-2} 项待核实，见附录。</small>`:''}</td></tr>`;
 }).join('')}</tbody></table></div>`:'<p>当前没有已评估人选的证据可供对照。</p>'}${pending?`<p class="note">另有 ${pending} 位已识别人选尚未评估，暂不重复罗列；完整资料保留在附录，不代表不匹配。</p>`:''}<h2>建议下一步</h2><p>先确认完整岗位要求，补齐缺失或受限的详情，再逐项核对证据。当前报告用于资料复核，不能直接作为录用或淘汰依据。</p></section>`;
}
