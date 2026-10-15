import {createHash} from 'node:crypto';

// Fixed script only: candidate text is rendered as escaped HTML, never executable source.
export const reportControls = `(()=>{
const rows=Array.from(document.querySelectorAll('[data-candidate-row]'));
const search=document.getElementById('candidate-search');
const state=document.getElementById('candidate-state');
const previous=document.getElementById('candidate-previous');
const next=document.getElementById('candidate-next');
const count=document.getElementById('candidate-count');
if(!search||!state||!previous||!next||!count)return;
let page=0;const size=20;
function render(reset){
 if(reset)page=0;
 const query=search.value.trim().toLowerCase();
 const matches=rows.filter(row=>(!query||row.textContent.toLowerCase().includes(query))&&(state.value==='all'||row.dataset.detailState===state.value));
 const pages=Math.max(1,Math.ceil(matches.length/size));page=Math.min(page,pages-1);
 rows.forEach(row=>row.hidden=true);
 matches.slice(page*size,(page+1)*size).forEach(row=>row.hidden=false);
 count.textContent='符合条件 '+matches.length+' / '+rows.length+' 人 · 第 '+(page+1)+' / '+pages+' 页';
 previous.disabled=page===0;next.disabled=page>=pages-1;
}
search.addEventListener('input',()=>render(true));state.addEventListener('change',()=>render(true));
previous.addEventListener('click',()=>{page=Math.max(0,page-1);render(false)});
next.addEventListener('click',()=>{page++;render(false)});render(true);
})();`;

export const reportScriptHash = createHash('sha256').update(reportControls).digest('base64');

export const reportToolbar = `<div class="report-toolbar">
<label>搜索候选人 <input id="candidate-search" type="search" placeholder="姓名、公司、职位或证据关键词"></label>
<label>资料状态 <select id="candidate-state"><option value="all">全部</option><option value="readable">已读取可见详情</option><option value="partial">部分可见详情</option><option value="unread">未读取可用详情</option></select></label>
<button id="candidate-previous" type="button">上一页</button><button id="candidate-next" type="button">下一页</button>
<span id="candidate-count" role="status" aria-live="polite"></span></div>`;
