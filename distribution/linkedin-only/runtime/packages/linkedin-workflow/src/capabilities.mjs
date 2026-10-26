import { FIELD_SCHEMAS } from './fields.mjs';
import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage } from './account-check.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const implemented = {
  account: {
    Industry: { live_verified: true },
    'Headquarters location': { live_verified: true },
    'Company headcount': { type: 'enum', option_source: 'static_ui', options: 'implemented', search: 'single_include', live_verified: true },
    'Number of followers': { type: 'enum', option_source: 'static_ui', options: 'implemented', search: 'unsupported', live_verified: false },
    Fortune: { type: 'enum', option_source: 'static_ui', options: 'implemented', search: 'unsupported', live_verified: false },
    'Recent activities': { type: 'enum', option_source: 'static_ui', options: 'implemented', search: 'unsupported', live_verified: false },
    'Job opportunities': { type: 'enum', option_source: 'static_ui', options: 'implemented', search: 'unsupported', live_verified: false },
    Connection: { type: 'enum', option_source: 'static_ui', options: 'implemented', search: 'unsupported', live_verified: false },
  },
  lead: { 'Current company': { live_verified: true }, 'Current job title': { live_verified: true, verified_modes: ['include', 'exclude'] }, Function: { live_verified: true, verified_modes: ['include', 'exclude'] }, 'Seniority level': { live_verified: true, verified_modes: ['include', 'exclude'] }, Geography: { type: 'entity', option_source: 'dynamic_ui', options: 'query_required', search: 'single_include', live_verified: true } },
};
export function discoverFields(snapshot, searchType) {
  const fields = [...new Set([...snapshot.matchAll(/(?:Expand|Collapse|Select|Deselect) ([^<\n]+?) filter/g)].map(match => match[1]))];
  for(const schema of Object.values(FIELD_SCHEMAS[searchType]??{})) if(schema.source==='restricted'&&snapshot.includes(`<span>${schema.label}</span>`)&&!fields.includes(schema.label))fields.push(schema.label);
  const adapted = Object.fromEntries(Object.values(FIELD_SCHEMAS[searchType] ?? {}).map(schema => [schema.label, { type: schema.source, option_source: schema.source === 'enum' ? 'static_ui' : 'dynamic_ui', options: schema.source === 'enum' ? 'implemented' : 'query_required', search: schema.source==='restricted'?'restricted':schema.source==='range'?'range':schema.source==='boolean'?'boolean':schema.source==='text'?'text':'explicit_values', modes: schema.modes, live_verified: implemented[searchType]?.[schema.label]?.live_verified ?? false, verified_modes: implemented[searchType]?.[schema.label]?.verified_modes ?? (implemented[searchType]?.[schema.label]?.live_verified ? ['include'] : []) }]));
  return fields.map(name => ({ name, visible: true, locked: 'unknown', ...(adapted[name] ?? implemented[searchType]?.[name] ?? { type: 'unknown', option_source: 'not_adapted', options: 'unsupported', search: 'unsupported', live_verified: false }) }));
}
export async function capabilities(input, transport, options = {}) {
  if (!input || !input.expected_profile_url || Object.keys(input).some(key => !['profile', 'expected_identity', 'expected_profile_url', 'search_type'].includes(key)) || !['account', 'lead'].includes(input.search_type)) fail('invalid_input');
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, options);
  const access = input.search_type === 'account' ? 'account_search_access' : 'lead_search_access';
  if (check.identity_match !== true || check[access].status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-capabilities-${randomUUID()}` };
  const url = `https://www.linkedin.com/sales/search/${input.search_type === 'account' ? 'company' : 'people'}?viewAllFilters=true`;
  await transport.open(url, context);
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  for (let i = 0; i < 8; i++) {
    const state = await transport.state(context); const page = inspectPage(state, access);
    if (page.identity && page.identity !== check.observed_identity) fail('identity_mismatch');
    if (page.status === 'available') return { operation: 'capabilities', profile: input.profile, search_type: input.search_type, account_binding: check.account_binding, source: url, fields: discoverFields(state.snapshot, input.search_type), restricted_features: page.restricted_features, keywords: { type: 'text', syntax: 'verbatim_text', max_length: 1000, boolean: 'platform_interpreted' }, completeness: 'visible_fields_only', checked_at: new Date().toISOString() };
    if (i < 7) await sleep(1000);
  }
  fail('page_not_ready');
}
