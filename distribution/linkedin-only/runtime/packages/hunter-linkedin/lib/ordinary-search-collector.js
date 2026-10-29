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
  // Cards, not whole-page text: mutual-connection lines can also contain "LinkedIn Member".
  const anonymousName=/LinkedIn Member|领英会员|LinkedIn会员/i;
  const cardLike=e=>Boolean(e.querySelector('a[href*="/in/"]'))||anonymousName.test(e.textContent||'');
  let items=[],matchedSelector='';
  // Current LinkedIn builds obfuscate class names but keep role=list/listitem; anonymous
  // cards expose no profile link, so class-based selectors alone cannot see them.
  const lists=[...root.querySelectorAll('[role="list"]')].map(list=>{
    const all=[...list.querySelectorAll('[role="listitem"]')];
    return {all,likes:all.filter(cardLike).length};
  }).filter(entry=>entry.likes>0).sort((a,b)=>b.likes-a.likes);
  if(lists.length){items=[...new Set(lists[0].all)];matchedSelector='[role="list"] [role="listitem"]';}
  else for(const selector of ['li.reusable-search__result-container','.entity-result__item','[data-test-id="search-result-card"]','[data-chameleon-result-urn]','li.artdeco-list__item']){
    const matches=[...root.querySelectorAll(selector)].filter(cardLike);
    if(matches.length){items=matches;matchedSelector=selector;break;}
  }
  const results=[],seen=new Set();
  const identities={identified:0,visibility_limited:0,unresolved:0,cards:items.length,source:items.length?'result_cards':'link_fallback'};
  // 1 = added, 0 = valid duplicate card, -1 = link outside the profile URL contract.
  const add=(link,rawName)=>{
    try{const u=new URL(link.href);if(!/^(www\.)?linkedin\.com$/.test(u.hostname)||!/^\/in\/[^/]+\/?$/.test(u.pathname))return -1;
      u.hostname='www.linkedin.com';u.search='';u.hash='';u.pathname=u.pathname.replace(/\/$/,'')+'/';
      const id=u.pathname.split('/')[2];if(seen.has(id))return 0;seen.add(id);results.push({profileId:id,profileUrl:u.href,rawName:rawName.replace(/\s+/g,' ').trim()});return 1;
    }catch{return -1;}
  };
  for(const item of items){
    const link=item.querySelector('a[href*="/in/"]');
    if(!link){identities[anonymousName.test(item.textContent||'')?'visibility_limited':'unresolved']++;continue;}
    const state=add(link,item.textContent||link.textContent||'');
    identities[state<0?'unresolved':'identified']++;
  }
  if(!items.length){for(const link of root.querySelectorAll('a[href*="/in/"]')){
    const text=link.textContent?.trim()??'';if(text.length>=30&&/(?:•\s*(?:1st|2nd|3rd)|Connect|Follow|Message|加为好友|发消息)/i.test(text))add(link,text);
  }identities.identified=results.length;identities.cards=results.length;}
  const resultCardSignature=items.slice(0,40).map(item=>{
    const link=item.querySelector('a[href*="/in/"]');
    const href=link?String(link.href).replace(/[?#].*$/,''):'anon';
    const text=(item.textContent||'').replace(/\s+/g,' ').trim().slice(0,80);
    return href+'|'+text;
  }).join('\n').slice(0,4096);
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
  const anonymousCount=identities.visibility_limited;
  const noResults=!results.length&&/No results found|We (?:couldn.t|could not) find|没有结果|未找到.*结果/i.test(headings);
  const workspace=document.querySelector('main#workspace');
  const scroller=workspace&&/auto|scroll/.test(getComputedStyle(workspace).overflowY)?workspace:document.scrollingElement??document.documentElement;
  return {url,results,anonymous_count:anonymousCount,identity:identities,card_signature:resultCardSignature,login,verification,blocked,noResults,filter_state:filterState,pagination:{nextExists,nextEnabled,nextInViewport,ambiguous:next.length>1,selectedPage:selected.length===1?selected[0]:null},scroll:{top:scroller.scrollTop,height:scroller.clientHeight,total:scroller.scrollHeight},loading:!!root.querySelector('[aria-busy="true"],.artdeco-loader'),diagnostics:{matchedSelector,matchedItems:items.length}};
}

// Run a whole bounded search in one authenticated adapter invocation. No new
// identity navigation per page. Account checks remain in the ordinary gateway.
const anonymousPolicies=['stop','continue'];
export async function collectOrdinarySearch({read,navigate,scroll,searchUrl,limit,maxPages,previous,onCheckpoint,anonymousPolicy='stop',sleep=ms=>new Promise(r=>setTimeout(r,ms)),clock=()=>performance.now(),waitMs=15000}){
  if(!Number.isInteger(limit)||limit<1||limit>2500||maxPages!==undefined&&(!Number.isInteger(maxPages)||maxPages<1||maxPages>250))fail('invalid_search_limit');
  if(!anonymousPolicies.includes(anonymousPolicy))fail('invalid_anonymous_policy');
  const fingerprint=queryKey(searchUrl);
  if(previous&&(previous.query_fingerprint!==fingerprint||!Array.isArray(previous.results)||!Number.isInteger(previous.page)||previous.page<1||previous.page>2500))fail('cursor_query_mismatch');
  if(previous&&(previous.anonymous_policy??'stop')!==anonymousPolicy)fail('cursor_policy_mismatch');
  const results=structuredClone(previous?.results??[]),seen=new Set(results.map(r=>r.profileId));
  if(previous&&results.length>=limit)fail('resume_limit_must_increase');
  let page=previous?.page??Number(new URL(searchUrl).searchParams.get('page')||1),pagesRead=0,scrollRounds=0,stop='result_limit',complete=false,interruption=null,pendingIds=previous?.page_ids??null,lastCardSignature=null;
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
  // Per-card identity state. Older frames only expose anonymous_count, which is still
  // compared as the visibility-limited count rather than silently ignored.
  const identityOf=frame=>{const raw=frame.identity??{};
    const anonymous=Number.isFinite(raw.visibility_limited)?raw.visibility_limited:Number(frame.anonymous_count)||0;
    const unresolved=Number.isFinite(raw.unresolved)?raw.unresolved:0;
    return {identified:frame.results.length,visibility_limited:anonymous,unresolved,cards:Number.isFinite(raw.cards)?raw.cards:frame.results.length+anonymous};
  };
  const observe=async()=>{timing.reads++;const frame=validate(await read());
    const observed=pageObservations.get(page)??{page,ids:new Set()};
    for(const row of frame.results)observed.ids.add(row.profileId);
    const identity=identityOf(frame);
    observed.anonymous_people=Math.max(observed.anonymous_people??0,identity.visibility_limited);
    observed.named_people=Math.max(observed.named_people??0,identity.identified);
    observed.unresolved_cards=Math.max(observed.unresolved_cards??0,identity.unresolved);
    observed.cards_inspected=Math.max(observed.cards_inspected??0,identity.cards);
    observed.next_exists=frame.pagination?.nextExists??null;observed.next_enabled=frame.pagination?.nextEnabled??null;
    pageObservations.set(page,observed);
    if(frame.filter_state)filterObservations.set(page,{page,url:frame.url,...frame.filter_state});return frame;};
  // Cards settle quickly in practice. Return as soon as the card signature stops changing
  // instead of always burning the full wait window; waitMs stays the hard cap for slow pages.
  const stableReads=4;
  async function ready(){const start=clock();let lastSignature='',stable=0;try{
    for(;;){
      const frame=await observe();
      const identity=identityOf(frame);
      const hasCards=identity.visibility_limited||identity.unresolved||frame.results.length;
      // Unresolved or still-anonymous cards can be an intermediate render; wait before classifying.
      if(!frame.loading && !identity.visibility_limited && !identity.unresolved && (frame.noResults||frame.results.length))return frame;
      const signature=[frame.loading,frame.results.length,identity.visibility_limited,identity.unresolved,frame.pagination?.nextExists,frame.pagination?.nextEnabled].join('/');
      if(signature===lastSignature)stable++;
      else{stable=0;lastSignature=signature;}
      if(hasCards&&!frame.loading&&stable>=stableReads)return frame;
      if(clock()-start>=waitMs){
        if(!frame.loading && (identity.visibility_limited||identity.unresolved))return frame;
        fail('search_not_rendered');
      }
      await sleep(250);
    }
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
      let cardState=identityOf(frame);
      // Unresolved cards are never skipped; anonymous-only pages follow the explicit policy.
      if(!frame.results.length&&cardState.unresolved>0){complete=false;stop='profiles_unresolved';interruption={code:stop};break;}
      if(!frame.results.length&&cardState.visibility_limited>0&&anonymousPolicy==='stop'){complete=false;stop='profile_identity_unavailable';interruption={code:stop};break;}
      if(frame.noResults){complete=true;stop=results.length?'results_exhausted':'verified_empty';break;}
      let idle=0,priorTop=-1;
      for(;;){
        const ids=frame.results.map(r=>r.profileId);
        for(const row of frame.results){
          if(typeof row.profileId!=='string'||!row.profileId||typeof row.profileUrl!=='string'||row.profileUrl!=='https://www.linkedin.com/in/'+row.profileId+'/')fail('invalid_search_response');
          if(!seen.has(row.profileId)){if(results.length>=limit)break;seen.add(row.profileId);results.push(row);}
        }
        cardState=identityOf(frame);
        // ready() already waited for these identities; scrolling can hide unresolved cards.
        if(cardState.unresolved>0){complete=false;stop='profiles_unresolved';interruption={code:stop};break;}
        if(cardState.visibility_limited>0&&anonymousPolicy==='stop'){complete=false;stop='profile_identity_unavailable';interruption={code:stop};break;}
        // Under 'continue', stop scrolling so virtualised anonymous cards are not replaced before page advance.
        if(cardState.visibility_limited>0)break;
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
      // Unresolved identities already stopped above and are never skipped.
      // Named rows are preserved; 'continue' advances past confirmed visibility-limited cards.
      if(interruption)break;
      cardState=identityOf(frame);
      // Anonymous pages carry no person ids, so named-count growth cannot detect progress.
      // Compare the rendered card signature instead; identical consecutive pages are real repeats.
      const signatureKnown=typeof frame.card_signature==='string'&&frame.card_signature.length>0;
      const pageNew=results.length>pageStartCount;
      const repeated=signatureKnown?lastCardSignature!==null&&frame.card_signature===lastCardSignature:!pageNew&&pagesRead>1;
      if(signatureKnown)lastCardSignature=frame.card_signature;
      if(cardState.visibility_limited>0){
        if(results.length>=limit){
          if(frame.pagination?.nextExists&&frame.pagination.nextEnabled)page++;
          complete=false;stop='result_limit';break;
        }
        if(!frame.pagination?.nextExists||!frame.pagination.nextEnabled){complete=false;stop='visibility_limited_pagination_end';break;}
        if(repeated){complete=false;stop='no_new_people';break;}
        page++;
        if(onCheckpoint){
          try{await onCheckpoint(structuredClone({page,results,query_fingerprint:fingerprint,page_ids:null,anonymous_policy:anonymousPolicy}));}
          catch{fail('checkpoint_write_failed');}
        }
        if(maxPages!==undefined&&pagesRead>=maxPages){stop='page_limit';break;}
        await go();continue;
      }
      if(results.length>=limit||complete)break;
      if(!frame.pagination?.nextExists){stop='pagination_unavailable';break;}
      if(!frame.pagination.nextEnabled){complete=true;stop='results_exhausted';break;}
      // Never spin indefinitely through identical pages with Next still enabled.
      if(repeated){stop='no_new_people';break;}
      page++;
      if(onCheckpoint){
        try{await onCheckpoint(structuredClone({page,results,query_fingerprint:fingerprint,page_ids:null,anonymous_policy:anonymousPolicy}));}
        catch{fail('checkpoint_write_failed');}
      }
      if(maxPages!==undefined&&pagesRead>=maxPages){stop='page_limit';break;}
      await go();
    }
  }catch(error){
    stop=error.code??'collection_interrupted';interruption={code:stop};
    if(!results.length)throw error;
  }
  const pageObservationsList=[...pageObservations.values()].map(({ids,...rest})=>({...rest,observed_unique_people:ids.size}));
  const sum=key=>pageObservationsList.reduce((total,page)=>total+(page[key]??0),0);
  // Card counts describe this run only; collected_total also includes people carried by a resume cursor.
  const identitySummary={cards_inspected:sum('cards_inspected'),named_cards:sum('named_people'),visibility_limited_cards:sum('anonymous_people'),unresolved_cards:sum('unresolved_cards'),collected_total:results.length,scope:'per_run_cards_with_cumulative_total',cross_page_dedupe:'named_only',anonymous_scope:'Anonymous cards have no stable profile identifier; counts are page observations and are not deduplicated across pages.',anonymous_policy:anonymousPolicy};
  // A cursor is only useful when there is a readable next page or unread cards on this page.
  // Cursors after "no next page", "no new people" or "pagination unavailable" mislead callers
  // into rereading the same page, so those terminal stops never expose one.
  const lastObserved=pageObservationsList.at(-1);
  const resumable=!complete&&!interruption&&!['visibility_limited_pagination_end','no_new_people','pagination_unavailable'].includes(stop)&&Boolean(pendingIds||(lastObserved?.next_exists&&lastObserved?.next_enabled));
  return {results,page_observations:pageObservationsList,identity_summary:identitySummary,filter_observations:[...filterObservations.values()],new_count:results.length-(previous?.results?.length??0),returned_count:results.length,pages_viewed:pagesRead,scroll_rounds:scrollRounds,stop_reason:stop,completeness:complete?'complete':'partial',truncated:!complete,interruption,
    query_fingerprint:fingerprint,timing:{...timing,total_ms:clock()-began},resume:resumable?{page,results,query_fingerprint:fingerprint,page_ids:pendingIds,anonymous_policy:anonymousPolicy}:null};
}
