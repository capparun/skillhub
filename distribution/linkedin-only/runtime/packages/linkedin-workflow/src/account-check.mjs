import { randomUUID } from 'node:crypto';
import { readOwnProfile, readSubscription } from './identity.mjs';

// In-memory lease only; never serialized or accepted as CLI input.
const batchIdentities = new WeakMap();
const PAGES = Object.freeze({
  salesnav_access: 'https://www.linkedin.com/sales/',
  account_search_access: 'https://www.linkedin.com/sales/search/company?viewAllFilters=true',
  lead_search_access: 'https://www.linkedin.com/sales/search/people?viewAllFilters=true',
});
const normalize = (s) => s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
const unknown = (reason) => ({ status: 'unknown', reason });
const unobservedNominalQuota = () => ({ status: 'unknown', kind: 'inmail', period: 'month', value: null, reason: 'not_observed' });
const FAILURE_REASONS = new Set(['bridge_unreachable', 'bridge_timeout', 'invalid_response', 'access_denied', 'rate_limited', 'window_not_visible', 'page_changed', 'budget_exhausted']);

// Parser is bound to the observed English OpenCLI DOM snapshot format.
// Header boundary prevents candidate names or page prose from becoming identity.
export function inspectPage(data, kind) {
  const snapshot = typeof data.snapshot === 'string' ? data.snapshot : '';
  let url;
  try { url = new URL(data.url); } catch { return { ...unknown('invalid_page'), identity: null }; }
  if (url.origin !== 'https://www.linkedin.com') return { ...unknown('unexpected_origin'), identity: null };
  const header = snapshot.split(/\n  (?:\[\d+\])?<main/)[0];
  const candidates = [...header.matchAll(/\[\d+\]<button id=hue-menu-trigger-[^\n]+\n\s+<span \/>\n\s+<span>([^<]+)<\/span>/g)].map(m => m[1]);
  const identity = candidates.length === 1 ? candidates[0] : null;
  const base = { identity, page: `${url.origin}${url.pathname}` };
  if (/\/checkpoint/.test(url.pathname)) return { ...base, ...unknown('verification_required') };
  if (/\/login|\/uas\/login/.test(url.pathname)) return { ...base, ...unknown('login_required') };
  if (!identity) return { ...base, ...unknown('identity_unconfirmed') };
  if (!url.pathname.startsWith('/sales/')) return { ...base, ...unknown('unexpected_redirect') };
  const main = snapshot.split(/\n  (?:\[\d+\])?<main/)[1] ?? '';
  const heading = main.match(/<h1(?: [^>]*)?>([^<]+)<\/h1>/)?.[1]?.trim();
  if (heading === "You don't have access to Sales Navigator") return { ...base, status: 'unavailable', reason: 'explicit_salesnav_access_denied' };
  if (kind === 'salesnav_access') {
    const ready = /href=\/sales\/search\/people\?viewAllFilters=true/.test(snapshot)
      && /href=\/sales\/search\/company\?viewAllFilters=true/.test(snapshot)
      && /title: .*Sales Navigator/.test(snapshot);
    return { ...base, ...(ready ? { status: 'available', reason: 'workspace_ready' } : unknown('page_not_ready')) };
  }
  const expected = kind === 'account_search_access' ? '/sales/search/company' : '/sales/search/people';
  if (url.pathname !== expected) return { ...base, ...unknown('unexpected_redirect') };
  const fields = kind === 'account_search_access'
    ? ['Company headcount', 'Headquarters location', 'Industry']
    : ['Current company', 'Geography', 'Current job title'];
  const ready = /placeholder=Search keywords/.test(snapshot)
    && fields.every(name => snapshot.includes(`Expand ${name} filter`) || snapshot.includes(`Collapse ${name} filter`));
  const restricted = [];
  const lines = snapshot.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('upgrade contract')) {
      const nearby = lines.slice(Math.max(0, i - 12), i + 3).join('\n');
      for (const name of ['People in CRM', 'Companies in CRM']) if (nearby.includes(name)) restricted.push(name);
    }
  }
  return { ...base, ...(ready ? { status: 'available', reason: 'search_controls_ready' } : unknown('page_not_ready')), restricted_features: [...new Set(restricted)] };
}

