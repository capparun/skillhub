import {createHash} from 'node:crypto';

const fail=code=>{throw Object.assign(new Error(code),{code});};
export function queryKey(value){
  let url;try{url=new URL(value);}catch{fail('invalid_search_url');}
  if(url.origin!=='https://www.linkedin.com'||url.pathname!=='/search/results/people/')fail('unexpected_search_page');
  const ignored=new Set(['page','origin','sid','searchId','refId','trackingId','trk','sessionId']);
  const pairs=[...url.searchParams].filter(([key])=>!ignored.has(key)).sort(([a,b],[c,d])=>a.localeCompare(c)||b.localeCompare(d));
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}
export function pageURL(base,page){const url=new URL(base);queryKey(url.href);url.searchParams.set('page',String(page));return url.href;}
export function scrollOrdinarySearchDOM(){
  const main=document.querySelector('main#workspace');
  const scroller=main&&/auto|scroll/.test(getComputedStyle(main).overflowY)?main:document.scrollingElement;
  if(scroller)scroller.scrollTop+=Math.max(500,scroller.clientHeight*0.85);
}
export function inspectOrdinarySearchDOM(){
  const root=document.querySelector('main')??document;
  const url=location.href;
  const headings=[...root.querySelectorAll('h1,h2,h3,[role="alert"]')].map(e=>e.textContent.trim()).join('\n');
  const login=/\/login|\/authwall|\/uas\/login/.test(location.pathname);
  const verification=/\/checkpoint/.test(location.pathname);
  const blocked=/commercial use limit|you(?:'|’)ve reached.*search limit|you have reached.*search limit|upgrade to search more|已达到.*搜索.*限制/i.test(headings);
  let items=[],matchedSelector='';
  for(const selector of ['li.reusable-search__result-container','.entity-result__item','[data-test-id="search-result-card"]','[data-chameleon-result-urn]','li.artdeco-list__item']){
    const matches=[...root.querySelectorAll(selector)].filter(e=>e.querySelector('a[href*="/in/"]'));
    if(matches.length){items=matches;matchedSelector=selector;break;}
  }
  const results=[],seen=new Set();
  const add=(link,rawName)=>{
    try{const u=new URL(link.href);if(!/^(www\.)?linkedin\.com$/.test(u.hostname)||!/^\/in\/[^/]+\/?$/.test(u.pathname))return;
      u.hostname='www.linkedin.com';u.search='';u.hash='';u.pathname=u.pathname.replace(/\/$/,'')+'/';
      const id=u.pathname.split('/')[2];if(seen.has(id))return;seen.add(id);results.push({profileId:id,profileUrl:u.href,rawName:rawName.replace(/\s+/g,' ').trim()});
    }catch{/* Ignore links outside profile URL contract. */}
  };
  for(const item of items){const link=item.querySelector('a[href*="/in/"]');add(link,item.textContent||link.textContent||'');}
  if(!results.length)for(const link of root.querySelectorAll('a[href*="/in/"]')){
    const text=link.textContent?.trim()??'';if(text.length>=30&&/(?:•\s*(?:1st|2nd|3rd)|Connect|Follow|Message|加为好友|发消息)/i.test(text))add(link,text);
  }
  const controls=[...document.querySelectorAll('button,[role="button"],a[aria-label],label[for]')];
  const filterState={
    source:'visible_dom',
    controls:controls.filter(e=>e.getClientRects().length>0).map(e=>({text:(e.getAttribute('aria-label')||e.textContent||'').replace(/\s+/g,' ').trim(),role:e.getAttribute('role')||e.tagName?.toLowerCase(),pressed:e.getAttribute('aria-pressed'),expanded:e.getAttribute('aria-expanded')})).filter(e=>e.text&&e.text.length<=100).slice(0,80),
    selected:[...document.querySelectorAll('input[type="checkbox"]:checked,[role="checkbox"][aria-checked="true"],[aria-pressed="true"]')].filter(e=>e.getClientRects().length>0||[...(e.labels??[])].some(label=>label.getClientRects().length>0)).map(e=>({text:(e.getAttribute('aria-label')||e.textContent||'').replace(/\s+/g,' ').trim(),evidence:e.checked?'checked':'aria_selected'})).filter(e=>e.text&&e.text.length<=100).slice(0,40),
    scope:'visible controls and explicit selection attributes; displayed labels alone are not proof of selection'
  };
  const next=controls.filter(e=>/^(?:Next(?: page)?|下一页)$/i.test((e.getAttribute('aria-label')||e.textContent||'').trim())&&e.getClientRects().length>0);
  const nextExists=next.length===1;
  const nextEnabled=nextExists&&!next[0].disabled&&next[0].getAttribute('aria-disabled')!=='true';
  const nextRect=nextExists?next[0].getBoundingClientRect():null;
  const nextInViewport=!!nextRect&&nextRect.top>=0&&nextRect.bottom<=innerHeight;
  const selected=[...document.querySelectorAll('[aria-current="page"]')].map(e=>Number((e.textContent||e.getAttribute('aria-label')||'').replace(/\D/g,''))).filter(n=>Number.isInteger(n)&&n>0);
  const anonymousCount=(root.innerText??'').split(/\n+/).filter(text=>/^(?:LinkedIn Member|领英会员|LinkedIn会员)$/i.test(text.trim())).length;
  const noResults=!results.length&&/No results found|We (?:couldn.t|could not) find|没有结果|未找到.*结果/i.test(headings);
  const workspace=document.querySelector('main#workspace');
  const scroller=workspace&&/auto|scroll/.test(getComputedStyle(workspace).overflowY)?workspace:document.scrollingElement??document.documentElement;
  return {url,results,anonymous_count:anonymousCount,login,verification,blocked,noResults,filter_state:filterState,pagination:{nextExists,nextEnabled,nextInViewport,ambiguous:next.length>1,selectedPage:selected.length===1?selected[0]:null},scroll:{top:scroller.scrollTop,height:scroller.clientHeight,total:scroller.scrollHeight},loading:!!root.querySelector('[aria-busy="true"],.artdeco-loader'),diagnostics:{matchedSelector,matchedItems:items.length}};
}

// Run a whole bounded search in one authenticated adapter invocation. No new
// identity navigation per page. Account checks remain in the ordinary gateway.
export async function collectOrdinarySearch({read,navigate,scroll,searchUrl,limit,maxPages,previous,sleep=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>performance.now(),waitMs=15000}){
  if(!Number.isInteger(limit)||limit<1||limit>2500||maxPages!==undefined&&(!Number.isInteger(maxPages)||maxPages<1||maxPages>250))fail('invalid_search_limit');
  const fingerprint=queryKey(searchUrl);
  if(previous&&(previous.query_fingerprint!==fingerprint||!Array.isArray(previous.results)||!Number.isInteger(previous.page)||previous.page<1||previous.page>2500))fail('cursor_query_mismatch');
  const results=structuredClone(previous?.results??[]),seen=new Set(results.map(r=>r.profileId));
  if(previous&&results.length>=limit)fail('resume_limit_must_increase');
  let page=previous?.page??Number(new URL(searchUrl).searchParams.get('page')||1),pagesRead=0,scrollRounds=0,stop='result_limit',complete=false,interruption=null,pendingIds=previous?.page_ids??null;
  const filterObservations=new Map(),pageObservations=new Map();
  const timing={navigation_ms:0,readiness_ms:0,scroll_wait_ms:0,reads:0,navigations:0};const began=clock();
  const validate=frame=>{
    if(frame.login)fail('not_logged_in');if(frame.verification)fail('verification_required');if(frame.blocked)fail('search_restricted');
    if(queryKey(frame.url)!==fingerprint)fail('query_changed');
    const actual=Number(new URL(frame.url).searchParams.get('page')||1);
    if(actual!==page||frame.pagination?.selectedPage&&frame.pagination.selectedPage!==page)fail('page_changed');
    if(frame.pagination?.ambiguous)fail('pagination_ambiguous');
    if(!Array.isArray(frame.results))fail('invalid_search_response');
    return frame;
  };
  const observe=async()=>{timing.reads++;const frame=validate(await read());
    const observed=pageObservations.get(page)??{page,ids:new Set()};
    for(const row of frame.results)observed.ids.add(row.profileId);
    observed.anonymous_people=Math.max(observed.anonymous_people??0,frame.anonymous_count??0);
    observed.next_exists=frame.pagination?.nextExists??null;observed.next_enabled=frame.pagination?.nextEnabled??null;
    pageObservations.set(page,observed);
    if(frame.filter_state)filterObservations.set(page,{page,url:frame.url,...frame.filter_state});return frame;};
  async function ready(){const start=clock();try{
    for(;;){const frame=await observe();if(frame.noResults||frame.results.length||frame.anonymous_count>0)return frame;if(clock()-start>=waitMs)fail('search_not_rendered');await sleep(250);}
  }finally{timing.readiness_ms+=clock()-start;}}
  async function go(){const start=clock();try{await navigate(pageURL(searchUrl,page));timing.navigations++;}finally{timing.navigation_ms+=clock()-start;}}
  try{
    // A resume starts at its stored page; the initial caller already navigated.
    if(previous)await go();
    while(results.length<limit){
      const pageStartCount=results.length;
      let frame=await ready();pagesRead++;
      if(pendingIds&&JSON.stringify(frame.results.map(r=>r.profileId))!==JSON.stringify(pendingIds))fail('resume_page_changed');
      pendingIds=null;
      if(!frame.results.length&&frame.anonymous_count>0){stop='profile_identity_unavailable';interruption={code:stop};break;}
      if(frame.noResults){complete=true;stop=results.length?'results_exhausted':'verified_empty';break;}
      let idle=0,priorTop=-1;
      for(;;){
        const ids=frame.results.map(r=>r.profileId);
        for(const row of frame.results){
          if(typeof row.profileId!=='string'||!row.profileId||typeof row.profileUrl!=='string'||row.profileUrl!=='https://www.linkedin.com/in/'+row.profileId+'/')fail('invalid_search_response');
          if(!seen.has(row.profileId)){if(results.length>=limit)break;seen.add(row.profileId);results.push(row);}
        }
        if(results.length>=limit){
          const unread=frame.results.some(row=>!seen.has(row.profileId));
          if(unread){pendingIds=ids;stop='result_limit';}
          else if(frame.pagination?.nextExists&&frame.pagination.nextEnabled){page++;stop='result_limit';}
          else if(frame.pagination?.nextExists&&!frame.pagination.nextEnabled){complete=true;stop='results_exhausted';}
          else stop='pagination_unavailable';
          break;
        }
        const bottom=frame.scroll&&frame.scroll.top+frame.scroll.height>=frame.scroll.total-3;
        if((bottom||frame.pagination?.nextInViewport)&&!frame.loading)break;
        if(frame.scroll?.top===priorTop&&!frame.loading&&idle>=1)fail('page_not_fully_observed');
        priorTop=frame.scroll?.top;
        await scroll();scrollRounds++;
        const start=clock();let newer;
        try{for(;;){newer=await observe();const changed=newer.results.some(row=>!ids.includes(row.profileId));if(changed||!newer.loading&&clock()-start>=250)break;if(clock()-start>=waitMs)fail('search_not_rendered');await sleep(250);}}
        finally{timing.scroll_wait_ms+=clock()-start;}
        idle=newer.results.some(row=>!ids.includes(row.profileId))?0:idle+1;frame=newer;
      }
      if(results.length>=limit||complete)break;
      if(!frame.pagination?.nextExists){stop='pagination_unavailable';break;}
      if(!frame.pagination.nextEnabled){complete=true;stop='results_exhausted';break;}
      // Never spin indefinitely through identical pages with Next still enabled.
      const pageNew=results.length>pageStartCount;
      if(!pageNew&&pagesRead>1){stop='no_new_people';break;}
      page++;
      if(maxPages!==undefined&&pagesRead>=maxPages){stop='page_limit';break;}
      await go();
    }
  }catch(error){
    stop=error.code??'collection_interrupted';interruption={code:stop};
    if(!results.length)throw error;
  }
  return {results,page_observations:[...pageObservations.values()].map(({ids,...rest})=>({...rest,observed_unique_people:ids.size})),filter_observations:[...filterObservations.values()],new_count:results.length-(previous?.results?.length??0),returned_count:results.length,pages_viewed:pagesRead,scroll_rounds:scrollRounds,stop_reason:stop,completeness:complete?'complete':'partial',truncated:!complete,interruption,
    query_fingerprint:fingerprint,timing:{...timing,total_ms:clock()-began},resume:complete||interruption?null:{page,results,query_fingerprint:fingerprint,page_ids:pendingIds}};
}
