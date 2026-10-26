import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage, stopOnAccessFailure } from './account-check.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function normalizeLead(value) {
  if (typeof value !== 'string') fail('invalid_input');
  const route = /^[A-Za-z0-9_-]+,(?:NAME_SEARCH|OUT_OF_NETWORK),[A-Za-z0-9_-]+$/;
  if (route.test(value)) return value;
  let url;
  try { url = new URL(value); } catch { fail('invalid_input'); }
  const token = url.pathname.slice('/sales/lead/'.length);
  if (url.origin !== 'https://www.linkedin.com' || !url.pathname.startsWith('/sales/lead/') || !route.test(token) || url.search || url.hash) fail('invalid_input');
  return token;
}
export function leadDetail(raw, token, { includeAbout = true } = {}) {
  if (raw.url !== `https://www.linkedin.com/sales/lead/${token}`) fail('page_changed');
  if (raw.blocking_dialog) fail('page_blocked');
  if (!raw.ready || !raw.fields?.name || (includeAbout && raw.expandable)) return null;
  const fields = Object.fromEntries(['name', 'headline', 'location', 'about'].map(key => [key, { value: raw.fields[key] || null, status: raw.fields[key] ? 'observed' : 'not_observed', source: raw.url, section: key === 'about' ? 'about' : 'profile_card' }]));
  if (!includeAbout) fields.about = {value:null,status:'not_requested',source:raw.url,section:'about'};
  fields.current_roles = { value: raw.fields.current_roles ?? [], status: raw.fields.current_roles?.length ? 'observed' : 'not_observed', source: raw.url, section: 'current_roles', completeness: raw.roles_more ? 'partial' : 'displayed_section', more_available: raw.roles_more === true };
  return { id: token.split(',')[0], name: raw.fields.name, url: raw.url, fields, completeness: 'defined_sections_only', missing_fields: Object.keys(fields).filter(key => fields[key].status !== 'observed') };
}
export async function leadRead(input, transport, options = {}) {
  if (!input || Object.keys(input).some(key => !['profile', 'expected_identity', 'expected_profile_url', 'lead', 'include_about'].includes(key)) || !input.expected_profile_url) fail('invalid_input');
  if (input.include_about !== undefined && typeof input.include_about !== 'boolean') fail('invalid_input');
  const token = normalizeLead(input.lead);
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, options);
  if (check.identity_match !== true || check.lead_search_access.status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-lead-read-${randomUUID()}` };
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  await transport.open(`https://www.linkedin.com/sales/lead/${token}`, context);
  let expanded = false;
  for (let i = 0; i < 8; i++) {
    const page = await transport.state(context);
    const observation = inspectPage(page, 'salesnav_access');
    stopOnAccessFailure(observation);
    const identity = observation.identity;
    if (identity && identity !== check.observed_identity) fail('identity_mismatch');
    if (identity) {
      const raw = await transport.readLead(context);
      if (raw.blocking_dialog) fail('page_blocked');
      if (input.include_about !== false && raw.expandable && !expanded) { await transport.expandLeadAbout(context); expanded = true; }
      else {
        const result = leadDetail(raw, token, {includeAbout:input.include_about !== false});
        if (result) {
          const after = await transport.state(context);
          const afterPage = inspectPage(after, 'salesnav_access');
          stopOnAccessFailure(afterPage);
          if (afterPage.identity !== check.observed_identity) fail('identity_mismatch');
          if (new URL(after.url).pathname !== `/sales/lead/${token}`) fail('page_changed');
          return { operation: 'lead-read', profile: input.profile, account_binding: check.account_binding, checked_at: new Date().toISOString(), results: [result], returned_count: 1, completeness: 'defined_sections_only' };
        }
      }
    }
    if (i < 7) await sleep(1000);
  }
  fail('page_not_ready');
}
