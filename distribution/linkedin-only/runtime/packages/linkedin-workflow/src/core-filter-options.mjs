import { expandFilter } from './filter-selection.mjs';
import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage } from './account-check.mjs';
import { resolveField, parseFieldOptions, inputHasValue, candidatesMatchQuery } from './fields.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export async function coreFilterOptions(input, transport, options = {}) {
  const resolved = resolveField(input.search_type, input.field);
  if (!resolved) fail('unsupported');
  const [, schema] = resolved;
  if(schema.source==='restricted') fail('feature_restricted');
  if (!input.expected_profile_url || Object.keys(input).some(key => !['profile', 'expected_identity', 'expected_profile_url', 'search_type', 'field', 'query'].includes(key))) fail('invalid_input');
  const dynamic = input.query !== undefined;
  if (schema.source === 'entity' && !dynamic || dynamic && (!schema.placeholder || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200 || /[\r\n]/.test(input.query))) fail('invalid_input');
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, options);
  const access = input.search_type === 'account' ? 'account_search_access' : 'lead_search_access';
  if (check.identity_match !== true || check[access].status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-options-${randomUUID()}` };
  const source = `https://www.linkedin.com/sales/search/${input.search_type === 'account' ? 'company' : 'people'}?viewAllFilters=true`;
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  async function poll(checker, initial = false) {
    for (let i = 0; i < 8; i++) {
      const data = await transport.state(context); const page = inspectPage(data, access);
      if (page.identity && page.identity !== check.observed_identity || !initial && !page.identity) fail('identity_mismatch');
      if (page.status === 'available') { const result = checker(data); if (result) return result; }
      if (i < 7) await sleep(1000);
    }
    return null;
  }
  await transport.open(source, context);
  if (!await poll(data => data, true)) fail('page_not_ready');
  if(schema.source==='boolean') return {operation:'filter-options',profile:input.profile,search_type:input.search_type,field:schema.label,source,options:[true,false],completeness:'boolean_domain',account_binding:check.account_binding};
  await expandFilter(transport, schema.label, context);
  if(['range','text'].includes(schema.source)) {
    const controls=await transport.readFieldControls(schema,context);
    if(!controls?.length) fail('page_changed');
    return {operation:'filter-options',profile:input.profile,search_type:input.search_type,field:schema.label,source,type:schema.source,controls,completeness:'visible_controls_only',account_binding:check.account_binding};
  }
  let previous = '';
  if (dynamic) {
    const before = await transport.state(context);
    if (inspectPage(before, access).identity !== check.observed_identity) fail('identity_mismatch');
    previous = JSON.stringify(parseFieldOptions(before.snapshot, schema));
    const filled = await transport.fillFilter(schema.placeholder, input.query, context);
    if (!filled.verified || filled.actual !== input.query || !(await transport.refreshFilter(schema.placeholder, input.query, context)).dispatched) fail('keyword_input_failed');
  }
  const values = await poll(data => {
    const values = parseFieldOptions(data.snapshot, schema);
    if (!values.length) return null;
    if (dynamic && (!inputHasValue(data.snapshot, schema.placeholder, input.query) || JSON.stringify(values) === previous || !candidatesMatchQuery(values, input.query))) return null;
    return values;
  });
  if (!values) fail('options_not_ready');
  return { operation: 'filter-options', profile: input.profile, search_type: input.search_type, field: schema.label, ...(dynamic ? { query: input.query } : {}), account_binding: check.account_binding, source, options: values, completeness: 'visible_options_only', search_execution: 'not_tested', checked_at: new Date().toISOString() };
}
