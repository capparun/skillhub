import { searchPostconditionError } from './search-diagnostics.mjs';
import { expandFilter } from './filter-selection.mjs';
import { search } from './search.mjs';
import { matchesQuery } from './query.mjs';
import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage } from './account-check.mjs';
import { parseOptions } from './filter-options.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const URL_BASE = 'https://www.linkedin.com/sales/search/company?viewAllFilters=true';
export function parseAccountResults(data, headcount, limit, keywords) {
  const url = new URL(data.url);
  if (url.origin !== 'https://www.linkedin.com' || url.pathname !== '/sales/search/company') fail('page_changed');
  // Verify URL and UI independently. Only one observed query type is implemented.
  const query = url.searchParams.get('query') ?? '';
  if (!matchesQuery(query, { keywords, headcount })) return null;
  if (headcount && !data.snapshot.includes(`Remove Company headcount filter: “${headcount}”`)) return null;
  const inputLine = data.snapshot.split('\n').find(line => line.includes('<input id=global-typeahead-search-input '));
  const displayedKeyword = inputLine?.match(/ value=(.*?) \/>$/)?.[1];
  if (keywords && displayedKeyword !== keywords) return null;
  const results = data.snapshot.split('id=search-results-container')[1];
  if (!results || !results.includes('<h2>Search Results</h2>')) return null;
  const companies = [];
  for (const m of results.matchAll(/<a [^\n]*href=\/sales\/company\/(\d+)(?:\?[^>\n]*)?>([^<\n]+)<\/a>/g)) {
    if (!companies.some(c => c.id === m[1])) companies.push({ id: m[1], name: m[2], url: `https://www.linkedin.com/sales/company/${m[1]}` });
    if (companies.length >= limit) break;
  }
  if (!companies.length) return null; // No unverified empty-result detector.
  return { requested_filters: { ...(headcount ? { company_headcount: [headcount] } : {}), ...(keywords ? { keywords } : {}) }, applied_filters: { ...(headcount ? { company_headcount: [headcount] } : {}), ...(keywords ? { keywords } : {}) },
    evidence: { page: `${url.origin}${url.pathname}`, query, selected_label: headcount },
    results: companies, returned_count: companies.length, result_scope: 'visible_cards_first_page',
    completeness: 'partial', truncated: true, pagination: 'not_implemented', checked_at: new Date().toISOString() };
}
export async function accountSearch(input, transport, options = {}) {
  if (input?.filters !== undefined) return search(input, 'account', transport, options);
  const allowed = ['profile', 'expected_identity', 'expected_profile_url', 'company_headcount', 'keywords', 'limit'];
  if (!input || Object.keys(input).some(k => !allowed.includes(k))) fail('unsupported');
  if (!input.expected_profile_url || (input.company_headcount !== undefined && typeof input.company_headcount !== 'string') || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 5) fail('invalid_input');
  if (!input.company_headcount && !input.keywords) fail('invalid_input');
  if (input.keywords !== undefined && (typeof input.keywords !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 -]{0,99}$/.test(input.keywords) || input.keywords.trim() !== input.keywords)) fail('unsupported_keyword_syntax');
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, options);
  if (check.identity_match !== true || check.account_search_access.status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-search-${randomUUID()}` };
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  async function state() {
    const data = await transport.state(context);
    const identity = inspectPage(data, 'account_search_access').identity;
    if (identity !== check.observed_identity) fail('identity_mismatch');
    return data;
  }
  await transport.open(URL_BASE, context);
  let data;
  for (let i = 0; i < 3; i++) {
    data = await transport.state(context);
    if (inspectPage(data, 'account_search_access').status === 'available') break;
    if (i < 2) await sleep(1000);
  }
  if (inspectPage(data, 'account_search_access').identity !== check.observed_identity) fail('identity_mismatch');
  if (inspectPage(data, 'account_search_access').status !== 'available') fail('page_not_ready');
  if (new URL(data.url).searchParams.has('query') || /Remove .+ filter:/.test(data.snapshot)) fail('dirty_query_state');
  if (input.keywords) {
    const filled = await transport.fillKeywords(input.keywords, context);
    if (!filled.verified || filled.actual !== input.keywords) fail('keyword_input_failed');
    if (!(await transport.submitKeywords(input.keywords, context)).dispatched) fail('keyword_input_failed');
    let confirmed = false;
    for (let i = 0; i < 5; i++) {
      data = await state();
      if (matchesQuery(new URL(data.url).searchParams.get('query'), { keywords: input.keywords })) { confirmed = true; break; }
      if (i < 4) await sleep(1000);
    }
    if (!confirmed) throw searchPostconditionError(data, { stage: 'verify_keywords', field: 'keywords', requested: input.keywords });
  }
  if (input.company_headcount) {
    await expandFilter(transport, 'Company headcount', context);
    let values = [];
    for (let i = 0; i < 3; i++) {
      data = await state(); values = parseOptions(data.snapshot, 'Company headcount');
      if (values.length) break;
      if (i < 2) await sleep(1000);
    }
    const option = values.find(v => v.label === input.company_headcount);
    if (!option) fail('invalid_option');
    await transport.selectHeadcount(option.option_label, context);
  }
  for (let i = 0; i < 5; i++) {
    data = await state();
    const result = parseAccountResults(data, input.company_headcount, input.limit, input.keywords);
    if (result) return { operation: 'account-search', profile: input.profile, account_binding: check.account_binding, ...result };
    if (i < 4) await sleep(1000);
  }
  throw searchPostconditionError(data, { stage: 'verify_search', field: 'query', requested: { keywords: input.keywords, company_headcount: input.company_headcount } });
}
