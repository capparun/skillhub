// Exact observed surfaces only. No feed-wide /in/ link guessing.
export function readOwnProfile(data) {
  if (data.url !== 'https://www.linkedin.com/feed/' && data.url !== 'https://www.linkedin.com/feed') return null;
  const lines = (data.snapshot ?? '').split('\n');
  const start = lines.findIndex(l => /<aside aria-label=Sidebar\s*\/>/.test(l));
  if (start < 0) return null;
  const indent = lines[start].search(/\S/);
  const section = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && line.search(/\S/) <= indent) break;
    section.push(line);
  }
  const urls = [...new Set([...section.join('\n').matchAll(/href=(\/in\/[a-zA-Z0-9_%\-]+\/)(?:\s|>)/g)].map(m => m[1]))];
  return urls.length === 1 ? `https://www.linkedin.com${urls[0]}` : null;
}
export function readSubscription(data) {
  if (data.url !== 'https://www.linkedin.com/sales/settings/sellers-profile') return null;
  const text = data.snapshot ?? '';
  const plan = text.match(/<h3 id=account-header>(Sales Navigator [^<\n]+)<\/h3>/)?.[1];
  const balance = text.match(/<h3>InMail™ messages<\/h3>\s*\n\s*<p>([\d,]+) available\.<\/p>/)?.[1];
  return plan ? {
    subscription: { status: 'observed', name: plan, source: data.url },
    official_balance: balance === undefined ? { status: 'unknown' } : { status: 'observed', kind: 'inmail', available: Number(balance.replaceAll(',', '')), source: data.url, semantics: 'current_available_not_monthly_allocation' },
  } : null;
}
