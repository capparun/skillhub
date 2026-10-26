import { searchPostconditionError } from './search-diagnostics.mjs';
import { expandFilter } from './filter-selection.mjs';
import { search } from './search.mjs';
import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage } from './account-check.mjs';
import { parseOptions } from './filter-options.mjs';
import { matchesFilters } from './query.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const BASE = 'https://www.linkedin.com/sales/search/people?viewAllFilters=true';
const filtersFor = geography => geography ? [{ type: 'REGION', values: [{ text: geography, selectionType: 'INCLUDED' }] }] : [];
export function parseLeadResults(data, { geography, keywords, limit }) {
  const url = new URL(data.url);
  if (url.origin !== 'https://www.linkedin.com' || url.pathname !== '/sales/search/people') fail('page_changed');
  if (!matchesFilters(url.searchParams.get('query'), { keywords, filters: filtersFor(geography) })) return null;
  if (geography && !data.snapshot.includes(`Remove Region filter: “${geography}”`)) return null;
  if (keywords && !data.snapshot.split('\n').some(line => line.includes('<input id=global-typeahead-search-input ') && line.endsWith(`value=${keywords} />`))) return null;
  const section = data.snapshot.split('id=search-results-container')[1];
  if (!section || !section.includes('<h2>Search Results</h2>')) return null;
  const results = [];
  // Name anchors have an immediate span child; image anchors are excluded.
  for (const m of section.matchAll(/<a [^\n]*href=(\/sales\/lead\/([A-Za-z0-9_-]+),[A-Za-z0-9_,%-]+)(?:\?[^\s]*)? \/>\n\s+<span>([^<\n]+)<\/span>/g)) {
    if (!results.some(row => row.id === m[2])) results.push({ id: m[2], name: m[3], url: `https://www.linkedin.com${m[1]}` });
    if (results.length >= limit) break;
  }
  if (!results.length) return null;
  const conditions = { ...(geography ? { geography: [geography] } : {}), ...(keywords ? { keywords } : {}) };
  return { requested_filters: conditions, applied_filters: conditions, results, returned_count: results.length, evidence: { page: `${url.origin}${url.pathname}`, query: url.searchParams.get('query') }, completeness: 'partial', truncated: true, pagination: 'not_implemented', result_scope: 'visible_cards_first_page', checked_at: new Date().toISOString() };
}
export async function leadSearch(input, transport, options = {}) {
  if (input?.filters !== undefined) return search(input, 'lead', transport, options);
  if (!input || Object.keys(input).some(k => !['profile', 'expected_identity', 'expected_profile_url', 'geography', 'keywords', 'limit'].includes(k))) fail('unsupported');
  if (!input.expected_profile_url || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 5 || (!input.geography && !input.keywords)) fail('invalid_input');
  if (input.geography !== undefined && (typeof input.geography !== 'string' || !input.geography.trim() || input.geography.length > 150 || /[\n\r“”]/.test(input.geography))) fail('invalid_input');
  if (input.keywords !== undefined && (typeof input.keywords !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 -]{0,99}$/.test(input.keywords) || input.keywords.trim() !== input.keywords)) fail('unsupported_keyword_syntax');
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, options);
  if (['bridge_unreachable', 'bridge_failure', 'bridge_timeout', 'profile_not_connected'].includes(check.salesnav_access?.reason)) fail(check.salesnav_access.reason);
  if (check.identity_match !== true || check.lead_search_access.status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-leads-${randomUUID()}` };
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  let lastObserved;
  async function state() {
    const data = await transport.state(context);
    lastObserved = data;
    const page = inspectPage(data, 'lead_search_access');
    if (page.identity !== check.observed_identity) fail('identity_mismatch');
    return data;
  }
  async function poll(checker) {
    for (let i = 0; i < 8; i++) {
      const data = await state(); const value = checker(data);
      if (value) return value;
      if (i < 7) await sleep(1000);
    }
    return null;
  }
  await transport.open(BASE, context);
  // Loading can temporarily omit the header; initial readiness uses bounded polling.
  let ready;
  for (let i = 0; i < 8; i++) {
    const data = await transport.state(context); const page = inspectPage(data, 'lead_search_access');
    if (page.identity && page.identity !== check.observed_identity) fail('identity_mismatch');
    if (page.status === 'available') { ready = data; break; }
    if (i < 7) await sleep(1000);
  }
  if (!ready) fail('page_not_ready');
  if (new URL(ready.url).searchParams.has('query') || /Remove .+ filter:/.test(ready.snapshot)) fail('dirty_query_state');
  if (input.keywords) {
    const filled = await transport.fillKeywords(input.keywords, context);
    if (!filled.verified || filled.actual !== input.keywords || !(await transport.submitKeywords(input.keywords, context)).dispatched) fail('keyword_input_failed');
    if (!await poll(data => matchesFilters(new URL(data.url).searchParams.get('query'), { keywords: input.keywords }))) throw searchPostconditionError(lastObserved, { stage: 'verify_keywords', field: 'keywords', requested: input.keywords });
  }
  if (input.geography) {
    await expandFilter(transport, 'Geography', context);
    const filled = await transport.fillLocation(input.geography, context);
    if (!filled.verified || filled.actual !== input.geography || !(await transport.refreshLocation(input.geography, context)).dispatched) fail('keyword_input_failed');
    const candidate = await poll(data => parseOptions(data.snapshot, 'Geography').find(value => value.label === input.geography));
    if (!candidate) fail('invalid_option');
    await transport.selectGeography(candidate.option_label, context);
  }
  const result = await poll(data => parseLeadResults(data, input));
  if (!result) throw searchPostconditionError(lastObserved, { stage: 'verify_search', field: 'query', requested: { keywords: input.keywords, geography: input.geography } });
  return { operation: 'lead-search', profile: input.profile, account_binding: check.account_binding, ...result };
}
