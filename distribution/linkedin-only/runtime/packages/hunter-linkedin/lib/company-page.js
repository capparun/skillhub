/**
 * Extract LinkedIn company IDs embedded in a company page.
 * LinkedIn currently emits both legacy `urn:li:company` and Dash
 * `urn:li:fsd_company` identifiers.
 */
export function extractCompanyIdsFromHtml(html = '') {
  const text = String(html);
  const ids = [];
  const patterns = [
    /\b(?:id|componentkey)=["']pages\.topCard\.(\d+)["']/g,
    /urn:li:(?:fsd_)?company:(\d{3,})/g,
    /"companyId"\s*:\s*"?(\d{3,})"?/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) ids.push(match[1]);
  }

  return [...new Set(ids)];
}

/** Prefer the company resolved by LinkedIn's universal-name query. */
export function extractTargetCompanyId(html = '') {
  const text = String(html);
  const topCards = [...new Set([...text.matchAll(/\b(?:id|componentkey)=["']pages\.topCard\.(\d+)["']/g)].map(match => match[1]))];
  if (topCards.length) return topCards.length === 1 ? topCards[0] : null;
  const match = text.match(
    /organizationDashCompaniesByUniversalName[\s\S]{0,1000}?urn:li:(?:fsd_)?company:(\d{3,})/
  );
  if (match) return match[1];
  const candidates = extractCompanyIdsFromHtml(text);
  return candidates.length === 1 ? candidates[0] : null;
}

