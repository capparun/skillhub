// LinkedIn public identifiers may contain non-ASCII characters (for example 妍-王-a52634337).
// The browser, the API and the account binding express the same slug differently:
// one percent-encodes it, the other returns it raw. Identity checks must decode
// before comparing, otherwise a valid account can never be confirmed.
export function profileSlug(value) {
  const last = String(value ?? '').split(/[?#]/)[0].split('/').filter(Boolean).at(-1) ?? '';
  try { return decodeURIComponent(last); } catch { return last; }
}

export function canonicalProfileUrl(value) {
  const original = String(value ?? '');
  try {
    const url = new URL(original);
    if (!/^(www\.)?linkedin\.com$/.test(url.hostname) || !/^\/in\/[^/]+\/?$/.test(url.pathname)) return original;
    return `https://www.linkedin.com/in/${profileSlug(original)}/`;
  } catch { return original; }
}

export const PROFILE_URL_PATTERN = /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/$/;
