import { createHash, randomUUID } from 'node:crypto';
import { parseQuery, matchesFilters } from './query.mjs';
import { normalizeFilters, queryFilters } from './fields.mjs';
import { accountCheck } from './account-check.mjs';
import { saveCheckpoint, readCheckpoint } from './checkpoints.mjs';
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function queryFingerprint(raw, searchType, binding) {
  const query = parseQuery(raw);
  const filters = (query.filters ?? []).map(f => ({ type: f.type, ...(f.rangeValue?{rangeValue:f.rangeValue,selectedSubFilter:f.selectedSubFilter}:{values: f.values.map(v => ({ id: v.id, text: v.text, selectionType: v.selectionType })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))}) })).sort((a, b) => a.type.localeCompare(b.type));
  return createHash('sha256').update(JSON.stringify({ searchType, binding, keywords: query.keywords ?? null, spellCorrectionEnabled: query.spellCorrectionEnabled ?? null, filters })).digest('hex');
}
export function frameMatches(frame, task) {
  const url = new URL(frame.url);
  if (url.origin !== 'https://www.linkedin.com' || url.pathname !== `/sales/search/${task.search_type === 'account' ? 'company' : 'people'}`) fail('page_changed');
  if (!frame.identity && !frame.ready) return false;
  if (frame.identity !== (task.observed_identity ?? task.expected_identity)) fail('identity_mismatch');
  if (frame.blocking_dialog) fail('page_blocked');
  if (!frame.ready) return false;
  const normalized = normalizeFilters(task.search_type, task.filters);
  if (!matchesFilters(url.searchParams.get('query'), { keywords: task.keywords, filters: queryFilters(normalized) })) fail('query_mismatch');
  if (queryFingerprint(url.searchParams.get('query'), task.search_type, task.binding) !== task.query_fingerprint) fail('query_mismatch');
  if (task.keywords && frame.keywords !== task.keywords) fail('query_mismatch');
  if (!normalized.every(({ schema, values, input }) => input !== undefined || values.every(value => frame.fields?.some(field => field.label === schema.label && field.values?.includes(value.label))))) return false;
  return frame.ready === true;
}
export function framePage(frame) {
  if (frame.empty) return { page: 1, pages: 1, next: false };
  // The platform omits the pager for an exact single page. Require the
  // independently observed total and complete slot array; absence alone is
  // never evidence of an end page.
  if (frame.ready && frame.pagination_present === false && frame.page_label == null && frame.current_page == null && frame.next_enabled == null) {
    const exact = /^([1-9]\d*) results$/.exec(frame.total_text ?? '');
    const total = exact ? Number(exact[1]) : null;
    const page = new URL(frame.url).searchParams.get('page');
    if (total && total <= 25 && frame.slots?.length === total && frame.slots.some(slot => slot.href && slot.name) && (page === null || page === '1')) return { page: 1, pages: 1, next: false };
  }
  const match = /^Page (\d+) of (\d+)$/.exec(frame.page_label ?? '');
  const current = /^Page (\d+)$/.exec(frame.current_page ?? '');
  if (!match || !current || match[1] !== current[1] || !Number.isSafeInteger(+match[2]) || +match[1] < 1 || +match[1] > +match[2] || typeof frame.next_enabled !== 'boolean') fail('page_not_ready');
  if (frame.next_enabled !== (+match[1] < +match[2])) fail('page_changed');
  return { page: +match[1], pages: +match[2], next: frame.next_enabled };
}
export function frameEntity(slot, searchType) {
  if (!slot.href || !slot.name) return null;
  const url = new URL(slot.href, 'https://www.linkedin.com');
  if (url.origin !== 'https://www.linkedin.com') fail('page_changed');
  const match = searchType === 'account' ? /^\/sales\/company\/(\d+)$/.exec(url.pathname) : /^\/sales\/lead\/([A-Za-z0-9_-]+),(?:NAME_SEARCH|OUT_OF_NETWORK),[A-Za-z0-9_-]+$/.exec(url.pathname);
  if (!match) fail('page_changed');
  return { id: match[1], name: slot.name, url: `${url.origin}${url.pathname}`, ...(searchType === 'lead' && typeof slot.summary === 'string' && slot.summary.trim() ? {fields:{search_summary:{value:slot.summary.trim(),status:'observed',source:`${url.origin}${url.pathname}`,section:'search_result_card'}}} : {}) };
}
export function restoreURL(task) {
  const url = new URL(`https://www.linkedin.com/sales/search/${task.search_type === 'account' ? 'company' : 'people'}`);
  url.searchParams.set('query', task.query);
  if (task.page > 1) url.searchParams.set('page', String(task.page));
  url.searchParams.set('viewAllFilters', 'true');
  return url.href;
}
export async function collectPages(task, transport, context, { limit, max_pages = 1, sleep = ms => new Promise(r => setTimeout(r, ms)), checkpointOptions } = {}) {
  const results = structuredClone(task.results ?? []);
  const covered = { ...(task.covered ?? {}) };
  const completedPages = new Set(task.completed_pages ?? []);
  let lastConfirmedPage = null, navigationPending = false;
  let page = task.page ?? 1, pagesRead = 0, totalText = task.total_text ?? null, lastPageCount = null;
  let completed = false, stopReason = 'page_limit', interruption = null;
  let attemptsWithoutProgress = 0, emptyFrames = 0;
  let cardRecovery = null, lastFrameDiagnostic = null;
  const records = new Map(results.map(row => [row.id, row]));
  const startCount = results.length;
  try {
    for (let step = 0; step < 300; step++) {
      const frame = await transport.readSearchFrame(context);
      lastFrameDiagnostic = { visibility: frame.visibility ?? 'unknown', slot_count: Array.isArray(frame.slots) ? frame.slots.length : null,
        readable_slots: Array.isArray(frame.slots) ? frame.slots.filter(slot => slot.name && slot.href).length : null };
      if (!frameMatches(frame, task)) { if (++attemptsWithoutProgress >= 8) fail('page_not_ready'); await sleep(1000); continue; }
      let paging;
      try { paging = framePage(frame); } catch (error) {
        if (error.code === 'page_not_ready' && ++attemptsWithoutProgress < 8) { await sleep(1000); continue; }
        throw error;
      }
      lastPageCount = paging.pages;
      const urlPage = new URL(frame.url).searchParams.get('page') ?? '1';
      if (!/^\d+$/.test(urlPage) || +urlPage !== paging.page || paging.page !== page) { if (++attemptsWithoutProgress >= 8) fail('page_changed'); await sleep(1000); continue; }
      lastConfirmedPage = page; navigationPending = false;
      totalText = frame.total_text ?? totalText;
      const expectedEmpty = task.search_type === 'account' ? 'No accounts matched your search' : 'No leads matched your search';
      if (frame.empty) {
        if (frame.empty !== expectedEmpty || results.length || frame.slots?.some(slot => slot.href)) fail('page_changed');
        // A banner alone may be stale during redraw. Require an independently
        // observed zero total and confirm the ready, query-bound frame again.
        if (frame.total_text !== '0 results') {
          if (frame.total_text) fail('page_changed');
          if (++attemptsWithoutProgress >= 8) fail('page_not_ready');
          await sleep(1000); continue;
        }
        if (++emptyFrames < 2) { await sleep(1000); continue; }
        completed = true; stopReason = 'verified_empty'; break;
      }
      emptyFrames = 0;
      if (!Array.isArray(frame.slots) || frame.slots.length > 100 || new Set(frame.slots.map(slot => slot.index)).size !== frame.slots.length) fail('page_changed');
      if (!frame.slots.length) { if (++attemptsWithoutProgress >= 8) fail('page_not_ready'); await sleep(1000); continue; }
      let progress = false;
      for (const slot of frame.slots) {
        if (!Number.isInteger(slot.index) || slot.index < 0 || slot.index >= frame.slots.length) fail('page_changed');
        const entity = frameEntity(slot, task.search_type);
        if (!entity) continue;
        const key = `${page}:${slot.index}`;
        if (covered[key] && covered[key] !== entity.id) fail('page_changed');
        if (!covered[key]) progress = true;
        covered[key] = entity.id;
        let existing = records.get(entity.id);
        if (!existing && results.length < limit) { existing = { ...entity, observed_at: new Date().toISOString(), hits: [] }; results.push(existing); records.set(entity.id, existing); }
        if (existing && !existing.hits.some(hit => hit.page === page && hit.position === slot.index + 1)) existing.hits.push({ page, position: slot.index + 1, observed_at: new Date().toISOString() });
        if (results.length >= limit) break;
      }
      const missing = frame.slots.find(slot => !covered[`${page}:${slot.index}`]);
      if (!missing) {
        pagesRead++; completedPages.add(page); attemptsWithoutProgress = 0;
        if (!paging.next) { completed = true; stopReason = 'available_window_end'; break; }
        page++;
        if (results.length >= limit) { stopReason = 'result_limit'; break; }
        if (pagesRead >= max_pages) { stopReason = 'page_limit'; break; }
        navigationPending = true;
        await transport.nextResultsPage(context);
        await sleep(500);
      } else if (results.length >= limit) { stopReason = 'result_limit'; break; }
      else {
        attemptsWithoutProgress = progress ? 0 : attemptsWithoutProgress + 1;
        // Search redraws can leave deferred card containers mounted without any
        // links. Activate an owned hidden page; otherwise re-enter the verified
        // query once. Each action is bounded to one attempt, including when
        // re-entry makes the page hidden. Never revisit the homepage here.
        // The next frame still passes identity/query/page checks above.
        if ((!cardRecovery || frame.visibility === 'hidden' && !cardRecovery.activation_attempted) && attemptsWithoutProgress >= 2 && !results.length
            && frame.slots.every(slot => !slot.href && !slot.name) && (transport.open || transport.activateSearchPage)) {
          const hidden = frame.visibility === 'hidden';
          cardRecovery = { reason: hidden ? 'hidden_page_deferred_cards' : 'unmaterialized_result_cards', action: hidden ? 'activate_owned_search_once' : 'reopen_same_query_once', page, attempts: (cardRecovery?.attempts ?? 0) + 1, activation_attempted: hidden, ...(cardRecovery ? { previous_action: cardRecovery.action } : {}) };
          if (hidden) {
            if (!transport.activateSearchPage || !(await transport.activateSearchPage(context)).visible) fail('window_not_visible');
          } else {
            if (!transport.open) fail('page_incomplete');
            navigationPending = true;
            await transport.open(restoreURL({ ...task, page }), context);
          }
          attemptsWithoutProgress = 0;
          await sleep(500);
          continue;
        }
        if (attemptsWithoutProgress >= 8) fail('page_incomplete');
        if (!(await transport.scrollResultSlot(missing.index, context)).dispatched) fail('page_changed');
        await sleep(350);
      }
      if (step === 299) fail('page_incomplete');
    }
  } catch (error) {
    stopReason = error.code ?? 'collection_interrupted';
    interruption = { code: stopReason, stage: 'collect_results', recovery: 'resume_with_same_account_and_query' };
  }
  let cursor = null;
  if (!completed) {
    try { cursor = await saveCheckpoint({ ...task, results, covered, completed_pages: [...completedPages], page, limit, total_text: totalText }, checkpointOptions); }
    catch { interruption = { code: 'checkpoint_write_failed', stage: 'save_checkpoint', recovery: 'export_partial_results_or_restart_query' }; }
  }
  const exactTotal = /^([\d,]+) results$/.exec(totalText ?? '');
  const allMatched = completed && (stopReason === 'verified_empty' || exactTotal && +exactTotal[1].replaceAll(',', '') === results.length);
  return { operation: task.operation, profile: task.profile, account_binding: task.account_binding, requested_filters: { ...(task.keywords ? { keywords: task.keywords } : {}), filters: task.filters }, applied_filters: { ...(task.keywords ? { keywords: task.keywords } : {}), filters: task.filters }, results, returned_count: results.length, new_count: results.length - startCount, completeness: allMatched ? 'complete' : completed ? 'complete_available_window' : 'partial', truncated: !allMatched, stop_reason: stopReason, result_scope: stopReason === 'verified_empty' ? 'verified_empty' : 'observed_search_window', pagination: { current_page: interruption || navigationPending ? null : lastConfirmedPage, last_confirmed_page: lastConfirmedPage, resume_page: completed ? null : page, available_pages: lastPageCount, complete_pages_this_call: pagesRead, completed_pages: [...completedPages].sort((a,b)=>a-b), scanned_positions: Object.keys(covered).length, available_window_end: completed, total_text: totalText }, query_fingerprint: task.query_fingerprint, cursor, ...(cardRecovery ? { card_recovery: cardRecovery } : {}), ...(interruption ? { interruption, collection_diagnostic: lastFrameDiagnostic } : {}), checked_at: new Date().toISOString() };
}
export async function searchPage(input, transport, options = {}) {
  if (!input || Object.keys(input).some(key => !['profile', 'expected_identity', 'expected_profile_url', 'cursor', 'limit', 'max_pages'].includes(key))) fail('invalid_input');
  const task = await readCheckpoint(input.cursor, options.checkpointOptions);
  if (task.profile !== input.profile || task.expected_profile_url !== input.expected_profile_url || task.expected_identity !== input.expected_identity) fail('identity_mismatch');
  const limit = input.limit ?? task.limit;
  const max_pages = input.max_pages ?? 1;
  if (!Number.isInteger(limit) || limit <= task.results.length || limit > 2500 || !Number.isInteger(max_pages) || max_pages < 1 || max_pages > 10) fail('invalid_input');
  const normalized = normalizeFilters(task.search_type, task.filters);
  if (!matchesFilters(task.query, { keywords: task.keywords, filters: queryFilters(normalized) }) || queryFingerprint(task.query, task.search_type, task.binding) !== task.query_fingerprint) fail('query_mismatch');
  const check = await accountCheck({ profile: input.profile, expected_identity: input.expected_identity, expected_profile_url: input.expected_profile_url }, transport, { ...options, searchOnly: task.collection_provider === 'salesnav_read_api' });
  if (task.collection_provider === 'salesnav_read_api') {
    if (task.search_type !== 'lead' || Object.keys(task.filters).length || !transport.readLeadSearchApi) fail('unsupported');
    const {keywordLeadRead}=await import('./lead-api.mjs');
    return keywordLeadRead({...input,keywords:task.keywords,filters:{},limit,max_pages},check,transport,{profile:input.profile,session:`salesnav-api-resume-${randomUUID()}`},{...options,previous:task});
  }
  const access = task.search_type === 'account' ? 'account_search_access' : 'lead_search_access';
  if (check.identity_match !== true || check[access].status !== 'available' || check.account_binding.status !== 'observed') fail('account_unconfirmed');
  const context = { profile: input.profile, session: `salesnav-resume-${randomUUID()}` };
  await transport.open(restoreURL(task), context);
  return collectPages({ ...task, operation: 'search-page' }, transport, context, { ...options, limit, max_pages });
}
