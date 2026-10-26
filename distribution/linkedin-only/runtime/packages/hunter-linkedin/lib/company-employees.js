// Runs in the page: restrict fallback links to the company's primary content,
// excluding sidebar recommendations and the messaging overlay.
export function readEmployeeCards() {
  const root = document.querySelector('main [aria-label="Primary content"]') || document.querySelector('main');
  if (!root) return [];
  return Array.from(root.querySelectorAll('a[href*="/in/"]')).filter(link =>
    !link.closest('aside, [aria-label="Aside"], [role="dialog"]')
  ).map(link => {
    const card = link.closest('li, [class*="profile-card"], [data-test-id="people-card"]') || link;
    return {
      href: link.href,
      label: link.getAttribute('aria-label') || '',
      image: link.querySelector('img')?.alt || '',
      text: card.innerText || '',
      title: card.querySelector('[class*="occupation"], [class*="subtitle"]')?.textContent || '',
      location: card.querySelector('[class*="location"]')?.textContent || '',
    };
  });
}

export function normalizeEmployeeCards(cards) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const rows = new Map();
  for (const card of cards) {
    let url;
    try { url = new URL(card.href); } catch { continue; }
    if (url.protocol !== 'https:' || !['linkedin.com', 'www.linkedin.com'].includes(url.hostname) || url.username || url.password) continue;
    const match = url.pathname.match(/^\/in\/([^/]+)\/?$/);
    if (!match) continue;
    const lines = String(card.text || '').split(/\n+/).map(clean).filter(Boolean);
    const name = clean(card.label.replace(/^View\s+/i, '').replace(/[’']s profile(?: picture)?$/i, '')) || clean(card.image.replace(/[’']s profile(?: picture)?$/i, '')) || lines[0] || '';
    if (!name) continue;
    const title = clean(card.title) || lines.find(line => line !== name && !/^[·•]?\s*(1st|2nd|3rd\+?|Verified|Premium)\b|mutual connection|^(Connect|Follow|Message)$/i.test(line)) || '';
    const row = {name, profileId:match[1], profileUrl:`https://www.linkedin.com/in/${match[1]}/`,title,location:clean(card.location)};
    const previous = rows.get(row.profileId);
    if (!previous || (!previous.title && row.title)) rows.set(row.profileId,row);
  }
  return [...rows.values()];
}
