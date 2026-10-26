import { keywordLeadRead } from './lead-api.mjs';
import { expandFilter } from './filter-selection.mjs';
import { collectPages, queryFingerprint } from './pagination.mjs';
import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage, stopOnAccessFailure } from './account-check.mjs';
import { normalizeFilters, queryFilters, parseFieldOptions } from './fields.mjs';
import { matchesFilters } from './query.mjs';
import { searchPostconditionError } from './search-diagnostics.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function searchConditions(data, searchType, normalized, keywords) {
  const url = new URL(data.url);
  if (url.origin !== 'https://www.linkedin.com' || url.pathname !== `/sales/search/${searchType === 'account' ? 'company' : 'people'}`) fail('page_changed');
  if (!matchesFilters(url.searchParams.get('query'), { keywords, filters: queryFilters(normalized) })) return false;
  if (!normalized.every(({ schema, values, input }) => input !== undefined || values.every(value => {
    if (data.snapshot.includes(`Remove ${schema.ui} filter: “${value.label}”`)) return true;
    // On an empty result set the platform can disable remove/expand controls,
    // while preserving the selected chip under its exact field legend.
    const marker = [`<span>${schema.label}</span>`, `<div>${schema.label}</div>`].find(marker => data.snapshot.includes(marker));
    if (!marker) return false;
    const field = data.snapshot.slice(data.snapshot.indexOf(marker)).split('<fieldset')[0];
    return field.includes('<ul aria-live=polite />') && field.includes(`<div title=${value.label} />`) && field.includes(`<span>${value.label}</span>`);
  }))) return false;
  if (keywords && !(data.keyword_input?.url === data.url && data.keyword_input.value === keywords) && !data.snapshot.split('\n').some(line => line.includes('<input id=global-typeahead-search-input ') && line.endsWith(`value=${keywords} />`))) return false;
  return true;
}
export function parseSearchResults(data, searchType, normalized, keywords, limit) {
  if (!searchConditions(data, searchType, normalized, keywords)) return null;
  const empty = data.snapshot.includes(searchType === 'lead' ? '<h3>No leads matched your search</h3>' : '<h3>No accounts matched your search</h3>');
  const section = data.snapshot.split('id=search-results-container')[1];
  if (!empty && (!section || !section.includes('<h2>Search Results</h2>'))) return null;
  const results = [];
  if (section) {
    const expression = searchType === 'account' ? /<a [^\n]*href=\/sales\/company\/(\d+)(?:\?[^>\n]*)?>([^<\n]+)<\/a>/g : /<a [^\n]*href=(\/sales\/lead\/([A-Za-z0-9_-]+),[A-Za-z0-9_,%-]+)(?:\?[^\s]*)? \/>\n\s+<span>([^<\n]+)<\/span>/g;
    for (const match of section.matchAll(expression)) {
      const row = searchType === 'account' ? { id: match[1], name: match[2], url: `https://www.linkedin.com/sales/company/${match[1]}` } : { id: match[2], name: match[3], url: `https://www.linkedin.com${match[1]}` };
      if (!results.some(result => result.id === row.id)) results.push(row);
      if (results.length >= limit) break;
    }
  }
  // Conflicting empty/cards markers are a transition or changed layout.
  if (empty && results.length || !empty && !results.length) return null;
  const conditions = { ...(keywords ? { keywords } : {}), filters: Object.fromEntries(normalized.map(({ key, values, input }) => [key, input ?? values])) };
  return { requested_filters: conditions, applied_filters: conditions, results, returned_count: results.length, completeness: empty ? 'complete' : 'partial', truncated: !empty, pagination: empty ? 'end' : 'not_implemented', result_scope: empty ? 'verified_empty' : 'visible_cards_first_page', evidence: { page: `${new URL(data.url).origin}${new URL(data.url).pathname}`, query: new URL(data.url).searchParams.get('query') }, checked_at: new Date().toISOString() };
}
export async function search(input, searchType, transport, options = {}) {
  if (!input || Object.keys(input).some(key => !['profile', 'expected_identity', 'expected_profile_url', 'keywords', 'filters', 'limit', 'max_pages'].includes(key))) fail('unsupported');
  const normalized = normalizeFilters(searchType, input.filters);
  if (!input.expected_profile_url || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 2500 || !queryFilters(normalized).length && !input.keywords) fail('invalid_input');
  if (input.max_pages !== undefined && (!Number.isInteger(input.max_pages) || input.max_pages < 1 || input.max_pages > 10)) fail('invalid_input');
  if (input.keywords !== undefined && (typeof input.keywords !== 'string' || !input.keywords.length || input.keywords.length > 1000 || /[\u0000-\u001f\u007f]/.test(input.keywords) || input.keywords.trim() !== input.keywords)) fail('unsupported_keyword_syntax');
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, { ...options, searchOnly: true });
  if (['bridge_unreachable', 'bridge_failure', 'bridge_timeout', 'profile_not_connected'].includes(check.salesnav_access?.reason)) fail(check.salesnav_access.reason);
  options.onStage?.('search_setup');
  const access = searchType === 'account' ? 'account_search_access' : 'lead_search_access';
  if (searchType === 'lead' && input.keywords && normalized.length === 0 && transport.readLeadSearchApi && transport.readSearchFrame) {
    options.onStage?.('collection');
    return keywordLeadRead(input, check, transport, { profile: input.profile, session: `salesnav-keyword-${randomUUID()}` }, options);
  }
  const targetNeedsRevalidation = check[access].status === 'unknown' && ['page_not_ready', 'window_not_visible', 'target_validation_required'].includes(check[access].reason);
  if (check.identity_match !== true || check.salesnav_access.status !== 'available' || check[access].status !== 'available' && !targetNeedsRevalidation || check.account_binding.status !== 'observed') {
    const diagnostics = { stage: 'account_check', identity_match: check.identity_match, binding_status: check.account_binding.status, access: Object.fromEntries(['salesnav_access','account_search_access','lead_search_access'].map(k => [k, check[k]])), last_marker: check.evidence?.at(-1)?.marker ?? null };
    throw Object.assign(new Error('Account precheck failed: ' + JSON.stringify(diagnostics)), { code: 'account_unconfirmed', details: diagnostics });
  }
  const context = { profile: input.profile, session: `salesnav-search-${randomUUID()}` };
  let lastObserved;
  const postconditionFailure = field => {
    throw searchPostconditionError(lastObserved, { stage: field === 'keywords' ? 'verify_keywords' : 'verify_filter', field, requested: field === 'keywords' ? input.keywords : input.filters[field] });
  };
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  async function state(initial = false) {
    const data = await transport.state(context);
    // OpenCLI truncates long input values in snapshots. Read the actual DOM
    // value instead of accepting a prefix or weakening query verification.
    if (input.keywords && data.snapshot.split('\n').some(line => line.includes('<input id=global-typeahead-search-input ') && line.endsWith('… />'))) {
      data.keyword_input = await transport.readKeywords(context);
    }
    lastObserved = data; const page = inspectPage(data, access);
    stopOnAccessFailure(page);
    if (page.identity && page.identity !== check.observed_identity || !initial && !page.identity) fail('identity_mismatch');
    return data;
  }
  async function poll(checker, initial = false) {
    for (let i = 0; i < 8; i++) { const data = await state(initial); const result = checker(data); if (result) return result; if (i < 7) await sleep(1000); }
    return null;
  }
  await transport.open(`https://www.linkedin.com/sales/search/${searchType === 'account' ? 'company' : 'people'}?viewAllFilters=true`, context);
  // Navigation may reuse an inactive owned tab. Select that exact page before
  // waiting for filters; collection-time activation is too late for UI setup.
  if (transport.activateSearchPage) await transport.activateSearchPage(context);
  const ready = await poll(data => inspectPage(data, access).status === 'available' && data, true);
  if (!ready) {
    if (transport.readPageVisibility) { const visibility=await transport.readPageVisibility(context); if(visibility.url===lastObserved.url && visibility.visibility==='hidden') fail('window_not_visible'); }
    fail('page_not_ready');
  }
  if (new URL(ready.url).searchParams.has('query') || /Remove .+ filter:/.test(ready.snapshot)) fail('dirty_query_state');
  const applied = [];
  if (input.keywords) {
    const fill = await transport.fillKeywords(input.keywords, context);
    if (!fill.verified || fill.actual !== input.keywords || !(await transport.submitKeywords(input.keywords, context)).dispatched) fail('keyword_input_failed');
    if (!await poll(data => searchConditions(data, searchType, [], input.keywords))) postconditionFailure('keywords');
  }
  for (const field of normalized) {
    if (field.input !== undefined) {
      let data=await state();
      if (field.schema.source==='boolean') {
        const before=await transport.readTypedFilter(field.schema,field.input,context);
        if (typeof before.checked!=='boolean') fail('page_changed');
        if (!before.verified) await transport.submitTypedFilter(field.schema,context);
        if (!(await transport.readTypedFilter(field.schema,field.input,context)).verified) fail('filter_input_failed');
      } else {
        if (!data.snapshot.includes(`Collapse ${field.schema.label} filter`)) {
          await expandFilter(transport,field.schema.label,context);
          if (!await poll(data=>data.snapshot.includes(`Collapse ${field.schema.label} filter`))) fail('page_not_ready');
        }
        if (!(await transport.fillTypedFilter(field.schema,field.input,context)).verified) fail('filter_input_failed');
        if (field.schema.source==='range') await transport.submitTypedFilter(field.schema,context);
      }
      applied.push(field);
      if (!await poll(data=>searchConditions(data,searchType,applied,input.keywords))) postconditionFailure(field.key);
      continue;
    }
    const current = { ...field, values: [] }; applied.push(current);
    for (const value of field.values) {
      let data = await state();
      if (!data.snapshot.includes(`Collapse ${field.schema.label} filter`)) {
        await expandFilter(transport, field.schema.label, context);
        data = await poll(data => data.snapshot.includes(`Collapse ${field.schema.label} filter`) && data);
        if (!data) fail('page_not_ready');
      }
      let candidate = parseFieldOptions(data.snapshot, field.schema).find(option => option.label === value.label);
      if (!candidate && field.schema.placeholder) {
        // Defaults cannot become a caller's dynamic query until input changes.
        // Wait for the input surface, then fill; poll only for its response.
        if (!data.snapshot.split('\n').some(line => line.includes('<input ') && line.includes(`placeholder=${field.schema.placeholder} `))) {
          data = await poll(data => data.snapshot.split('\n').some(line => line.includes('<input ') && line.includes(`placeholder=${field.schema.placeholder} `)) && data);
          if (!data) fail('page_not_ready');
        }
        const lookupQuery = value.lookup_query ?? value.label;
        const fill = await transport.fillFilter(field.schema.placeholder, lookupQuery, context);
        if (!fill.verified || fill.actual !== lookupQuery || !(await transport.refreshFilter(field.schema.placeholder, lookupQuery, context)).dispatched) fail('keyword_input_failed');
        candidate = await poll(data => parseFieldOptions(data.snapshot, field.schema).find(option => option.label === value.label));
      } else if (!candidate) {
        candidate = await poll(data => parseFieldOptions(data.snapshot, field.schema).find(option => option.label === value.label));
      }
      if (!candidate || candidate.occurrences !== 1 || !candidate.modes.includes(value.mode)) fail('invalid_option');
      // Scroll only the exact field/name/mode candidate, then resolve again:
      // scrolling may redraw the suggestion list and invalidate its old target.
      async function prepareOption(optionLabel) {
        if (!transport.prepareFilterOption) return;
        const prepared = await transport.prepareFilterOption(field.schema.ui, optionLabel, value.mode, context);
        if (!prepared.resolved) fail(prepared.reason === 'page_blocked' ? 'page_blocked' : prepared.reason === 'window_not_visible' ? 'window_not_visible' : 'invalid_option');
      }
      await prepareOption(candidate.option_label);
      let selector;
      if (transport.resolveFilterOption) {
        const target = await transport.resolveFilterOption(field.schema.ui, candidate.option_label, value.mode, context);
        if (target.reason === 'page_blocked') fail('page_blocked');
        if (target.resolved !== true || typeof target.selector !== 'string') fail('invalid_option');
        selector = target.selector;
      }
      try {
        try { await transport.selectFilter(field.schema.ui, candidate.option_label, value.mode, context, selector); }
        catch (error) {
          // An exact selector-not-found is undispatched. Reobserve the current
          // field once: async counts/redraws can invalidate a resolved selector.
          // Never replay timeouts or other potentially dispatched actions.
          if (error.details?.upstream_code !== 'selector_not_found' || !transport.resolveFilterOption) throw error;
          const fresh = await state();
          const option = parseFieldOptions(fresh.snapshot, field.schema).find(item => item.label === value.label);
          if (!option || option.occurrences !== 1 || !option.modes.includes(value.mode)) throw error;
          await prepareOption(option.option_label);
          const target = await transport.resolveFilterOption(field.schema.ui, option.option_label, value.mode, context);
          if (target.reason === 'page_blocked') fail('page_blocked');
          if (!target.resolved || typeof target.selector !== 'string') throw error;
          await transport.selectFilter(field.schema.ui, option.option_label, value.mode, context, target.selector);
        }
      } catch (error) { error.details = { ...error.details, stage: 'select_filter', field: field.key, requested: value.label }; throw error; }
      current.values.push(value);
      if (!await poll(data => searchConditions(data, searchType, applied, input.keywords))) postconditionFailure(field.key);
    }
  }
  // Small samples must not bypass readiness checks and accept stale cards.
  if (typeof transport.readSearchFrame === 'function' || input.limit > 5 || input.max_pages !== undefined) {
    const query = new URL(lastObserved.url).searchParams.get('query');
    const binding = check.account_binding.profile_url;
    options.onStage?.('collection');
    return collectPages({ operation: `${searchType}-search`, search_type: searchType, profile: input.profile, expected_identity: input.expected_identity, observed_identity: check.observed_identity, expected_profile_url: input.expected_profile_url, account_binding: check.account_binding, binding, query, query_fingerprint: queryFingerprint(query, searchType, binding), keywords: input.keywords, filters: input.filters, page: 1, results: [], covered: {} }, transport, context, { ...options, limit: input.limit, max_pages: input.max_pages ?? 1 });
  }
  const result = await poll(data => parseSearchResults(data, searchType, normalized, input.keywords, input.limit));
  if (!result) fail('search_not_confirmed');
  return { operation: `${searchType}-search`, profile: input.profile, account_binding: check.account_binding, ...result };
}
