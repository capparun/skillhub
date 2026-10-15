import {matchesConnection} from './connection.js';
// The official bridge binds the foreground tab. Verify its opener and the
// saved card before treating that foreground tab as this operation's popup.
export function inspectOfficialPopup({expectedUrl,cardSelector,detailTarget,summary,detailUrl,openerTimeOrigin}) {
 try {
  const url=new URL(location.href),parent=window.opener;
  if(location.href!==detailUrl || url.origin!=='https://h.liepin.com'
   || url.pathname!=='/resume/showresumedetail/' || !parent || parent.closed
   || parent.location.href!==expectedUrl)return false;
  if(openerTimeOrigin!==undefined && parent.performance?.timeOrigin!==openerTimeOrigin)return false;
  const cards=parent.document.querySelectorAll(cardSelector),targets=parent.document.querySelectorAll(detailTarget);
  if(cards.length!==1 || targets.length!==1 || !cards[0].contains(targets[0])
   || !targets[0].matches('.new-resume-personal-name'))return false;
  const actual=cards[0].innerText.trim();
  if(actual!==summary) {
   // Opening the card adds exactly one visible read badge. Ignore that
   // observed UI annotation only; every original content line must match.
   const badges=cards[0].querySelectorAll('div._40231KsyR4');
   if(badges.length!==1 || badges[0].textContent.trim()!=='阅')return false;
   const saved=summary.split('\n'),current=actual.split('\n');
   let index=0,skipped=0;
   for(const line of current) {
    if(line===saved[index])index++;
    else if(line==='阅' && skipped===0)skipped++;
    else return false;
   }
   if(index!==saved.length || skipped!==1)return false;
  }
  return true;
 }catch{return false;}
}

export function createOfficialPopupController({page,pageId,expectedUrl,bind,requireOrigin=false}) {
 let clicked=false,row,child,lastObservation;
 const bindObserved=async()=>{
  const result=await bind();
  const tabs=await page.tabs();
  // Keep transport metadata only; never retain unrelated URLs or page text.
  lastObservation={bindingMatches:tabs.length===1 && result.url===tabs[0].url,
   tabs:tabs.map(tab=>({page:tab.page,state:tab.url==null || tab.url==='' || tab.url==='about:blank'
    ?'pending':tab.page===pageId && tab.url===expectedUrl?'search':'other'}))};
  if(tabs.length!==1 || !/^[A-Fa-f0-9]{16,128}$/.test(tabs[0].page??'')
   || !matchesConnection(tabs[0]) || result.url!==tabs[0].url)
   throw new Error('官方前台绑定发生变化；停止，不重复点击');
  page.setActivePage(tabs[0].page);
  return tabs[0];
 };
 const provenance=tab=>({...row,expectedUrl,detailUrl:tab.url});
 return {
  observation:()=>lastObservation?structuredClone(lastObservation):null,
  clicked:record=>{if(requireOrigin && !Number.isFinite(record.openerTimeOrigin))throw new Error('缺少实际搜索文档来源；不接管详情');row=record;clicked=true;},
  children:async()=>{
   if(!clicked)return [];
   if(child)return [child];
   const observed=await bindObserved();
   // Chrome may expose only pendingUrl during popup creation. Never execute
   // in that transient tab; the caller's bounded discovery loop waits.
   if(observed.url==null || observed.url==='' || observed.url==='about:blank')return [];
   if(observed.page===pageId && observed.url===expectedUrl)return [];
   let url;
   try{url=new URL(observed.url);}catch{throw new Error('前台标签地址无法核对');}
   if(observed.page===pageId || url.origin!=='https://h.liepin.com'
    || url.pathname!=='/resume/showresumedetail/')
    throw new Error('前台标签不是本次猎聘详情；未读取，不重复点击');
   if(!await page.evaluate(inspectOfficialPopup,provenance(observed)))
    throw new Error('无法核对详情的搜索页来源与原卡片；未读取详情');
   child=observed;
   return [child];
  },
  adopt:async target=>{
   if(!child || target.page!==child.page || target.url!==child.url)
    throw new Error('详情目标不是已核对的官方前台标签');
   const tabs=await page.tabs();
   if(tabs.length!==1 || tabs[0].page!==child.page || tabs[0].url!==child.url)
    throw new Error('详情绑定丢失，停止读取');
   page.setActivePage(child.page);
  },
  returnToList:async()=>{
   // The official borrowed-tab API does not select the opener. Closing a
   // foreground detail neither proves it is new nor reliably activates its
   // opener. Preserve the detail and require an observed native tab return.
   throw new Error('官方绑定模式的自动返回尚未验收；详情保留，请通过浏览器标签栏返回原搜索页后重新 connect');
  }
 };
}

export function createManagedPopupController({page,parentPage,pageId,expectedUrl,bind}) {
 const popup=createOfficialPopupController({page,pageId,expectedUrl,bind,requireOrigin:true});
 return {...popup,returnToList:async()=>{
  // The parent is the agent's own search lease. Never bind that owned session
  // to the popup: official bind would release/reset its current owned tab.
  await parentPage.selectTab(pageId);
  const tabs=await parentPage.tabs();
  if(tabs.length!==1 || tabs[0].page!==pageId || tabs[0].url!==expectedUrl
   || tabs[0].active!==true || !matchesConnection(tabs[0]))
   throw new Error('官方独立会话未确认返回原搜索目标；不继续下一条');
 }};
}
