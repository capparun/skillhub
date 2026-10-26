import { parseQuery } from './query.mjs';

// Only observed query structure is reported. Page prose is never interpreted
// as instructions, and diagnostics do not turn an unapplied request into data.
export function searchPostconditionError(data, { stage, field, requested }) {
  let observedKeywords = null;
  let observedFilters = [];
  let observation = 'unreadable_query';
  let page = null;
  try {
    const url = new URL(data.url);
    page = url.origin + url.pathname;
    const raw = url.searchParams.get('query');
    const query = raw === null ? {} : parseQuery(raw);
    observation = raw === null ? 'no_query' : 'observed';
    observedKeywords = typeof query.keywords === 'string' ? query.keywords.slice(0, 1000) : null;
    observedFilters = (query.filters ?? []).slice(0, 20).map(value => ({
      type: String(value.type).slice(0, 80),
      values: Array.isArray(value.values) ? value.values.slice(0, 20).map(item => ({ label: String(item.text ?? '').slice(0, 200), mode: item.selectionType })) : [],
    }));
  } catch { observation = 'unreadable_query'; }
  return Object.assign(new Error('search_not_confirmed'), {
    code: 'search_not_confirmed',
    details: { stage, field, requested, observed_keywords: observedKeywords, observed_filters: observedFilters, observation_status: observation, page },
  });
}
