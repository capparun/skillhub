// The platform can show unfiltered suggestions underneath an explicit empty
// result banner. Those cards and their count do not belong to the active query.
export function isLeadFilterEmpty({ heading, instruction, filter, removeButton, suggestion }) {
  if (heading !== 'No matches found' || !filter || removeButton !== true) return false;
  if (instruction !== `Remove the ${filter} filter to show leads matching your other filters.`) return false;
  const match = /^(\d[\d,.KM+]*) leads available if you remove the (.+) filter$/.exec(suggestion ?? '');
  return !!match && match[2] === filter;
}
