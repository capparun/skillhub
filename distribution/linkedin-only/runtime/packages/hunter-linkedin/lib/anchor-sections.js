// Anchor-page extraction: read Experience/Education from /in/<handle>/details/<section>/
// instead of scrolling the main profile page.
const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function anchorSectionUrl(profileUrl, section) {
  const url = new URL(profileUrl);
  if (!/^\/in\/[^/?#]+\/?$/.test(url.pathname) || url.pathname === '/in/me/') {
    throw Object.assign(new Error('anchor_requires_profile_url'), { code: 'anchor_requires_profile_url' });
  }
  return new URL(`${url.pathname.replace(/\/?$/, '/')}details/${section}/`, 'https://www.linkedin.com').toString();
}

const CHROME = /^(show all|show less|edit|delete|add education|add experience|back to profile|education|experience|show credential|show media|see more|see less|←|\+)$/i;
const DATE_RANGE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\s*\d{4}\s*[–-]\s*(?:present|\d{4}|[a-z]{3,9}\s+\d{4})\b/i;
const DEGREE = /\b(bachelor|master|mba|ph\.?d|doctor|associate|diploma|certificate|b\.?a|b\.?s|m\.?s|b\.?sc|m\.?sc|degree)\b/i;

export function buildEducationExtractionScript() {
  return String.raw`(() => {
    const clean = (s) => String(s || '').replace(/[\u00a0\u202f]+/g, ' ').replace(/\s+/g, ' ').trim();
    const CHROME = /^(show all|show less|edit|delete|add education|back to profile|education|show credential|show media|see more|see less|←|\+)$/i;
    const DATE_RANGE = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)?\s*\d{4}\s*[–-]\s*(?:present|\d{4}|[a-z]{3,9}\s+\d{4})\b/i;
    const DEGREE = /\b(bachelor|master|mba|ph\.?d|doctor|associate|diploma|certificate|b\.?a|b\.?s|m\.?s|b\.?sc|m\.?sc|degree)\b/i;
    const main = document.querySelector('main') || document.body;
    // The details page does not always use an <h2> for the section title, so pick the
    // smallest node whose whole text is "Education".
    const heading = Array.from(main.querySelectorAll('h1, h2, h3, h4, span, div'))
      .filter((node) => /^education$/i.test(clean(node.textContent || '')))
      .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0];
    const section = heading ? (heading.closest('section') || heading.parentElement?.parentElement || main) : main;
    const linesOf = (node) => (node.innerText || node.textContent || '')
      .split(/\n+/).map(clean).filter(Boolean).filter((line) => !CHROME.test(line));
    const items = Array.from(section.querySelectorAll('li, [role="listitem"]'))
      .map((node) => ({ node, lines: linesOf(node) }))
      .filter(({ lines }) => lines.length > 0 && lines.join(' ').length <= 1200)
      .filter(({ node, lines }) => Boolean(node.querySelector('a[href*="/school/"], a[href*="/in/"]')) || DATE_RANGE.test(lines.join(' ')));
    const rows = [];
    const seen = new Set();
    for (const { lines } of items) {
      const dateIndex = lines.findIndex((line) => DATE_RANGE.test(line));
      const degree = lines.find((line) => DEGREE.test(line)) || '';
      const school = lines.find((line) => line !== degree && !DATE_RANGE.test(line)) || '';
      const key = school + '::' + degree + '::' + (dateIndex >= 0 ? lines[dateIndex] : '');
      if (!school || seen.has(key)) continue;
      seen.add(key);
      const dateLine = dateIndex >= 0 ? lines[dateIndex] : '';
      const dateRange = dateLine.match(DATE_RANGE)?.[0] || dateLine;
      const [startDate = '', endDate = ''] = dateRange.split(/\s*[–-]\s*/).map(clean);
      const description = lines
        .filter((line) => line !== school && line !== degree && line !== dateLine)
        .join(' ');
      rows.push({
        rank: rows.length + 1,
        school,
        degree,
        date_range: dateRange,
        start_date: startDate,
        end_date: endDate,
        description,
        raw_text: lines.join(' | '),
      });
    }
    // Some layouts render education rows without <li> containers; group lines as
    // school / degree / date range and stop at the next non-education block.
    if (rows.length === 0) {
      const stop = /^(profile language|who your viewers also viewed|interests|people you may know|recommendations|about)$/i;
      const scoped = [];
      for (const line of linesOf(section)) {
        if (stop.test(line)) break;
        scoped.push(line);
      }
      for (let i = 2; i < scoped.length; i++) {
        if (!DATE_RANGE.test(scoped[i])) continue;
        const school = scoped[i - 2];
        const degree = scoped[i - 1];
        if (!school || !degree) continue;
        const dateLine = scoped[i];
        const dateRange = dateLine.match(DATE_RANGE)?.[0] || dateLine;
        const [startDate = '', endDate = ''] = dateRange.split(/\s*[–-]\s*/).map(clean);
        rows.push({
          rank: rows.length + 1,
          school,
          degree,
          date_range: dateRange,
          start_date: startDate,
          end_date: endDate,
          description: '',
          raw_text: [school, degree, dateLine].join(' | '),
        });
      }
    }
    return {
      education_rows: rows.map((row) => ({ ...row, total_count: rows.length })),
      section_text: linesOf(section).join(' | '),
      heading_found: Boolean(heading),
      candidate_count: items.length,
      section_text_length: linesOf(section).join(' ').length,
      page_href: location.href,
    };
  })()`;
}

export function normalizeEducationRows(payload) {
  const rows = Array.isArray(payload?.education_rows) ? payload.education_rows : [];
  const items = rows.map((row, index) => ({
    rank: Number(row?.rank) || index + 1,
    school: clean(row?.school),
    degree: clean(row?.degree),
    date_range: clean(row?.date_range),
    start_date: clean(row?.start_date),
    end_date: clean(row?.end_date),
    description: clean(row?.description),
    raw_text: clean(row?.raw_text),
  })).filter(row => row.school);
  return {
    items,
    text: clean(payload?.section_text) || items.map(row => row.raw_text).join(' | '),
    diagnostics: {
      heading_found: Boolean(payload?.heading_found),
      candidate_count: Number(payload?.candidate_count) || 0,
      section_text_length: Number(payload?.section_text_length) || 0,
      section_text: clean(payload?.section_text).slice(0, 400),
      page_href: clean(payload?.page_href),
    },
  };
}

export function experienceText(items) {
  if (!Array.isArray(items)) return '';
  return items.map(item => {
    const head = [clean(item?.title), clean(item?.company)].filter(Boolean).join(' @ ');
    const range = clean(item?.date_range);
    return [head, range ? `(${range})` : ''].filter(Boolean).join(' ');
  }).filter(Boolean).join(' | ');
}
