// Parses observed Rest.li URL syntax without evaluating it or guessing IDs.
export function parseQuery(text) {
  function split(s, delimiter) {
    const parts = []; let depth = 0; let start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      if (s[i] === ')') depth--;
      if (depth < 0) throw new Error('Invalid query');
      if (s[i] === delimiter && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
    }
    if (depth !== 0) throw new Error('Invalid query');
    parts.push(s.slice(start)); return parts;
  }
  function parse(s, level = 0) {
    if (level > 12) throw new Error('Invalid query');
    if (s.startsWith('List(') && s.endsWith(')')) {
      const body = s.slice(5, -1); return body ? split(body, ',').map(v => parse(v, level + 1)) : [];
    }
    if (s.startsWith('(') && s.endsWith(')')) {
      const result = Object.create(null);
      for (const pair of split(s.slice(1, -1), ',')) {
        const index = pair.indexOf(':');
        if (index <= 0) throw new Error('Invalid query');
        const key = pair.slice(0, index);
        if (!/^[a-zA-Z]+$/.test(key) || key in result) throw new Error('Invalid query');
        result[key] = parse(pair.slice(index + 1), level + 1);
      }
      return result;
    }
    return decodeURIComponent(s);
  }
  if (typeof text !== 'string' || text.length > 10000) throw new Error('Invalid query');
  return parse(text);
}
export function matchesQuery(raw, { keywords, headcount }) {
  try {
    const q = parseQuery(raw);
    if (!q || Array.isArray(q) || typeof q !== 'object') return false;
    if (Object.keys(q).some(k => !['spellCorrectionEnabled', 'filters', 'keywords'].includes(k))) return false;
    if (q.spellCorrectionEnabled !== undefined && !['true', 'false'].includes(q.spellCorrectionEnabled)) return false;
    if ((q.keywords ?? undefined) !== keywords) return false;
    if (!headcount) return q.filters === undefined || Array.isArray(q.filters) && q.filters.length === 0;
    if (!Array.isArray(q.filters) || q.filters.length !== 1) return false;
    const f = q.filters[0];
    if (Object.keys(f).some(k => !['type', 'values'].includes(k)) || f.type !== 'COMPANY_HEADCOUNT' || !Array.isArray(f.values) || f.values.length !== 1) return false;
    const v = f.values[0];
    return Object.keys(v).every(k => ['id', 'text', 'selectionType'].includes(k)) && typeof v.id === 'string' && v.id.length > 0 && v.text === headcount && v.selectionType === 'INCLUDED';
  } catch { return false; }
}

// Compare caller-selected UI values against observed query values. IDs are
// platform evidence, never constructed from business terms.
export function matchesFilters(raw, { keywords, filters = [] }) {
  try {
    const q = parseQuery(raw);
    if (!q || typeof q !== 'object' || Array.isArray(q)) return false;
    if (Object.keys(q).some(k => !['recentSearchParam', 'spellCorrectionEnabled', 'filters', 'keywords'].includes(k))) return false;
    if (q.recentSearchParam && (typeof q.recentSearchParam !== 'object' || Array.isArray(q.recentSearchParam) || Object.keys(q.recentSearchParam).some(key => !['id', 'doLogHistory'].includes(key)) || q.recentSearchParam.doLogHistory !== 'true' || q.recentSearchParam.id !== undefined && !/^\d+$/.test(q.recentSearchParam.id))) return false;
    if (q.spellCorrectionEnabled !== undefined && !['true', 'false'].includes(q.spellCorrectionEnabled)) return false;
    if (q.keywords !== keywords) return false;
    const actual = q.filters ?? [];
    if (!Array.isArray(actual) || actual.length !== filters.length) return false;
    return filters.every(expected => {
      const found = actual.filter(f => f.type === expected.type);
      if (found.length !== 1) return false;
      const f = found[0];
      if (expected.rangeValue) return Object.keys(f).every(k=>['type','rangeValue','selectedSubFilter'].includes(k)) && f.selectedSubFilter===expected.selectedSubFilter && f.rangeValue && Object.keys(f.rangeValue).length===Object.keys(expected.rangeValue).length && Object.entries(expected.rangeValue).every(([k,v])=>f.rangeValue[k]===v);
      if (expected.text_only) return Object.keys(f).every(k=>['type','values'].includes(k)) && f.values?.length===1 && Object.keys(f.values[0]).every(k=>['text','selectionType'].includes(k)) && f.values[0].text===expected.values[0].text && f.values[0].selectionType==='INCLUDED';
      if (expected.values?.[0]?.id && expected.values[0].text===undefined) return f.values?.length===1 && Object.keys(f).every(k=>['type','values'].includes(k)) && Object.keys(f.values[0]).every(k=>['id','text','selectionType'].includes(k)) && f.values[0].id===expected.values[0].id && f.values[0].selectionType==='INCLUDED';
      if (Object.keys(f).some(k => !['type', 'values'].includes(k)) || !Array.isArray(f.values) || f.values.length !== expected.values.length) return false;
      return expected.values.every(value => f.values.filter(v => Object.keys(v).every(k => ['id', 'text', 'selectionType', 'parent'].includes(k)) && (v.parent === undefined || ['CURRENT_COMPANY', 'PAST_COMPANY'].includes(f.type) && typeof v.parent === 'object' && Object.keys(v.parent).length === 1 && v.parent.id === '0') && typeof v.id === 'string' && v.id.length > 0 && v.text === value.text && v.selectionType === value.selectionType).length === 1);
    });
  } catch { return false; }
}
