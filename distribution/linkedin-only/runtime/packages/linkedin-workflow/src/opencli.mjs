import { leadApiScript } from './lead-api.mjs';
import { readCurrentRoles } from './lead-roles.mjs';
import { isLeadFilterEmpty } from './search-empty.mjs';
import { typedControlScript } from './typed-fields.mjs';
import { blockingDialogExpression } from './page-safety.mjs';
import { filterSelectionScript, filterExpansionScript } from './filter-selection.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runtimeInvocation } from './runtime-invocation.mjs';
const exec = promisify(execFile);
const ERROR_CODES = new Map([['HTTP_403', 'access_denied'], ['RATE_LIMITED', 'rate_limited'], ['WINDOW_NOT_VISIBLE', 'window_not_visible'], ['semantic_not_found', 'page_changed'], ['selector_not_found', 'page_changed'], ['TIMEOUT', 'bridge_timeout']]);

export function transportErrorCode(error) {
  if (error?.code === 'BROWSER_CONNECT') return 'bridge_unreachable';
  if (error?.code === 'COMMAND_EXEC' && error?.message === 'Native input requires a visible browser page; input was not dispatched.') return 'window_not_visible';
  return ERROR_CODES.get(error?.code) ?? 'bridge_failure';
}

export class ExecutionError extends Error {
  constructor(code, message, upstreamCode) { super(message); this.code = code; if (typeof upstreamCode === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(upstreamCode)) this.details = { upstream_code: upstreamCode }; }
}

