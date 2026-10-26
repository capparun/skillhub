// Only current-role containers are eligible; never scan employment history.
export function readCurrentRoles(root) {
  const heading = [...root?.querySelectorAll('h2') ?? []].find(e => /^Current roles?$/.test(e.textContent.trim()));
  const section = heading?.closest('[data-sn-view-name="lead-current-role"]') ?? heading?.closest('section');
  if (!section) return { roles: [], more: false };
  const roles = [...section.querySelectorAll('[data-anonymize="job-title"]')].flatMap(title => {
    const item = title.closest('p') ?? title.closest('li');
    const company = item?.querySelector('a[data-anonymize="company-name"]');
    if (!company) return [];
    const period = item.nextElementSibling?.tagName === 'P' ? item.nextElementSibling.textContent.trim() : null;
    return [{title:title.textContent.trim(),company:company.textContent.trim(),company_url:company.href,period_text:period}];
  });
  return {roles,more:[...section.querySelectorAll('button')].some(e=>/\+ \d+ more/.test(e.textContent))};
}
