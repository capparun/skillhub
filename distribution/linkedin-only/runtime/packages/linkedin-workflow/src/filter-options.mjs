import { expandFilter } from './filter-selection.mjs';
import { coreFilterOptions } from './core-filter-options.mjs';
import { resolveField } from './fields.mjs';
import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage } from './account-check.mjs';
const FIELDS = ['Company headcount', 'Number of followers', 'Fortune', 'Recent activities', 'Job opportunities', 'Connection'];
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
export function parseOptions(snapshot, field) {
  if (!FIELDS.includes(field) && field !== 'Geography') fail('unsupported');
  const start = snapshot.indexOf(`Collapse ${field} filter`);
  if (start < 0) return [];
  const section = snapshot.slice(start).split('<fieldset')[0];
  return [...section.split('\n').filter(line => line.includes('role=option')).join('\n').matchAll(/aria-label=Include “([^”]+)” in ([^\n]+?) filter/g)]
    .filter(m => m[2] === (field === 'Geography' ? 'Region' : field))
    .map(m => ({ label: m[1].replace(/ \([\d,.KM+]+\)$/, ''), value: m[1].replace(/ \([\d,.KM+]+\)$/, ''), option_label: m[1], value_type: 'ui_label', mode: 'include', platform_id: null }));
}
export async function filterOptions(input, transport, options = {}) {
  if (input && resolveField(input.search_type, input.field) && !['Geography', 'Company headcount'].includes(input.field)) return coreFilterOptions(input, transport, options);
  const dynamic = input?.search_type === 'lead' && input.field === 'Geography';
  if (!input || (!dynamic && (input.search_type !== 'account' || !FIELDS.includes(input.field)))) fail('unsupported');
  if (dynamic && (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 100)) fail('invalid_input');
  if (!dynamic && input.query !== undefined) fail('unsupported');
  if (Object.keys(input).some(k => !['profile', 'expected_identity', 'expected_profile_url', 'search_type', 'field', 'query'].includes(k))) fail('invalid_input');
  const { profile, expected_identity, expected_profile_url } = input;
  const checkInput = { profile, expected_identity, ...(expected_profile_url ? { expected_profile_url } : {}) };
  const access = dynamic ? 'lead_search_access' : 'account_search_access';
  const check = await accountCheck(checkInput, transport, options);
  if (check.identity_match !== true || check[access].status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile, session: `salesnav-options-${randomUUID()}` };
  const url = `https://www.linkedin.com/sales/search/${dynamic ? 'people' : 'company'}?viewAllFilters=true`;
  await transport.open(url, context);
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  let state;
  for (let i = 0; i < 8; i++) {
    state = await transport.state(context);
    const page = inspectPage(state, access);
    if (page.identity && page.identity !== check.observed_identity) fail('identity_mismatch');
    if (page.status === 'available') break;
    if (i < 7) await sleep(1000);
  }
  if (inspectPage(state, access).status !== 'available') fail('page_not_ready');
  await expandFilter(transport, input.field, context);
  let previous = '';
  if (dynamic) {
    state = await transport.state(context);
    if (inspectPage(state, access).identity !== check.observed_identity) fail('identity_mismatch');
    previous = JSON.stringify(parseOptions(state.snapshot, input.field));
    const filled = await transport.fillLocation(input.query, context);
    if (!filled.verified || filled.actual !== input.query) fail('keyword_input_failed');
    if (!(await transport.refreshLocation(input.query, context)).dispatched) fail('keyword_input_failed');
  }
  for (let i = 0; i < 8; i++) {
    state = await transport.state(context);
    if (inspectPage(state, access).identity !== check.observed_identity) fail('identity_mismatch');
    if (inspectPage(state, access).status !== 'available') fail('page_not_ready');
    const values = parseOptions(state.snapshot, input.field);
    const inputConfirmed = !dynamic || state.snapshot.split('\n').some(line => line.includes('<input placeholder=Add locations ') && line.endsWith(`value=${input.query} />`));
    if (values.length && inputConfirmed && (!dynamic || (JSON.stringify(values) !== previous && values.every(value => value.label.toLocaleLowerCase().includes(input.query.trim().toLocaleLowerCase()))))) return { operation: 'filter-options', field: input.field, search_type: input.search_type, ...(dynamic ? { query: input.query } : {}), profile,
      account_binding: check.account_binding, source: url, checked_at: new Date().toISOString(), options: values,
      completeness: 'visible_options_only', search_execution: 'not_tested' };
    if (i < 7) await sleep(1000);
  }
  fail('options_not_ready');
}