// No shell, arbitrary script, user URL, or mutation command is exposed.
export function createTransport({ executable, timeout = 20000, windowMode = 'foreground' } = {}) {
  const invocation = runtimeInvocation(executable);
  if (!['foreground', 'background'].includes(windowMode)) throw new ExecutionError('invalid_input', 'Invalid browser window mode.');
  let ownedPage;
  let searchForeground = false;
  async function call(args) {
    if (searchForeground && args[0] === 'browser' && ['eval', 'tab', 'open', 'click'].includes(args[1]) && !args.includes('--window')) args = [...args, '--window', 'foreground'];
    let stdout;
    try { ({ stdout } = await exec(invocation.command, [...invocation.prefix, ...args], { timeout, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, OPENCLI_WINDOW: searchForeground ? 'foreground' : windowMode, ...(args[0] === 'browser' && args[1] === 'close' ? { OPENCLI_CLOSE_OWNED_TAB: '1' } : {}) } })); }
    catch (error) {
      // Never forward raw process output or headers to the report.
      if (error.stdout) {
        try {
          const body = JSON.parse(error.stdout);
          if (body.ok === false) throw new ExecutionError(transportErrorCode(body.error), 'OpenCLI reported a failure.', body.error?.code);
        } catch (parsed) { if (parsed instanceof ExecutionError) throw parsed; }
      }
      throw new ExecutionError(error.killed ? 'bridge_timeout' : 'bridge_failure', 'OpenCLI execution did not complete.');
    }
    let body;
    try { body = JSON.parse(stdout); } catch { throw new ExecutionError('invalid_response', 'OpenCLI response is not JSON.'); }
    if (body.ok !== true || !body.data) throw new ExecutionError(transportErrorCode(body.error), 'OpenCLI did not return successful data.', body.error?.code);
    return body.data;
  }
  return {
    activateSearchPage: async context => {
      if (!ownedPage) throw new ExecutionError('window_not_visible', 'No owned search page is available to activate.');
      searchForeground = true;
      await call(['browser', 'tab', 'select', ownedPage, '--window', 'foreground', '--session', context.session, '--profile', context.profile]);
      return call(['browser', 'eval', '({visible:document.visibilityState === "visible",url:location.href})', '--session', context.session, '--profile', context.profile]);
    },
    readPageVisibility: context => call(['browser', 'eval', '({url:location.href,visibility:document.visibilityState})', '--session', context.session, '--profile', context.profile]),
    readLeadSearchApi: (keywords, start, context) => call(['browser', 'eval', leadApiScript(keywords, start), '--session', context.session, '--profile', context.profile]),
    readSearchFrame: context => call(['browser', 'eval', `(() => {
      const root=document.querySelector('#search-results-container');const list=root?.querySelector('ol.artdeco-list');
      const identities=[...document.querySelectorAll('header button[id^="hue-menu-trigger-"]')].map(e=>e.textContent.trim()).filter(Boolean);
      const fields=[...document.querySelectorAll('fieldset')].map(field=>{const legend=field.querySelector(':scope > legend,:scope > div > legend');const label=legend?.firstElementChild?.textContent.trim();const selected=field.querySelector(':scope > ul[aria-live="polite"]');return {label,values:[...selected?.querySelectorAll(':scope > li')??[]].map(li=>{const label=li.querySelector('[aria-label^=\"Remove \"]')?.getAttribute('aria-label');return label?.match(/^Remove .+ filter: “([^”]+)”$/)?.[1]??li.querySelector('.artdeco-pill__text')?.textContent.trim()??null;}).filter(Boolean)};}).filter(field=>field.label);
      const slots=[...list?.children??[]].map((li,index)=>{const company=li.querySelector('a[data-control-name="view_company_via_result_name"]');const lead=li.querySelector('a[data-control-name="view_lead_panel_via_search_lead_name"]');const anchor=company??lead;return {index,name:anchor?.textContent.trim()??null,href:anchor?.getAttribute('href')??null,summary:lead?(li.innerText??'').trim().slice(0,6000):null};});
      const paging=document.querySelector('[data-search-pagination-type]');const current=paging?.querySelector('button[aria-current="true"]');const next=paging?.querySelector('button[aria-label="Next"]');const pageText=paging?.querySelector('.artdeco-pagination__state--a11y')?.textContent.trim()??null;
      const totals=[...new Set([...document.querySelectorAll('span')].map(e=>e.textContent.trim()).filter(t=>/^[0-9,.KM+]+ results$/.test(t)))];
      let empty=[...document.querySelectorAll('h3')].map(e=>e.textContent.trim()).find(t=>t==='No accounts matched your search'||t==='No leads matched your search')??null;
      const norm=e=>e?.textContent.replace(/\\s+/g,' ').trim()??'';
      const banner=[...root?.querySelectorAll('section')??[]].find(e=>[...e.querySelectorAll('div')].some(d=>norm(d)==='No matches found'));
      const filter=norm(banner?.querySelector('strong'));
      const instruction=[...banner?.querySelectorAll('div')??[]].map(norm).find(t=>t.startsWith('Remove the '))??'';
      const suggestion=[...root?.querySelectorAll('span')??[]].map(norm).find(t=>/^\\d[\\d,.KM+]* leads available if you remove the /.test(t))??'';
      const filterEmpty=location.pathname==='/sales/search/people'&&(${isLeadFilterEmpty.toString()})({heading:banner?'No matches found':'',instruction,filter,removeButton:[...banner?.querySelectorAll('button')??[]].some(b=>norm(b)==='Remove filter'),suggestion});
      if(filterEmpty)empty='No leads matched your search';
      return {blocking_dialog:${blockingDialogExpression},url:location.href,visibility:document.visibilityState,identity:identities.length===1?identities[0]:null,fields,keywords:document.querySelector('#global-typeahead-search-input')?.value??null,slots:filterEmpty?[]:slots,ready:!!list||!!empty,empty,empty_reason:filterEmpty?'filter_no_matches_with_suggestions':null,empty_evidence:banner?{instruction,filter,suggestion}:null,pagination_present:!!paging?.querySelector('button,.artdeco-pagination__state--a11y'),page_label:pageText,current_page:current?.getAttribute('aria-label')??null,next_enabled:next?!next.disabled:null,total_text:filterEmpty?'0 results':totals.length===1?totals[0]:null,scroll:root?{top:root.scrollTop,height:root.clientHeight,total:root.scrollHeight}:null};
    })()`, '--session', context.session, '--profile', context.profile]),
    scrollResultSlot: (index, context) => call(['browser', 'eval', `(() => {const list=document.querySelector('#search-results-container ol.artdeco-list');const index=${JSON.stringify(index)};if(!Number.isInteger(index)||index<0||index>=100||!list?.children[index])return {dispatched:false};list.children[index].scrollIntoView({block:'start',behavior:'instant'});return {dispatched:true,index};})()`, '--session', context.session, '--profile', context.profile]),
    nextResultsPage: context => call(['browser', 'click', '--role', 'button', '--name', 'Next', '--session', context.session, '--profile', context.profile]),
    readLead: context => call(['browser', 'eval', `(() => {
      const root=document.querySelector('#profile-card-section');const about=document.querySelector('#about-section [data-anonymize="person-blurb"]');
      const text=selector=>{const nodes=root?.querySelectorAll(selector);return nodes?.length===1?nodes[0].textContent.trim():null;};
      const headline=root?.querySelector('[data-x--lead-profile-card--headline]');
      const current=(${readCurrentRoles.toString()})(root);
      return {blocking_dialog:${blockingDialogExpression},url:location.origin+location.pathname,ready:!!root,expandable:!!document.querySelector('#about-section button[data-test-expand-button]'),roles_more:current.more,fields:{name:text('h1[data-anonymize="person-name"]'),headline:text('[data-anonymize="headline"]'),location:headline?.nextElementSibling?.firstElementChild?.textContent.trim()??null,about:about?.textContent.trim()??null,current_roles:current.roles}};
    })()`, '--session', context.session, '--profile', context.profile]),
    expandLeadAbout: async context => {
      if (ownedPage) await call(['browser','tab','select',ownedPage,'--window','foreground','--session',context.session,'--profile',context.profile]);
      return call(['browser', 'click', '#about-section button[data-test-expand-button]', '--session', context.session, '--profile', context.profile]);
    },
    readCompany: context => call(['browser', 'eval', `(() => {
      const root=document.querySelector('#account-page-container');const header=root?.querySelector('aside header');
      const text=selector=>{const nodes=header?.querySelectorAll(selector);return nodes?.length===1?nodes[0].textContent.trim():null;};
      const website=header?.querySelector('a[aria-label$="account website (new window)"]');
      const about=document.querySelector('#about p');
      return {blocking_dialog:${blockingDialogExpression},url:location.origin+location.pathname,ready:!!header,expandable:!!about?.querySelector('button[data-control-name="read_more_description"]'),fields:{name:text('[data-anonymize="company-name"]'),industry:text('[data-anonymize="industry"]'),location:text('[data-anonymize="location"]'),employee_count_text:text('[data-anonymize="company-size"]'),revenue_text:text('[data-anonymize="revenue"]'),website:website?.href??null,about:about?.textContent.trim()??null}};
    })()`, '--session', context.session, '--profile', context.profile]),
    expandCompanyAbout: context => call(['browser', 'click', '#about p button[data-control-name="read_more_description"]', '--session', context.session, '--profile', context.profile]),
    fillFilter: (placeholder, query, context) => call(['browser', 'fill', `input[placeholder=${JSON.stringify(placeholder)}]`, query, '--session', context.session, '--profile', context.profile]),
    refreshFilter: (placeholder, query, context) => call(['browser', 'eval', `(() => {const e=document.querySelector(${JSON.stringify(`input[placeholder=${JSON.stringify(placeholder)}]`)});if(!e||e.value!==${JSON.stringify(query)})return {dispatched:false};e.dispatchEvent(new KeyboardEvent('keyup',{key:'e',code:'KeyE',keyCode:69,which:69,bubbles:true}));return {dispatched:true};})()`, '--session', context.session, '--profile', context.profile]),
    prepareFilterOption: (field, label, mode, context) => call(['browser', 'eval', filterSelectionScript(field, label, mode, { prepare: true }), '--session', context.session, '--profile', context.profile]),
    captureScreenshot: (path, context) => call(['browser', 'screenshot', path, '--session', context.session, '--profile', context.profile]),
    resolveFilterOption: (field, label, mode, context) => call(['browser', 'eval', filterSelectionScript(field, label, mode), '--session', context.session, '--profile', context.profile]),
    selectFilter: (field, label, mode, context, selector) => call(['browser', 'click', ...(selector ? [selector] : ['--role', mode === 'exclude' ? 'button' : 'option', '--name', mode === 'exclude' ? `Exclude “${label}” from ${field} filter` : `Include “${label}” in ${field} filter`]), '--session', context.session, '--profile', context.profile]),
    fillLocation: (query, context) => call(['browser', 'fill', 'input[placeholder="Add locations"]', query, '--session', context.session, '--profile', context.profile]),
    refreshLocation: (query, context) => call(['browser', 'eval', `(() => {const e=document.querySelector('input[placeholder="Add locations"]');if(!e||e.value!==${JSON.stringify(query)})return {dispatched:false};e.dispatchEvent(new KeyboardEvent('keyup',{key:'e',code:'KeyE',keyCode:69,which:69,bubbles:true}));return {dispatched:true};})()`, '--session', context.session, '--profile', context.profile]),
    readKeywords: context => call(['browser', 'eval', `(() => {const e=document.querySelector('#global-typeahead-search-input');return {url:location.href,value:e?.value??null};})()`, '--session', context.session, '--profile', context.profile]),
    fillKeywords: (keywords, context) => call(['browser', 'fill', '--role', 'combobox', '--name', 'Search keywords', keywords, '--session', context.session, '--profile', context.profile]),
    submitKeywords: (keywords, context) => call(['browser', 'eval', `(() => { const e = document.querySelector('#global-typeahead-search-input'); if (!e || e.value !== ${JSON.stringify(keywords)}) return {dispatched:false}; e.focus(); for (const type of ['keydown','keypress','keyup']) e.dispatchEvent(new KeyboardEvent(type, {key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true})); return {dispatched:true}; })()`, '--session', context.session, '--profile', context.profile]),
    selectGeography: (label, context) => call(['browser', 'click', '--role', 'option', '--name', `Include “${label}” in Region filter`, '--session', context.session, '--profile', context.profile]),
    selectHeadcount: (label, context) => call(['browser', 'click', '--role', 'option', '--name', `Include “${label}” in Company headcount filter`, '--session', context.session, '--profile', context.profile]),
    resolveFilterExpansion: (field, context) => call(['browser', 'eval', filterExpansionScript(field), '--session', context.session, '--profile', context.profile]),
    expandFilter: (field, context, selector) => call(['browser', 'click', selector, '--session', context.session, '--profile', context.profile]),
    readFieldControls: (schema,context) => call(['browser','eval',`[...document.querySelectorAll('fieldset[data-x-search-filter='+${JSON.stringify(schema.query_type)}+'] input,fieldset[data-x-search-filter='+${JSON.stringify(schema.query_type)}+'] select')].map(e=>({tag:e.tagName,type:e.type,placeholder:e.getAttribute('placeholder'),label:e.getAttribute('aria-label'),min:e.min,max:e.max,step:e.step,options:e.tagName==='SELECT'?[...e.options].map(o=>({label:o.text,value:o.value})):undefined}))`,'--session',context.session,'--profile',context.profile]),
    readTypedFilter: (schema,value,context) => call(['browser','eval',typedControlScript(schema,value),'--session',context.session,'--profile',context.profile]),
    fillTypedFilter: (schema,value,context) => call(['browser','eval',typedControlScript(schema,value,true),'--session',context.session,'--profile',context.profile]),
    submitTypedFilter: (schema,context) => call(['browser','click', schema.source==='boolean' ? `fieldset[data-x-search-filter=${JSON.stringify(schema.query_type)}] label` : `button[aria-label=${JSON.stringify('Add filter for '+schema.label+' to search results')}]`, '--session',context.session,'--profile',context.profile]),
    profiles: () => call(['profile', 'list']),
    connectionState: () => call(['daemon', 'status']),
    open: async (url, context) => {
      const result = await call(['browser', 'open', url, '--session', context.session, '--profile', context.profile]);
      ownedPage = typeof result.page === 'string' ? result.page : undefined;
      return result;
    },
    close: context => call(['browser', 'close', '--session', context.session, '--profile', context.profile]),
    state: (context) => call(['browser', 'state', '--session', context.session, '--profile', context.profile]),
  };
}
