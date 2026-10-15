import {matchesConnection} from './connection.js';
// Listing an existing session must precede evaluate: an absent OpenCLI lease
// can otherwise resolve an explicit target through an owned blank-tab fallback.
export async function readBoundLocation(page,pageId,expectedPath,{requireConnection=false}={}) {
  const matches=(await page.tabs()).filter(tab=>tab.page===pageId);
  if(matches.length!==1)throw new Error('目标不在当前 OpenCLI 已绑定会话中；未执行页面代码，先核对绑定');
  if(requireConnection && !matchesConnection(matches[0]))throw new Error('所选择的官方/实验连接协议未匹配；尚未执行页面代码，请核对绑定');
  const valid=value=>{
    try {const url=new URL(value);return url.origin==='https://h.liepin.com' && url.pathname===expectedPath;}
    catch {return false;}
  };
  if(!valid(matches[0].url)) {
    let surface='地址未知';
    try {
      const url=new URL(matches[0].url);
      const knownPaths=['/search/getConditionItem','/resume/showresumedetail/','/resumemanage/showmytalentlist'];
      surface=url.href==='about:blank'?'about:blank'
        :['https:','http:'].includes(url.protocol)?url.origin+(url.origin==='https://h.liepin.com'&&knownPaths.includes(url.pathname)?url.pathname:'')
        :`${url.protocol}页面`;
    } catch {}
    throw new Error(`已绑定目标不是预期猎聘页面（${surface}）；未执行页面代码。先核对当前绑定，不自动重新打开或重试`);
  }
  const observed=await page.evaluate(()=>({url:location.href}));
  if(observed?.url!==matches[0].url || !valid(observed?.url))throw new Error('读取期间目标地址变化，停止当前任务');
  return observed.url;
}
