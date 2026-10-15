import {cli} from './lib/register.js';
import {LIEPIN_SESSION,LIEPIN_CONNECTION,LIEPIN_MANAGED,LIEPIN_MANAGED_SESSION,matchesConnection} from './lib/connection.js';
import {createLiepinPage} from './lib/page-connection.js';
import {checkReadRuntime} from './lib/current-detail.js';

// Bind the foreground page explicitly, without navigating or evaluating it.
export async function connectCurrentPage({checkRuntime=checkReadRuntime,bind,createPage}={}) {
 if(LIEPIN_MANAGED)return connectManagedSearch({checkRuntime,createPage});
 checkRuntime();
 if(!bind) {
  const {bindTab}=await import(new URL('daemon-client.js',import.meta.resolve('@jackwener/opencli/browser/page')).href);
  bind=bindTab;
 }
 if(!createPage) {
  createPage=createLiepinPage;
 }
 const page=await createPage();
 try {
  const bound=await bind(LIEPIN_SESSION);
  const url=new URL(bound.url);
  if(url.origin!=='https://h.liepin.com' || !['/search/getConditionItem','/resume/showresumedetail/','/resumemanage/showmytalentlist'].includes(url.pathname)) {
   // Keep query strings, fragments, credentials and non-web path data out of logs.
   const surface=bound.url==='about:blank'?'about:blank'
    :['http:','https:'].includes(url.protocol)?url.origin:`${url.protocol}页面`;
   const error=new Error(`当前绑定到 ${surface}，未执行猎聘页面操作。请先切换到原有猎聘搜索页、已打开的简历详情页或人才管理收藏页；若有其他任务切换窗口，先协调浏览器使用。绑定到空白页本身不能证明猎聘发生白屏。`);
   error.code='WRONG_BOUND_PAGE';
   throw error;
  }
  const tabs=await page.tabs();
  if(tabs.length!==1 || tabs[0].url!==bound.url || !/^[a-fA-F0-9]{16,128}$/.test(tabs[0].page ?? ''))throw new Error('绑定页面发生变化，请核对当前标签');
  if(!matchesConnection(tabs[0]))throw new Error('当前连接与所选择的官方/实验通道不一致；尚未执行页面代码，请核对扩展与进程配置');
  return {session:LIEPIN_SESSION,page:tabs[0].page,url:bound.url,connectionMode:LIEPIN_CONNECTION};
 } catch(error) {await page.closeWindow();throw error;}
}
export async function connectManagedSearch({checkRuntime=checkReadRuntime,createPage,bindRead,createReadPage=createLiepinPage}={}) {
 if(!LIEPIN_MANAGED && !createPage)throw new Error('启动独立寻访需选择 official-managed 模式');
 checkRuntime();
 createPage??=()=>createLiepinPage({session:LIEPIN_MANAGED_SESSION});
 const page=await createPage(),searchUrl='https://h.liepin.com/search/getConditionItem';
 const tabs=await page.tabs();
 let pageId;
 if(tabs.length===0)pageId=await page.newTab(searchUrl);
 else if(tabs.length===1)pageId=tabs[0].page;
 else throw new Error('独立寻访会话出现多个未核对目标；不创建或切换其他标签');
 if(!/^[A-Fa-f0-9]{16,128}$/.test(pageId??''))throw new Error('官方独立搜索页未返回有效目标');
 // Selecting this target proves the bridge has an owned lease; the official
 // API rejects select on a borrowed lease before any business page input.
 await page.selectTab(pageId);
 const current=await page.tabs();
 if(current.length!==1 || current[0].page!==pageId || !matchesConnection(current[0]))throw new Error('独立搜索页绑定发生变化');
 const url=new URL(current[0].url);
 if(url.origin!=='https://h.liepin.com' || url.pathname!=='/search/getConditionItem')throw new Error('独立寻访页不是预期搜索页；保留现场，不导航重试');
 if(!bindRead) {
  const {bindTab}=await import(new URL('daemon-client.js',import.meta.resolve('@jackwener/opencli/browser/page')).href);bindRead=bindTab;
 }
 const bound=await bindRead(LIEPIN_SESSION),readPage=await createReadPage(),readTabs=await readPage.tabs();
 if(readTabs.length!==1 || readTabs[0].page!==pageId || bound.url!==current[0].url || readTabs[0].url!==current[0].url)
  throw new Error('前台未绑定到独立搜索目标；不读取或重试其他页面');
 return {session:LIEPIN_SESSION,managerSession:LIEPIN_MANAGED_SESSION,page:pageId,url:current[0].url,connectionMode:'official',mode:'managed'};
}
export async function disconnectManagedSearch(pageId) {
 if(!LIEPIN_MANAGED || !/^[A-Fa-f0-9]{16,128}$/.test(pageId??''))throw new Error('结束独立寻访需要 official-managed 模式与原搜索页 page');
 checkReadRuntime();
 const page=await createLiepinPage({session:LIEPIN_MANAGED_SESSION,retain:false});
 const tabs=await page.tabs();
 if(tabs.length===0){await page.closeWindow();return {released:true,session:LIEPIN_MANAGED_SESSION,searchTab:'absent',savedGroups:'not_inspected'};}
 if(tabs.length!==1 || tabs[0].page!==pageId || !matchesConnection(tabs[0]))throw new Error('独立搜索目标已变化，未释放其他页面');
 const url=new URL(tabs[0].url);
 if(url.href!=='about:blank' && (url.origin!=='https://h.liepin.com' || url.pathname!=='/search/getConditionItem'))throw new Error('目标不是原独立搜索页，未释放');
 await page.selectTab(pageId);await page.closeWindow();
 if((await page.tabs()).length!==0)throw new Error('独立会话释放未确认，不重复关闭');
 return {released:true,session:LIEPIN_MANAGED_SESSION,searchTab:'placeholder_may_remain',savedGroups:'not_inspected',
  remainingUiCleanup:{page:pageId,expectedUrl:'about:blank',reason:'official_release_may_retain_placeholder'}};
}
cli({site:'liepin',name:'connect',access:'read',browser:false,
 description:'默认绑定当前猎聘页面；official-managed 模式启动或复用官方独立搜索页。返回后续命令需要的 page，不读取简历',
 args:[],columns:['session','page','url','connectionMode'],func:async()=>[await connectCurrentPage()]});
