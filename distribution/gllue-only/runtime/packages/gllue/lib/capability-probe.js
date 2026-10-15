import { buildUrl, getConfig, isLoggedIn } from './auth.js';

async function inspectPage(page, path, expectedPath, selectors, readySelector = selectors.join(', ')) {
  await page.goto(buildUrl(getConfig(), path), { waitUntil: 'networkidle2' });
  let waitError;
  try {
    await page.wait({ selector: readySelector, timeout: 10 });
  } catch (error) {
    waitError = error;
  }
  const observedUrl = await page.evaluate(() => location.href).catch(() => '');
  const url = typeof observedUrl === 'string' && observedUrl
    ? observedUrl : await page.getCurrentUrl?.() || '';
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) return { available: false, loggedIn: false, url, matchedSelectors: [], title: '' };
  if (waitError) throw waitError;
  const visible = await page.evaluate((items) => {
    const matched = items.filter((selector) => document.querySelector(selector));
    return { matched, title: document.title || '' };
  }, selectors);

  return {
    available: loggedIn && new URL(url).pathname === expectedPath && visible.matched.length > 0,
    loggedIn,
    url,
    matchedSelectors: visible.matched,
    title: visible.title,
  };
}

/**
 * Read-only tenant capability probe. It navigates to known pages and inspects
 * visible entry points; it never clicks Save or mutates a candidate.
 */
export async function probeGllueCapabilities(page, { includeWrite = false } = {}) {
  const config = getConfig();
  const dashboardUrl = buildUrl(config, config.paths.dashboard);
  const checkedAt = new Date().toISOString();

  try {
    await page.goto(dashboardUrl, { waitUntil: 'networkidle2' });
    const observedUrl = await page.evaluate(() => location.href).catch(() => '');
    const currentUrl = typeof observedUrl === 'string' && observedUrl
      ? observedUrl : await page.getCurrentUrl?.() || '';
    const loggedIn = await isLoggedIn(page);
    const currentHost = (() => {
      try { return new URL(currentUrl).hostname; } catch { return ''; }
    })();
    const tenantMatches = currentHost === config.domain;

    if (!loggedIn || !tenantMatches) {
      return {
        status: loggedIn ? 'tenant_mismatch' : 'auth_required',
        checkedAt,
        tenant: config.tenant,
        domain: config.domain,
        loggedIn,
        tenantMatches,
        candidateSearch: false,
        candidateDetail: 'unknown',
        jobSearch: false,
        candidateWriteForm: 'not_checked',
        currentUrl,
      };
    }

    const candidate = await inspectPage(
      page,
      config.paths.candidateSearch,
      config.paths.candidateSearch,
      [
        'input[data-test="sidebar-filter-search:candidate"]',
        '[data-test="list-sidebar-filter:candidate"]',
        '.grid-row.grid-body-row',
        'a[href*="/crm/candidate/detail"]',
      ],
    );
    if (!candidate.loggedIn) {
      return {
        status: 'auth_required', checkedAt, tenant: config.tenant, domain: config.domain,
        loggedIn: false, tenantMatches: true, candidateSearch: false,
        candidateDetail: 'unknown', jobSearch: false,
        candidateWriteForm: 'not_checked', currentUrl: candidate.url,
      };
    }
    // A list link proves an entry exists, not that a resume can be read.
    const candidateDetail = 'unknown';

    const job = await inspectPage(
      page,
      config.paths.jobSearch,
      config.paths.jobSearch,
      [
        '[data-test="list-sidebar-filter:joborder"]',
        '[data-test="list-table-data-grid:joborder$jobTitle"]',
        'a[href*="/crm/joborder/detail"]',
        '.grid-body-row',
      ],
    );
    if (!job.loggedIn) {
      return {
        status: 'auth_required', checkedAt, tenant: config.tenant, domain: config.domain,
        loggedIn: false, tenantMatches: true, candidateSearch: candidate.available,
        candidateDetail, jobSearch: false,
        candidateWriteForm: 'not_checked', currentUrl: job.url,
      };
    }

    let candidateWriteForm = 'not_checked';
    let finalUrl = job.url;
    if (includeWrite) {
      const form = await inspectPage(
        page,
        '/crm/candidate/add',
        '/crm/candidate/add',
        [
          '[data-test="field-edit:candidate$name"] input',
          '[data-testid="attachments"] input[type="file"]',
        ],
        '[data-test="field-edit:candidate$name"] input',
      );
      if (!form.loggedIn) {
        return {
          status: 'auth_required', checkedAt, tenant: config.tenant, domain: config.domain,
          loggedIn: false, tenantMatches: true, candidateSearch: candidate.available,
          candidateDetail, jobSearch: job.available,
          candidateWriteForm: 'unavailable', currentUrl: form.url,
        };
      }
      candidateWriteForm = form.available && form.matchedSelectors.length === 2
        ? 'available' : 'unavailable';
      finalUrl = form.url;
    }

    return {
      status: candidate.available && job.available ? 'ok' : 'partial',
      checkedAt,
      tenant: config.tenant,
      domain: config.domain,
      loggedIn,
      tenantMatches,
      candidateSearch: candidate.available,
      candidateDetail,
      jobSearch: job.available,
      candidateWriteForm,
      currentUrl: finalUrl,
    };
  } catch (error) {
    return {
      status: 'error',
      checkedAt,
      tenant: config.tenant,
      domain: config.domain,
      loggedIn: false,
      tenantMatches: false,
      candidateSearch: false,
      candidateDetail: 'unknown',
      jobSearch: false,
      candidateWriteForm: includeWrite ? 'unknown' : 'not_checked',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
