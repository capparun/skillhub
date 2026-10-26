export function canonicalLinkedInProfileUrl(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase())) return '';
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/i);
    return match ? `linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}` : '';
  } catch {
    return '';
  }
}
