import crypto from 'node:crypto';
function installPlatformControls(){
 const rows=[...document.querySelectorAll('[data-candidate-row]')];
 const query=document.getElementById('candidate-query'),status=document.getElementById('candidate-status');
 const previous=document.getElementById('candidate-prev'),next=document.getElementById('candidate-next'),count=document.getElementById('candidate-count');
 let page=0;const size=10;
 function render(){
  const text=(query?.value??'').trim().toLocaleLowerCase();
  const selected=rows.filter(row=>(!text||row.textContent.toLocaleLowerCase().includes(text))&&(!status?.value||row.dataset.detailState===status.value));
  const pages=Math.max(1,Math.ceil(selected.length/size));page=Math.min(page,pages-1);
  const visible=new Set(selected.slice(page*size,(page+1)*size));
  rows.forEach(row=>{row.hidden=!visible.has(row);});
  if(count)count.textContent=`匹配 ${selected.length} / ${rows.length} 人 · 第 ${page+1} / ${pages} 页`;
  if(previous)previous.disabled=page===0;if(next)next.disabled=page>=pages-1;
 }
 function reset(){page=0;render();}
 query?.addEventListener('input',reset);status?.addEventListener('change',reset);
 previous?.addEventListener('click',()=>{page--;render();});next?.addEventListener('click',()=>{page++;render();});
 document.getElementById('candidate-controls')?.removeAttribute('hidden');render();
 function reveal(){const id=location.hash.slice(1);if(!/^person-\d+$/.test(id))return;const target=document.getElementById(id);if(target?.matches('details.person')){target.open=true;target.scrollIntoView({block:'start'});}}
 document.addEventListener('click',event=>{const link=event.target.closest('a[href^="#person-"]');if(link){const target=document.getElementById(link.hash.slice(1));if(target?.matches('details.person'))target.open=true;}});
 addEventListener('hashchange',reveal);reveal();
}
export const platformControls=`(${installPlatformControls.toString()})();`;
export const platformControlsHash=crypto.createHash('sha256').update(platformControls).digest('base64');
export const stateLabel=value=>({ready:'就绪',partial:'部分可见',readable:'可见内容已读取',unread:'未读取',pending:'待执行',started:'执行中',completed:'已完成',paused:'已暂停',failed:'失败',blocked:'受阻',unknown:'结果待核对',skipped:'已跳过',favorite:'收藏',unfavorite:'取消收藏','save-search':'保存方案','apply-search':'应用方案','delete-search':'删除方案',reading:'读取中',dispatching:'正在派发',returned:'指令已返回',verified:'已回读确认'}[value]??value);