function connectionBinding(state, profile) {
  const matches = Array.isArray(state?.profiles) ? state.profiles.filter(p => p.contextId === profile && p.extensionConnected) : [];
  if (!Number.isSafeInteger(state?.pid) || state.pid < 1 || matches.length !== 1 || !Number.isFinite(matches[0].lastSeenAt) || matches[0].lastSeenAt <= 0) return unknown('connection_generation_unconfirmed');
  return { status: 'observed', daemon_pid: state.pid, connected_at: matches[0].lastSeenAt, extension_version: matches[0].extensionVersion ?? null, daemon_version: state.daemonVersion ?? null };
}
// Operational callers must stop on explicit access failures, even when stale
// page sections still contain readable entity fields.
export function stopOnAccessFailure(page) {
  const code = page.status === 'unavailable' ? 'access_denied' : ['login_required', 'verification_required'].includes(page.reason) ? page.reason : null;
  if (code) throw Object.assign(new Error(code), { code });
}
export async function accountCheck(input, transport, { attempts = 8, delay = 1000, sleep = ms => new Promise(r => setTimeout(r, ms)), contextSnapshot, captureConnection = false, batchIdentity, onFullCheck, searchOnly = false } = {}) {
  if (!input || typeof input.profile !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(input.profile)
    || typeof input.expected_identity !== 'string' || !input.expected_identity.trim() || input.expected_identity.length > 200) {
    throw new Error('profile and exact expected_identity are required');
  }
  if (Object.keys(input).some(k => !['profile', 'expected_identity', 'expected_profile_url'].includes(k))) throw new Error('Unknown input field');
  if (input.expected_profile_url !== undefined && !/^https:\/\/www\.linkedin\.com\/in\/[a-zA-Z0-9_%\-]+\/$/.test(input.expected_profile_url)) throw new Error('Invalid expected_profile_url');
  if (contextSnapshot) {
    const snapshot = contextSnapshot.report;
    if (Date.now() >= contextSnapshot.expires_at) throw Object.assign(new Error('context_expired'), { code: 'context_expired' });
    if (snapshot?.profile !== input.profile || normalize(snapshot.observed_identity) !== normalize(input.expected_identity) || snapshot.account_binding?.profile_url !== input.expected_profile_url) throw Object.assign(new Error('identity_mismatch'), { code: 'identity_mismatch' });
    const profiles = await transport.profiles();
    if (profiles.profiles?.filter(p => p.contextId === input.profile && p.connected).length !== 1) throw Object.assign(new Error('account_unconfirmed'), { code: 'account_unconfirmed' });
    if (!transport.connectionState) throw Object.assign(new Error('context_invalidated'), { code: 'context_invalidated' });
    const connection = connectionBinding(await transport.connectionState(), input.profile);
    if (connection.status !== 'observed' || JSON.stringify(connection) !== JSON.stringify(snapshot.connection_binding)) throw Object.assign(new Error('context_invalidated'), { code: 'context_invalidated' });
    const identityContext = { profile: input.profile, session: `salesnav-identity-${randomUUID()}` };
    const lease = batchIdentity && batchIdentities.get(batchIdentity);
    const reuseIdentity = lease?.transport === transport && lease.report === snapshot;
    if (!reuseIdentity) await transport.open('https://www.linkedin.com/feed/', identityContext);
    let selfUrl = reuseIdentity ? input.expected_profile_url : null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const ownPage = await transport.state(identityContext);
      const url = new URL(ownPage.url);
      if (url.origin !== 'https://www.linkedin.com') throw Object.assign(new Error('account_unconfirmed'), { code: 'account_unconfirmed' });
      if (/\/checkpoint/.test(url.pathname)) throw Object.assign(new Error('verification_required'), { code: 'verification_required' });
      if (/\/login|\/uas\/login/.test(url.pathname)) throw Object.assign(new Error('login_required'), { code: 'login_required' });
      if (reuseIdentity) {
        const observation = inspectPage(ownPage, 'salesnav_access');
        stopOnAccessFailure(observation);
        if (observation.identity !== snapshot.observed_identity || !url.pathname.startsWith('/sales/')) {
          batchIdentities.delete(batchIdentity);
          throw Object.assign(new Error('identity_mismatch'), { code: 'identity_mismatch' });
        }
        break;
      }
      selfUrl = readOwnProfile(ownPage);
      if (selfUrl && selfUrl !== input.expected_profile_url) throw Object.assign(new Error('identity_mismatch'), { code: 'identity_mismatch' });
      if (selfUrl) break;
      if (attempt + 1 < attempts) await sleep(delay);
    }
    if (!selfUrl) throw Object.assign(new Error('account_unconfirmed'), { code: 'account_unconfirmed' });
    if (batchIdentity && !reuseIdentity) batchIdentities.set(batchIdentity, { transport, report: snapshot });
    const reused = structuredClone(snapshot);
    reused.operation_id = randomUUID();
    reused.scope = reuseIdentity ? 'batch_identity_lease_with_target_validation' : 'fresh_identity_with_cached_capability_snapshot';
    reused.reusable_authorization = false;
    reused.identity_revalidated_at = reuseIdentity ? lease.checked_at : new Date().toISOString();
    if (batchIdentity && !reuseIdentity) batchIdentities.get(batchIdentity).checked_at = reused.identity_revalidated_at;
    reused.context_reuse = { status: reuseIdentity ? 'batch_identity_lease' : 'identity_revalidated', full_check_at: snapshot.checked_at, expires_at: contextSnapshot.expires_at };
    reused.nominal_quota ??= unobservedNominalQuota();
    for (const key of ['salesnav_access', 'account_search_access', 'lead_search_access', 'subscription', 'official_balance', 'nominal_quota']) reused[key] = { ...reused[key], evidence_source: 'execution_context_snapshot' };
    return reused;
  }
  const context = { profile: input.profile, session: `salesnav-check-${randomUUID()}` };
  const report = {
    schema_version: 1, operation: 'account-check', operation_id: randomUUID(), profile: input.profile,
    account_binding: { status: 'unknown', profile_url: null, immutable_id: null },
    checked_at: new Date().toISOString(), observed_identity: null, identity_match: null,
    connection_binding: unknown('not_captured'),
    identity_evidence_type: 'display_name', identity_binding_strength: 'profile_and_display_name',
    scope: 'point_in_time_diagnostic', reusable_authorization: false,
    salesnav_access: unknown('not_checked'), account_search_access: unknown('not_checked'), lead_search_access: unknown('not_checked'),
    adapter_execution_status: unknown('search_not_executed'), restricted_features: [], evidence: [],
    subscription: { status: 'unknown' }, official_balance: { status: 'unknown' }, nominal_quota: unobservedNominalQuota(),
    next_action: 'resolve_account_access',
  };
  let profiles;
  try { profiles = await transport.profiles(); }
  catch (error) { report.salesnav_access = unknown(FAILURE_REASONS.has(error.code) ? error.code : 'bridge_failure'); return report; }
  const matches = profiles.profiles?.filter(p => p.contextId === input.profile && p.connected);
  if (!matches || matches.length !== 1) { report.salesnav_access = unknown('profile_not_connected'); return report; }
  const pages = searchOnly ? { salesnav_access: PAGES.salesnav_access } : PAGES;
  if (searchOnly) {
    report.scope = 'search_identity_and_workspace';
    report.account_search_access = unknown('target_validation_required');
    report.lead_search_access = unknown('target_validation_required');
  }
  for (const [kind, target] of Object.entries(pages)) {
    try {
      await transport.open(target, context);
      let observation;
      for (let attempt = 0; attempt < attempts; attempt++) {
        const state = await transport.state(context);
        observation = inspectPage(state, kind);
        if (observation.reason === 'page_not_ready' && observation.identity && normalize(observation.identity) === normalize(input.expected_identity) && transport.readPageVisibility) {
          const visibility = await transport.readPageVisibility(context);
          if (visibility.url === state.url && visibility.visibility === 'hidden') observation = { ...observation, reason: 'window_not_visible' };
        }
        // Stop immediately on another identity, redirects, login, or origin mismatch.
        if (observation.identity && normalize(observation.identity) !== normalize(input.expected_identity)) break;
        if (observation.status === 'available' || !['page_not_ready', 'identity_unconfirmed'].includes(observation.reason)) break;
        if (attempt + 1 < attempts) await sleep(delay);
      }
      if (observation.identity) {
        report.observed_identity = observation.identity;
        report.identity_match = normalize(observation.identity) === normalize(input.expected_identity);
      }
      report.evidence.push({ capability: kind, page: observation.page ?? null, identity: observation.identity, marker: observation.reason, checked_at: new Date().toISOString() });
      if (report.identity_match === false) {
        // Invalidate all earlier checks if the session identity changed mid-check.
        for (const name of Object.keys(PAGES)) report[name] = unknown('identity_mismatch');
        report.next_action = 'select_expected_account';
        return report;
      }
      if (!observation.identity) {
        report.identity_match = null;
        for (const name of Object.keys(PAGES)) report[name] = unknown('session_identity_unconfirmed');
        report[kind] = { status: observation.status, reason: observation.reason };
        return report;
      }
      report[kind] = { status: observation.status, reason: observation.reason };
      report.restricted_features.push(...(observation.restricted_features ?? []));
      if (!observation.identity || kind === 'salesnav_access' && observation.status !== 'available') break;
    } catch (error) {
      report.identity_match = null;
      for (const name of Object.keys(PAGES)) report[name] = unknown('check_interrupted');
      report[kind] = unknown(FAILURE_REASONS.has(error.code) ? error.code : 'bridge_failure');
      break;
    }
  }
  if (report.identity_match === true && report.salesnav_access.status === 'available') {
    try {
      await transport.open('https://www.linkedin.com/feed/', context);
      let ownUrl = null;
      for (let i = 0; i < attempts; i++) {
        ownUrl = readOwnProfile(await transport.state(context));
        if (ownUrl) break;
        if (i + 1 < attempts) await sleep(delay);
      }
      report.account_binding = { status: ownUrl ? 'observed' : 'unknown', profile_url: ownUrl, immutable_id: null };
      report.evidence.push({ capability: 'account_binding', page: 'https://www.linkedin.com/feed/', marker: ownUrl ? 'sidebar_self_profile' : 'self_profile_unconfirmed', checked_at: new Date().toISOString() });
      if (input.expected_profile_url && ownUrl !== input.expected_profile_url) {
        report.identity_match = ownUrl ? false : null;
        for (const key of Object.keys(PAGES)) report[key] = unknown('profile_url_mismatch');
        report.next_action = 'select_expected_account';
        return report;
      }
      if (searchOnly) {
        report.identity_binding_strength = ownUrl ? 'profile_display_name_and_self_url' : 'profile_and_display_name';
        report.next_action = 'validate_actual_search_target';
        return report;
      }
      await transport.open('https://www.linkedin.com/sales/settings/sellers-profile', context);
      let settings;
      let settingsIdentity = null;
      let settingsPage;
      for (let i = 0; i < attempts; i++) {
        const data = await transport.state(context);
        settingsPage = data;
        const identity = inspectPage(data, 'salesnav_access').identity;
        settingsIdentity = identity;
        if (identity && normalize(identity) !== normalize(input.expected_identity)) {
          report.identity_match = false;
          for (const key of Object.keys(PAGES)) report[key] = unknown('identity_mismatch');
          report.account_binding.status = 'unknown';
          return report;
        }
        if (identity) settings = readSubscription(data);
        if (settings) break;
        if (i + 1 < attempts) await sleep(delay);
      }
      if (!settingsIdentity) {
        // An empty settings shell is not evidence that verified search access
        // disappeared. Never infer quota from it; rebind the exact self URL.
        const blankSettings = settingsPage?.url === 'https://www.linkedin.com/sales/settings/sellers-profile'
          && /interactive: 0 \| iframes: 0/.test(settingsPage.snapshot ?? '')
          && !/<(?:main|button|input|a)(?:[ >])/.test(settingsPage.snapshot ?? '');
        let rebound = null;
        if (blankSettings && input.expected_profile_url && ownUrl === input.expected_profile_url) {
          await transport.open('https://www.linkedin.com/feed/', context);
          for (let i = 0; i < attempts; i++) {
            rebound = readOwnProfile(await transport.state(context));
            if (rebound) break;
            if (i + 1 < attempts) await sleep(delay);
          }
        }
        if (rebound !== input.expected_profile_url || !rebound) {
          report.identity_match = rebound ? false : null;
          report.account_binding.status = 'unknown';
          for (const key of Object.keys(PAGES)) report[key] = unknown(rebound ? 'profile_url_mismatch' : 'session_identity_unconfirmed');
          return report;
        }
        report.subscription = unknown('settings_not_loaded');
        report.official_balance = unknown('settings_not_loaded');
        report.evidence.push({ capability: 'account_binding', page: 'https://www.linkedin.com/feed/', marker: 'self_profile_revalidated_after_empty_settings', checked_at: new Date().toISOString() });
      }
      if (settings) {
        Object.assign(report, settings);
        report.subscription.checked_at = report.official_balance.checked_at = new Date().toISOString();
      }
      report.identity_binding_strength = ownUrl ? 'profile_display_name_and_self_url' : 'profile_and_display_name';
    } catch (error) {
      report.account_binding = { status: 'unknown', profile_url: null, immutable_id: null };
      report.identity_match = null;
      for (const key of Object.keys(PAGES)) report[key] = unknown(FAILURE_REASONS.has(error.code) ? error.code : 'check_interrupted');
    }
  }
  if (captureConnection && report.identity_match === true && report.account_binding.status === 'observed' && transport.connectionState) {
    try { report.connection_binding = connectionBinding(await transport.connectionState(), input.profile); }
    catch { report.connection_binding = unknown('connection_generation_unconfirmed'); }
  }
  if (batchIdentity && report.identity_match === true && report.account_binding.status === 'observed' && report.connection_binding.status === 'observed') batchIdentities.set(batchIdentity, { transport, report, checked_at: new Date().toISOString() });
  report.restricted_features = [...new Set(report.restricted_features)];
  if (report.account_search_access.status === 'available' || report.lead_search_access.status === 'available') {
    report.next_action = 'verify_search_adapter_before_business_use';
  }
  onFullCheck?.(report);
  return report;
}
