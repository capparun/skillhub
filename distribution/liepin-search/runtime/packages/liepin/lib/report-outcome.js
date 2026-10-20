import {observedResumeUrl} from './report-links.js';
import {candidatePresentation} from './report-presentation.js';
import {sourcingProgress} from './sourcing-outcome.js';
export function reportOutcome(task,escape,{includeAll=false,detailsFile,profileAnchors}={}){
 if(!task.sourcing?.contracts?.length)return '';
 const progress=sourcingProgress(task),labels={follow_up:'值得跟进',clarify:'边界待校准',not_pursued:'本轮不跟进'},favorites={confirmed:'目标组收藏已确认',unknown:'结果未知，先核对',saved_group_unverified:'已收藏，目标组未核实',not_confirmed:'尚未确认收藏'};
 const collects=progress.contract.goal==='favorites';
 const followUps=progress.people.filter(p=>p.decision?.decision==='follow_up');
 const boundaries=progress.people.filter(p=>p.decision?.decision==='clarify');
 const focus=includeAll?progress.people:progress.people.filter(p=>followUps.includes(p)||boundaries.slice(0,3).includes(p)||p.favorite==='unknown');
 const nonFollow=progress.people.filter(p=>p.decision?.decision==='not_pursued').length;
 const clip=value=>{const s=String(value??'');return escape(!includeAll&&s.length>160?s.slice(0,160)+'…（完整依据见已保存详情）':s);};
 return `<section aria-label="寻访与收藏结果"><h2>${includeAll?'全部人选处理记录':'寻访与收藏结果'}</h2>${progress.closure?`<p>本轮状态：${progress.complete?'完成约定范围':'部分完成'}；${escape(progress.closure.reason)}。覆盖：${escape(progress.closure.coverage)}</p>`:progress.closureStale?'<p>上次收口后证据已变化，需重新核对。</p>':''}<p>已记录处理依据 ${progress.counts.reviewed} 人，值得跟进 ${progress.counts.followUp} 人${collects?`，目标组收藏已确认 ${progress.counts.favoriteConfirmed} 人。`:'；本任务不执行收藏。'}${progress.contractStale?'岗位标准已变化，原处理结果需要复核。':''}${collects?'收藏代表进入跟进池，不代表全部条件满足或最终录用。':'跟进建议不代表全部条件满足或最终录用。'}</p><div class="comparison-scroll"><table class="outcome-table"><thead><tr><th>人选</th><th>本轮处理</th><th>依据与缺口</th><th>${collects?'收藏结果':'任务范围'}</th></tr></thead><tbody>${focus.map(p=>{
 const c=task.candidates.find(c=>c.key===p.candidateKey),d=p.decision,profile=candidatePresentation(c),name=profile.name;
 const localIndex=profileAnchors?.get(c.key),platformUrl=observedResumeUrl(c);
 const links=detailsFile?`<div class="resume-links">${Number.isSafeInteger(localIndex)?`<a href="${escape(detailsFile)}#candidate-${localIndex}">已保存详情</a>`:''}${platformUrl?`<a href="${escape(platformUrl)}" target="_blank" rel="noopener noreferrer">平台原简历</a>`:''}</div>`:'';
 return `<tr data-outcome-row><th>${escape(name)}<span class="candidate-secondary">${escape([profile.company,profile.position].filter(Boolean).join(" · "))}</span>${links}</th><td>${escape(d?labels[d.decision]:p.decisionStale?'原判断已过期':'待完成统一复核')}</td><td>${d?`${clip(d.reason)}${d.gaps.length?`<p>${(includeAll?d.gaps:d.gaps.slice(0,3)).map(clip).join('；')}</p>`:''}`:'尚无当前有效的处理依据'}</td><td>${collects?escape(favorites[p.favorite]):'本任务不执行收藏'}${collects&&d?.group?`<p>目标：${escape(d.group)}</p>`:''}</td></tr>`;
 }).join('')}</tbody></table></div>${!focus.length?'<p>当前没有可展示的跟进或边界人选；这不代表平台没有合适人才，须结合未处理资料与覆盖范围判断。</p>':''}${!includeAll?`<p class="note">本轮不跟进 ${nonFollow} 位；边界待校准 ${boundaries.length} 位，正文最多展示3位。其余处理记录及完整依据见已保存详情，不重复平铺全部简历。</p>`:''}<p class="note">停止条件：${escape(progress.contract.stopCondition)}。本摘要不自动宣称寻访完成；操作未知时先核对，不重复写入。</p></section>`;
}
