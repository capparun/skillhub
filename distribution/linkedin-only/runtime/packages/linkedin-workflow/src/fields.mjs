import { TYPED_FIELDS, normalizeTyped, typedQuery } from './typed-fields.mjs';
import { EXTENDED_FIELDS } from './extended-fields.mjs';
// Field names, placeholders and query types are platform adapter facts.
// Values and query strategy belong to the caller/model.
export const FIELD_SCHEMAS = {
  account: {
    industry: { label: 'Industry', ui: 'Industry', query_type: 'INDUSTRY', source: 'entity', placeholder: 'Add industries', modes: ['include'] },
    headquarters_location: { label: 'Headquarters location', ui: 'Region', query_type: 'REGION', source: 'entity', placeholder: 'Add locations', modes: ['include'] },
    company_headcount: { label: 'Company headcount', ui: 'Company headcount', query_type: 'COMPANY_HEADCOUNT', source: 'enum', modes: ['include'] },
  },
  lead: {
    geography: { label: 'Geography', ui: 'Region', query_type: 'REGION', source: 'entity', placeholder: 'Add locations', modes: ['include'] },
    current_company: { label: 'Current company', ui: 'Current company', query_type: 'CURRENT_COMPANY', source: 'entity', placeholder: 'Add current companies and account lists', modes: ['include'] },
    function: { label: 'Function', ui: 'Function', query_type: 'FUNCTION', source: 'enum', placeholder: 'Add functions', modes: ['include', 'exclude'] },
    title: { label: 'Current job title', ui: 'Current job title', query_type: 'CURRENT_TITLE', source: 'entity', placeholder: 'Add current titles', modes: ['include', 'exclude'] },
    seniority: { label: 'Seniority level', ui: 'Seniority level', query_type: 'SENIORITY_LEVEL', source: 'enum', modes: ['include', 'exclude'] },
  },
};
for (const kind of ['account', 'lead']) {
  for (const [key, schema] of Object.entries(EXTENDED_FIELDS[kind])) {
    if (!FIELD_SCHEMAS[kind][key]) FIELD_SCHEMAS[kind][key] = schema;
    else FIELD_SCHEMAS[kind][key].modes=[...new Set([...FIELD_SCHEMAS[kind][key].modes,...schema.modes])];
  }
}
for (const kind of ['account','lead']) Object.assign(FIELD_SCHEMAS[kind], TYPED_FIELDS[kind]);
export function fieldSchema(searchType, key) { return FIELD_SCHEMAS[searchType]?.[key] ?? null; }
export function resolveField(searchType, label) { return Object.entries(FIELD_SCHEMAS[searchType] ?? {}).find(([, value]) => value.label === label); }
export function parseFieldOptions(snapshot, schema) {
  const start = snapshot.indexOf(`Collapse ${schema.label} filter`);
  if (start < 0) return [];
  const section = snapshot.slice(start).split('<fieldset')[0];
  const values = [];
  for (const line of section.split('\n').filter(line => line.includes('role=option'))) {
    const match = line.match(/aria-label=Include “([^”]+)” in ([^\n]+?) filter/);
    if (!match || match[2] !== schema.ui) continue;
    const label = match[1].replace(/ \([\d,.KM+]+\)$/, '');
    const duplicate = values.find(value => value.label === label);
    if (duplicate) { duplicate.occurrences++; continue; }
    const modes = ['include'];
    if (schema.modes.includes('exclude') && section.includes(`Exclude “${match[1]}” from ${schema.ui} filter`)) modes.push('exclude');
    values.push({ label, occurrences: 1, value: label, option_label: match[1], value_type: 'ui_label', modes, platform_id: null });
  }
  return values;
}
export function normalizeFilters(searchType, filters) {
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  if (!filters || typeof filters !== 'object' || Array.isArray(filters)) fail('invalid_input');
  const result = [];
  for (const [key, values] of Object.entries(filters)) {
    const schema = fieldSchema(searchType, key);
    if (!schema) fail('unsupported');
    if (['range','boolean','text','restricted'].includes(schema.source)) { result.push({key,schema,input:normalizeTyped(schema,values),values:[]}); continue; }
    if (!Array.isArray(values) || !values.length || values.length > 8) fail('invalid_input');
    const seen = new Set();
    for (const value of values) {
      if (!value || Object.keys(value).some(key => !['label', 'mode', 'lookup_query'].includes(key)) || typeof value.label !== 'string' || !value.label.trim() || value.label.trim() !== value.label || value.label.length > 200 || /[\r\n“”]/.test(value.label) || !schema.modes.includes(value.mode)) fail('invalid_input');
      if (value.lookup_query !== undefined && (schema.source !== 'entity' || !schema.placeholder || typeof value.lookup_query !== 'string' || !value.lookup_query.trim() || value.lookup_query.trim() !== value.lookup_query || value.lookup_query.length > 200 || /[\u0000-\u001f\u007f]/.test(value.lookup_query))) fail('invalid_input');
      if (seen.has(value.label)) fail('invalid_input');
      seen.add(value.label);
    }
    result.push({ key, schema, values });
  }
  return result;
}
export const queryFilters = normalized => normalized.map(({schema,values,input}) => input !== undefined ? typedQuery(schema,input) : ({ type: schema.query_type, values: values.map(value => ({ text: value.label, selectionType: value.mode === 'exclude' ? 'EXCLUDED' : 'INCLUDED' })) })).filter(Boolean);
export function inputHasValue(snapshot, placeholder, value) {
  return snapshot.split('\n').some(line => line.includes(`<input placeholder=${placeholder} `) && line.endsWith(`value=${value} />`));
}
export function candidatesMatchQuery(values, query) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return values.length > 0 && values.every(value => terms.every(term => value.label.toLocaleLowerCase().includes(term)));
}
