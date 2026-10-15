import {createLiepinPage} from './page-connection.js';
import {LIEPIN_CONNECTION} from './connection.js';
import {checkReadRuntime} from './current-detail.js';
import {readBoundLocation} from './bound-page.js';
import {executeScopedOperation} from './site-scope.js';
import {updateTask,mergeListResults} from './task-store.js';
import {identifyListRow} from './list-identity.js';

// Fixed read-only inspector for the observed talent-management favorites view.
// Generic talent-library cards must not be mistaken for favorites.
export function inspectFavorites({limit}) {
 const visible=el=>Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && getComputedStyle(el).display!=='none');
 const text=document.body?.innerText ?? '';
 if(location.origin!=='https://h.liepin.com' || location.pathname!=='/resumemanage/showmytalentlist')return {status:'wrong_page'};
 if(/验证码|操作过于频繁|访问受限|安全验证/.test(text))return {status:'blocked'};
 if(![...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].some(el=>visible(el) && el.innerText.replace(/\s/g,'')==='收藏的简历·Talent'))return {status:'not_favorites'};
 const totalMatch=text.match(/共\s*([\d,]+)\s*份简历/);
 if(!totalMatch)return {status:'loading'};
 const total=Number(totalMatch[1].replace(/,/g,''));
 const cards=[...document.querySelectorAll('dl')].filter(el=>visible(el) && /收藏时间[：:]/.test(el.innerText));
 const rows=cards.slice(0,limit).map(el=>({
  source:'liepin',collection:'favorites',summary:el.innerText.trim(),
  savedAt:el.innerText.match(/收藏时间[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
  detailLinks:[...el.querySelectorAll('a[href]')].filter(visible).map(a=>a.getAttribute('href')),
 }));
 if(total>0 && !rows.length)return {status:'loading'};
 return {status:'ready',total,rows};
}
export async function openFavoritesDriver(pageId,{checkRuntime=checkReadRuntime,createPage}={}) {
 checkRuntime();
 if(!createPage) {
  createPage=createLiepinPage;
 }
 const page=await createPage();page.setActivePage(pageId);
 try {
  if(LIEPIN_CONNECTION!=='official' && !(await page.tabs()).find(tab=>tab.page===pageId)?.favoritesRead)throw new Error('配套扩展尚不支持收藏页读取');
  await readBoundLocation(page,pageId,'/resumemanage/showmytalentlist',{requireConnection:true});
  return {read:limit=>page.evaluate(inspectFavorites,{limit}),close:()=>page.closeWindow()};
 }catch(error){await page.closeWindow();throw error;}
}
export async function readFavorites(args,{openDriver=openFavoritesDriver}={}) {
 const limit=Number(args.limit ?? 10);
 if(!Number.isSafeInteger(limit) || limit<1 || limit>30 || !/^[a-fA-F0-9]{16,128}$/.test(args.page ?? ''))throw new Error('需要已绑定页面，limit 为1–30');
 const evidence=await executeScopedOperation(args.file,{operationId:args.operationId,kind:'inspect',payload:{view:'favorites',page:args.page,limit}},async()=>{
  const driver=await openDriver(args.page);
  try {
   const result=await driver.read(limit);
   if(result.status!=='ready' || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total<0)return {status:'blocked',evidence:{reason:result.status ?? 'favorites_not_ready'}};
   return {status:'completed',evidence:{total:result.total,rows:result.rows.slice(0,limit).map(row=>({...identifyListRow(row),source:'liepin',collection:'favorites'}))}};
  }finally{await driver.close();}
 });
 if(!evidence.rows)throw new Error('收藏列表未确认：'+evidence.reason);
 updateTask(args.file,task=>mergeListResults(task,evidence.rows,{roundId:`favorites-${args.operationId}`}));
 return evidence;
}
