import { randomUUID } from 'node:crypto';
import { accountCheck, inspectPage, stopOnAccessFailure } from './account-check.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function normalizeCompany(input) {
  if (typeof input !== 'string') fail('invalid_input');
  if (/^\d{1,20}$/.test(input)) return input;
  let url;
  try { url = new URL(input); } catch { fail('invalid_input'); }
  if (url.origin !== 'https://www.linkedin.com' || !/^\/sales\/company\/\d{1,20}\/?$/.test(url.pathname) || url.search || url.hash) fail('invalid_input');
  return url.pathname.split('/')[3];
}
export function accountDetail(raw, id) {
  if (raw.url !== `https://www.linkedin.com/sales/company/${id}`) fail('page_changed');
  if (raw.blocking_dialog) fail('page_blocked');
  if (!raw.ready || !raw.fields?.name || raw.expandable) return null;
  const fields = Object.fromEntries(['name', 'industry', 'location', 'employee_count_text', 'revenue_text', 'website', 'about'].map(key => [key, {
    value: raw.fields[key] || null,
    status: raw.fields[key] ? 'observed' : 'not_observed',
    source: raw.url,
    section: key === 'about' ? 'about' : 'account_header',
  }]));
  return { id, name: raw.fields.name, url: raw.url, fields, completeness: 'defined_sections_only', missing_fields: Object.keys(fields).filter(key => fields[key].status !== 'observed') };
}
export async function accountRead(input, transport, options = {}) {
  if (!input || Object.keys(input).some(key => !['profile', 'expected_identity', 'expected_profile_url', 'company'].includes(key)) || !input.expected_profile_url) fail('invalid_input');
  const id = normalizeCompany(input.company);
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, options);
  if (check.identity_match !== true || check.account_search_access.status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-account-read-${randomUUID()}` };
  const sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  await transport.open(`https://www.linkedin.com/sales/company/${id}`, context);
  let expanded = false;
  for (let i = 0; i < 8; i++) {
    const page = await transport.state(context);
    const observation = inspectPage(page, 'salesnav_access');
    stopOnAccessFailure(observation);
    const identity = observation.identity;
    if (identity && identity !== check.observed_identity) fail('identity_mismatch');
    if (identity) {
      const raw = await transport.readCompany(context);
      if (raw.blocking_dialog) fail('page_blocked');
      if (raw.expandable && !expanded) {
        await transport.expandCompanyAbout(context); expanded = true;
      } else {
        const result = accountDetail(raw, id);
        if (result) {
          const after = await transport.state(context);
          const afterPage = inspectPage(after, 'salesnav_access');
          stopOnAccessFailure(afterPage);
          if (afterPage.identity !== check.observed_identity) fail('identity_mismatch');
          if (new URL(after.url).pathname !== `/sales/company/${id}`) fail('page_changed');
          return { operation: 'account-read', profile: input.profile, account_binding: check.account_binding, checked_at: new Date().toISOString(), results: [result], returned_count: 1, completeness: 'defined_sections_only' };
        }
      }
    }
    if (i < 7) await sleep(1000);
  }
  fail('page_not_ready');
}
