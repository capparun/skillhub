import { getConfig, buildUrl, openGlluePage, isLoggedIn, waitForLogin } from './auth.js';
import { hardGoto } from './navigation.js';
import { selectors } from './selectors.js';
import { ArgumentError, AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { randomDelay, saveJson, timestampedFilename, parseJobApplicationText, parsePipelineStatus } from './utils.js';

/**
 * Gllue 页面交互客户端
 */
export class GllueClient {
  constructor(page) {
    this.page = page;
    this.config = getConfig();
  }

  /**
   * 打开登录页并等待登录
   */
  async login(timeout = 300000) {
    await openGlluePage(this.page, this.config.paths.login);
    await waitForLogin(this.page, timeout);
    const url = await this.page.getCurrentUrl?.() || '';
    return { loggedIn: true, url };
  }

  /**
   * 检查登录态
   *
   * opencli 启动 browser 命令时通常先打开 domain 根路径（登录页），
   * 因此如果当前页面未登录，尝试跳转到 dashboard 再确认一次。
   */
  async checkAuth() {
    const config = getConfig();
    let loggedIn = await isLoggedIn(this.page);

    if (!loggedIn) {
      // 无论当前 URL 是什么，尝试进入 dashboard 以激活已有登录态
      await this.page.goto(buildUrl(config, config.paths.dashboard), { waitUntil: 'networkidle2' });
      await randomDelay(config.delays.pageLoad);
      loggedIn = await isLoggedIn(this.page);
    }

    if (!loggedIn) {
      throw new AuthRequiredError(config.domain, '未登录 Gllue，请先运行 opencli gllue login');
    }
    return loggedIn;
  }

  /**
   * 在候选人搜索页搜索
   *
   * 使用 Gllue 的 gql URL 参数进行搜索，例如：
   * /crm/candidate/list?gql=name__eq=xxx&type__eq=candidate&source=gllue&page=1
   */
  async searchCandidates({ keyword = '', fullText = '', scope = 'accessible', filters = {}, limit = 20 }) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new ArgumentError('limit 必须为正整数');
    if (!['mine', 'accessible'].includes(scope)) throw new ArgumentError('scope 必须为 mine 或 accessible');
    if (typeof fullText !== 'string' || (fullText && !fullText.trim())) throw new ArgumentError('fullText 必须为非空白字符串');
    if (fullText && (keyword || Object.keys(filters).length)) throw new ArgumentError('全文搜索不能与姓名、邮箱等身份条件混用');
    await this.checkAuth();

    const conditions = [];
    if (scope === 'mine') conditions.push('owner__eq={{user.id}}');
    if (fullText) conditions.push(`keyword__and=${fullText}`);

    // 优先使用结构化 filters
    if (filters.name) conditions.push(`name__eq=${filters.name}`);
    if (filters.email) conditions.push(`email__eq=${filters.email}`);
    if (filters.company) conditions.push(`company__eq=${filters.company}`);

    // 回退到 keyword：含 @ 视为邮箱，否则视为姓名
    if (!filters.name && !filters.email && !filters.company && keyword) {
      if (keyword.includes('@')) {
        conditions.push(`email__eq=${keyword}`);
      } else {
        conditions.push(`name__eq=${keyword}`);
      }
    }

    // 默认只搜候选人
    conditions.push('type__eq=candidate');
    conditions.push('source=gllue');

    // 对每个条件的 value 单独编码，再组合成 gql 查询字符串
    const gql = conditions.map((c) => {
      const [key, ...rest] = c.split('=');
      return `${key}=${encodeURIComponent(rest.join('='))}`;
    }).join('&');

    const searchParams = new URLSearchParams();
    searchParams.set('gql', gql);
    const s = selectors.candidateSearch;
    const parser = `(() => {
      const link = el.querySelector('a[href*="/crm/candidate/detail"]');
      const idMatch = link?.getAttribute('href')?.match(/[?&]id=(\\d+)/);
      const id = idMatch ? idMatch[1] : '';
      const name = link?.textContent?.trim() || '';

      // 使用页面字段语义，避免用户调整列顺序或插入操作列后读错值。
      const field = key => el.querySelector('[data-test="list-table-data-grid:candidate$' + key + '"]')?.textContent?.trim() || '';
      const company = field('company');
      const title = field('title');
      const status = field('status');
      const lastContact = field('lastContactDate');
      const owner = field('owner');
      const location = field('locations');
      const nationality = field('gllueextguoji');

      return { id, name, company, title, status, lastContact, owner, location, nationality };
    })()`;

    const candidates = [];
    const seenIds = new Set();
    let pagesRead = 0;
    let exhausted = false;
    while (candidates.length < limit) {
      const pageNumber = pagesRead + 1;
      searchParams.set('page', String(pageNumber));
      const url = buildUrl(this.config, `${this.config.paths.candidateSearch}?${searchParams.toString()}`);
      await this.page.goto(url, { waitUntil: 'networkidle2' });
      await this.page.wait({ selector: '[data-test="list-action:candidate$pagination"]', timeout: 10 });
      await randomDelay(this.config.delays.pageLoad);
      const rows = await this.collectRows(s.resultRow, limit - candidates.length, parser);
      const state = await this.page.evaluate(() => ({
        url: location.href,
        page: Number(document.querySelector('.rlt-pagination-item-active')?.textContent?.trim()),
        nextDisabled: document.querySelector('.rlt-pagination-next')?.getAttribute('aria-disabled') === 'true',
        total: Number(document.querySelector('.rlt-pagination-total-text')?.textContent?.match(/\d+/)?.[0])
      }));
      const actual = new URL(state.url);
      const expected = new URL(url);
      if (actual.origin !== expected.origin || actual.pathname !== expected.pathname ||
          actual.searchParams.get('gql') !== gql || Number(actual.searchParams.get('page')) !== pageNumber ||
          (state.page !== pageNumber && state.total !== 0)) {
        throw new CommandExecutionError('搜索页面或筛选条件不匹配，未保存不完整结果');
      }
      if ((!rows.length && state.total !== 0) || rows.some(row => !row.id || seenIds.has(row.id)) ||
          new Set(rows.map(row => row.id)).size !== rows.length) {
        throw new CommandExecutionError('分页结果异常：空页、缺失 ID 或重复候选人，未保存不完整结果');
      }
      // 当前页面实测每页 25 条。非末页少于本次请求量，说明列表可能仍在加载；
      // 不能继续翻页补齐 limit，否则会静默漏掉当前页尚未出现的候选人。
      if (!state.nextDisabled && rows.length < Math.min(25, limit - candidates.length)) {
        throw new CommandExecutionError('分页结果数量不完整：非末页候选人尚未加载完成，未保存');
      }
      for (const row of rows) seenIds.add(row.id);
      candidates.push(...rows);
      pagesRead++;
      exhausted = (state.nextDisabled || state.total === 0) && candidates.length === state.total;
      if ((state.nextDisabled || state.total === 0) && candidates.length !== Math.min(limit, state.total)) {
        throw new CommandExecutionError('分页结果数量不完整，与平台总数不一致；未保存');
      }
      if (state.nextDisabled || state.total === 0) break;
    }

    const result = {
      timestamp: new Date().toISOString(),
      keyword,
      fullText,
      scope,
      filters,
      limit,
      count: candidates.length,
      pagesRead,
      exhausted,
      candidates
    };

    const filePath = saveJson(this.config, 'candidates', timestampedFilename('candidates', 'json'), result);
    return { ...result, filePath };
  }

  /**
   * 从 LinkedIn URL 中提取 public identifier 作为补充关键词
   */
  extractLinkedInIdentifier(linkedinUrl) {
    if (!linkedinUrl) return '';
    try {
      const url = new URL(linkedinUrl);
      if (!['https:', 'http:'].includes(url.protocol) ||
          !(url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'))) return '';
      const parts = url.pathname.split('/').filter(Boolean);
      // 常见路径：/in/xxx 或 /in/xxx/details/...
      if (parts[0] === 'in' && parts[1]) {
        return parts[1];
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * 检查 LinkedIn profile 是否已存在于 Gllue 人才库
   *
   * 搜索策略（按优先级）：
   * 1. 邮箱精确匹配
   * 2. 姓名 + 公司 + 职位 同时匹配
   * 3. 姓名 + 公司 匹配
   * 4. 姓名匹配
   * 5. LinkedIn public identifier 补充搜索
   */
  async checkExists(profile, options = {}) {
    const threshold = options.threshold ?? 60;
    if (!Number.isSafeInteger(threshold) || threshold < 0 || threshold > 100) {
      throw new ArgumentError('threshold 必须是 0 到 100 的整数');
    }
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new ArgumentError('limit 必须是正整数');
    }
    const {
      name = '',
      email = '',
      company = '',
      title = '',
      linkedinUrl = ''
    } = profile;

    const linkedinIdentifier = this.extractLinkedInIdentifier(linkedinUrl);

    if (!String(name).trim() && !String(email).trim() && !linkedinIdentifier) {
      throw new ArgumentError('请至少提供姓名或邮箱，或有效 LinkedIn 个人链接；公司和职位只能辅助查重');
    }
    await this.checkAuth();

    const normalize = (str) => String(str || '').toLowerCase().replace(/[\s\-_.,–—]+/g, '').trim();
    const normalizedName = normalize(name);
    const normalizedCompany = normalize(company);
    const normalizedTitle = normalize(title);

    const searchQueries = [];

    // 1. 邮箱精确搜索
    if (email) {
      searchQueries.push({ filters: { email }, label: 'email' });
    }

    // 2. 姓名精确搜索
    if (name) {
      searchQueries.push({ filters: { name }, label: 'name' });
    }

    // 3. 姓名 + 公司 组合搜索
    if (name && company) {
      searchQueries.push({ filters: { name, company }, label: 'name+company' });
    }

    // 4. LinkedIn public identifier 补充搜索（作为 name）
    if (linkedinIdentifier && !searchQueries.some(q => q.label === 'name' && q.filters.name === linkedinIdentifier)) {
      searchQueries.push({ filters: { name: linkedinIdentifier }, label: 'linkedin-id' });
    }

    const allResults = [];

    for (const query of searchQueries) {
      try {
        const result = await this.searchCandidates({ filters: query.filters, limit });
        for (const candidate of result.candidates) {
          const candidateName = normalize(candidate.name);
          const candidateCompany = normalize(candidate.company);
          const candidateTitle = normalize(candidate.title);

          let confidence = 0;
          const reasons = [];

          // 列表未回显邮箱时只能确认筛选返回了该记录，不能确认邮箱值相等。
          if (query.label === 'email') {
            confidence = 60;
            reasons.push('邮箱筛选返回，列表未回显邮箱，需详情复核');
          }

          // 姓名匹配
          if (normalizedName && candidateName) {
            if (candidateName === normalizedName) {
              confidence = Math.max(confidence, 60);
              reasons.push('姓名完全匹配');
            } else if (candidateName.includes(normalizedName) || normalizedName.includes(candidateName)) {
              confidence = Math.max(confidence, 45);
              reasons.push('姓名部分匹配');
            }
          }

          // 公司匹配
          if (normalizedCompany && candidateCompany) {
            if (candidateCompany === normalizedCompany) {
              confidence = Math.min(confidence + 25, 95);
              reasons.push('公司完全匹配');
            } else if (candidateCompany.includes(normalizedCompany) || normalizedCompany.includes(candidateCompany)) {
              confidence = Math.min(confidence + 15, 85);
              reasons.push('公司部分匹配');
            }
          }

          // 职位匹配
          if (normalizedTitle && candidateTitle) {
            if (candidateTitle === normalizedTitle) {
              confidence = Math.min(confidence + 15, 95);
              reasons.push('职位完全匹配');
            } else if (candidateTitle.includes(normalizedTitle) || normalizedTitle.includes(candidateTitle)) {
              confidence = Math.min(confidence + 10, 90);
              reasons.push('职位部分匹配');
            }
          }

          const match = {
            ...candidate,
            confidence,
            identityConfirmed: false,
            reviewRequired: true,
            matchedQueries: [query.label],
            reasons: reasons.length ? reasons : ['无强匹配特征'],
            exists: confidence >= threshold
          };
          const previous = allResults.find(row => row.id === candidate.id);
          if (previous) {
            previous.confidence = Math.max(previous.confidence, confidence);
            previous.exists = previous.exists || match.exists;
            previous.matchedQueries = [...new Set([...previous.matchedQueries, query.label])];
            previous.reasons = [...new Set([...previous.reasons, ...match.reasons])];
          } else {
            allResults.push(match);
          }
        }
      } catch (e) {
        // Incomplete evidence must never authorize creating a duplicate.
        throw new Error(`查重查询失败 (${query.label})，不能判定为未找到：${e.message}`, { cause: e });
      }
    }

    // 按置信度排序
    allResults.sort((a, b) => b.confidence - a.confidence);

    const exists = allResults.some(r => r.exists);
    const bestMatch = allResults[0] || null;

    const output = {
      timestamp: new Date().toISOString(),
      input: { name, email, company, title, linkedinUrl },
      status: allResults.length ? 'review_required' : 'no_match_in_scope',
      exists,
      totalChecked: allResults.length,
      threshold,
      bestMatch,
      matches: allResults
    };

    const filePath = saveJson(this.config, 'candidates', timestampedFilename('duplicate-check', 'json'), output);
    return { ...output, filePath };
  }

  /**
   * 搜索职位
   */
  async searchJobs({ keyword = '', limit = 20 }) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new ArgumentError('limit 必须为正整数');
    await this.checkAuth();
    await openGlluePage(this.page, this.config.paths.jobSearch);
    await randomDelay(this.config.delays.pageLoad);

    const s = selectors.jobSearch;

    const parser = `(() => {
      const gc = (sel) => el.querySelector(sel)?.textContent?.trim().replace(/\\s+/g, ' ') || '';

      const link = el.querySelector('a[href*="/crm/joborder/detail"]');
      const idMatch = link?.getAttribute('href')?.match(/[?&]id=(\\d+)/);
      const id = idMatch ? idMatch[1] : '';

      const title = gc('[data-test="list-table-data-grid:joborder\\$jobTitle"]');
      const client = gc('[data-test="list-table-data-grid:joborder\\$client"]');
      const status = gc('[data-test="list-table-data-grid:joborder\\$jobStatus"]');
      const livedays = gc('[data-test="list-table-data-grid:joborder\\$livedays"]');
      const cvsent = gc('[data-test="list-table-data-grid:joborder\\$cvsent_count"]');
      const interviews = gc('[data-test="list-table-data-grid:joborder\\$clientinterview_count"]');

      return { id, title, client, status, livedays, cvsent, interviews };
    })()`;

    // 保留平台默认范围；关键词在逐页读取的标题/客户内过滤。
    const normalizedKw = keyword.toLowerCase().trim();
    const expected = new URL(buildUrl(this.config, this.config.paths.jobSearch));
    const readJobListState = () => this.page.evaluate(() => ({
      url: location.href,
      page: Number(document.querySelector('.rlt-pagination-item-active')?.textContent?.trim()),
      nextDisabled: document.querySelector('[data-test="list-action:joborder$pagination"] li.rlt-pagination-item.rlt-pagination-icon:last-child')?.classList.contains('rlt-pagination-item-disabled') === true,
      total: Number(document.querySelector('.rlt-pagination-total-text')?.textContent?.replace(/,/g, '').match(/\d+/)?.[0])
    }));
    const waitForJobListPage = async (pageNumber, lockedScope) => {
      let state = null;
      for (let attempt = 0; attempt < 40; attempt++) {
        state = await readJobListState();
        let observed;
        try { observed = new URL(state.url); } catch { /* 继续等待或统一失败 */ }
        if (observed?.origin === expected.origin && observed.pathname === expected.pathname &&
            Number(observed.searchParams.get('page')) === pageNumber && state.page === pageNumber &&
            Number.isSafeInteger(state.total) && state.total >= 0 &&
            (lockedScope === undefined || observed.searchParams.get('gql') === lockedScope)) return state;
        if (attempt < 39) await randomDelay(this.config.delays.readiness || [0, 0]);
      }
      return state;
    };
    // SPA 会在分页容器出现后继续异步补上默认筛选和页码；必须等待页面状态
    // 真正可读，不能用入口 URL（无 gql/page）锁定后续分页契约。
    const initialState = await waitForJobListPage(1);
    let base;
    try { base = new URL(initialState?.url); } catch { /* 下方统一拒绝 */ }
    if (!base || base.origin !== expected.origin || base.pathname !== expected.pathname ||
        Number(base.searchParams.get('page')) !== 1 || initialState?.page !== 1 ||
        !Number.isSafeInteger(initialState?.total) || initialState.total < 0) {
      throw new CommandExecutionError(`职位列表默认筛选或分页尚未稳定，未保存（网址 ${initialState?.url || 'unknown'}，网址页 ${base?.searchParams.get('page') || 'unknown'}，显示页 ${initialState?.page ?? 'unknown'}，总数 ${initialState?.total ?? 'unknown'}）`);
    }
    const scopeGql = base.searchParams.get('gql');
    const filtered = [];
    const seen = new Set();
    let pagesRead = 0;
    let exhausted = false;
    let lastPageClick = null;
    while (filtered.length < limit) {
      const pageNumber = pagesRead + 1;
      if (pageNumber > 1) {
        // 默认范围含 {{user.id}} 模板，直接改 URL 翻页会得到 0 条；必须使用页面
        // 下一页动作，让 SPA 保留已经解析的用户范围。分页 DOM 会先于事件绑定
        // 出现，因此在首次翻页前再等待一次页面稳定窗口。
        if (pageNumber === 2) await randomDelay(this.config.delays.pageLoad);
        lastPageClick = await this.page.evaluate(() => {
          const next = document.querySelector('[data-test="list-action:joborder$pagination"] ul.rlt-pagination > li.rlt-pagination-item.rlt-pagination-icon:nth-of-type(2)');
          if (!next || next.classList.contains('rlt-pagination-item-disabled')) return { clicked: false, reason: 'missing_or_disabled' };
          next.click();
          return { clicked: true, click_method: 'dom', hit: 'target' };
        }, { action: 'next_job_page' });
        if (!lastPageClick?.clicked) throw new CommandExecutionError(`职位下一页不可用，未保存（${lastPageClick?.reason || 'unknown'}）`);
        const navigated = await waitForJobListPage(pageNumber, scopeGql);
        let navigatedUrl;
        try { navigatedUrl = new URL(navigated?.url); } catch { /* 下方统一拒绝 */ }
        if (!navigatedUrl || Number(navigatedUrl.searchParams.get('page')) !== pageNumber || navigated?.page !== pageNumber) {
          throw new CommandExecutionError(`职位下一页未到达请求页 ${pageNumber}，未保存（网址页 ${navigatedUrl?.searchParams.get('page') || 'unknown'}，显示页 ${navigated?.page ?? 'unknown'}，范围一致 ${navigatedUrl?.searchParams.get('gql') === scopeGql}，点击方式 ${lastPageClick?.click_method || 'unknown'}，命中 ${lastPageClick?.hit || 'unknown'}）`);
        }
        await randomDelay(this.config.delays.pageLoad);
      }
      const rows = await this.collectRows(s.resultRow, Number.MAX_SAFE_INTEGER, parser);
      const state = await readJobListState();
      const actual = new URL(state.url);
      if (actual.origin !== expected.origin || actual.pathname !== expected.pathname || actual.searchParams.get('gql') !== scopeGql ||
          Number(actual.searchParams.get('page')) !== pageNumber || !Number.isSafeInteger(state.total) || state.total < 0 ||
          (state.total !== 0 && state.page !== pageNumber)) throw new CommandExecutionError(`职位分页或筛选范围不匹配，未保存（请求页 ${pageNumber}，网址页 ${actual.searchParams.get('page')}，显示页 ${state.page}，总数 ${state.total}，范围一致 ${actual.searchParams.get('gql') === scopeGql}）`);
      if ((!rows.length && state.total !== 0) || rows.some(row => !row.id || seen.has(row.id)) ||
          new Set(rows.map(row => row.id)).size !== rows.length) throw new CommandExecutionError('职位分页为空、缺失 ID 或重复，未保存');
      for (const row of rows) seen.add(row.id);
      const matches = normalizedKw ? rows.filter(j => j.title.toLowerCase().includes(normalizedKw) || j.client.toLowerCase().includes(normalizedKw)) : rows;
      filtered.push(...matches.slice(0, limit - filtered.length));
      pagesRead++;
      exhausted = state.nextDisabled || state.total === 0;
      if (seen.size > state.total || (exhausted && seen.size !== state.total)) {
        throw new CommandExecutionError(`职位分页数量不完整，未保存（请求页 ${pageNumber}，已扫描 ${seen.size}，平台总数 ${state.total}，末页 ${exhausted}）`);
      }
      if (exhausted) break;
    }

    const result = {
      timestamp: new Date().toISOString(),
      keyword,
      limit,
      count: filtered.length,
      jobs: filtered,
      pagesRead,
      scannedCount: seen.size,
      exhausted,
      scopeGql,
      searchMode: 'local_title_client'
    };

    const filePath = saveJson(this.config, 'jobs', timestampedFilename('jobs', 'json'), result);
    return { ...result, filePath };
  }

  /**
   * 查看候选人详情
   */
  async getCandidate(id) {
    if (!/^\d+$/.test(String(id))) throw new Error('候选人 ID 必须是数字');
    await this.checkAuth();
    const url = buildUrl(this.config, `${this.config.paths.candidateDetail}?id=${id}`);
    // 只信页面实际 location,不信 bridge 缓存的请求 URL;同 URL 时 SPA 软导航
    // 不重新拉取数据,必须整页刷新(见 lib/navigation.js,2026-09-28 实测陈旧快照)。
    await hardGoto(this.page, url);
    // 3.6.39.5 首访详情渲染慢至 8s+（2026-10-04 实测 10s 超时），放宽到 30s
    await this.page.wait({ selector: '[data-test="detail-name:candidate"]', timeout: 30 });
    await randomDelay(this.config.delays.pageLoad);

    const detail = await this.page.evaluate(() => {
      const getText = (sel) => {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
      };
      const getField = (fieldName) => {
        const el = document.querySelector(`[data-test="detail-card-field:candidate$${fieldName}"]`)
          || document.querySelector(`[data-test="detail-field:candidate$${fieldName}"]`);
        if (!el) return '';
        const label = el.querySelector('label');
        let text = el.textContent.trim().replace(/\s+/g, ' ');
        if (label) {
          text = text.replace(label.textContent.trim(), '').trim();
        }
        return text;
      };

      // 状态标签在顶部 .candidate-icons 区域
      const readSections = (kind, anchor, fields) => Array.from(document.querySelectorAll(
        `[data-test="detail-field:${kind}$${anchor}"]`
      )).map(el => {
        const block = kind === 'candidateeducation'
          ? el.closest('.slds-col.dark-blue-600')
          : el.closest('.reverse-fk-item-block');
        const record = {};
        for (const field of fields) {
          const node = block?.querySelector(`[data-test="detail-field:${kind}$${field}"]`);
          record[field] = node?.innerText?.trim() || '';
        }
        return record;
      });
      const contact = field => {
        const observed = document.querySelector(`[data-test="detail-card-field:candidate$${field}"]`)
          || document.querySelector(`[data-test="detail-field:candidate$${field}"]`);
        if (!observed) return { value: '', status: 'not_observed' };
        const raw = getField(field);
        const hidden = /查看|显示|解锁/.test(raw);
        return { value: hidden ? '' : raw, status: hidden ? 'not_expanded' : raw ? 'visible_unverified' : 'missing' };
      };
      const tagEls = document.querySelectorAll('.candidate-icons .rlt-tag-content-wrapper[title]');
      const tags = Array.from(tagEls).map(el => el.getAttribute('title') || el.textContent.trim()).filter(Boolean);

      // 投递记录（右侧边栏）
      const container = document.querySelector('.apply-history-sidebar, .apply-events-render');
      let rawJobText = '';
      let rawStepData = { totalSteps: 0, currentStep: 0, completedSteps: 0, stepLabels: [] };
      if (container) {
        const jobTextEl = container.querySelector('.apply-history__select--text');
        if (jobTextEl) {
          const spans = jobTextEl.querySelectorAll('span');
          rawJobText = Array.from(spans).map(s => s.textContent.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ');
        }

        const segments = container.querySelectorAll('.mysteps-step-segment');
        const stepCircles = container.querySelectorAll('.mysteps-step-circle');
        let cs = 0, cur = 0;
        stepCircles.forEach((circle, idx) => {
          if (circle.classList.contains('mysteps-step-circle--prev')) cs++;
          if (circle.classList.contains('mysteps-step-circle--current')) cur = idx + 1;
        });
        rawStepData = {
          totalSteps: segments.length,
          currentStep: cur,
          completedSteps: cs,
          stepLabels: Array.from(container.querySelectorAll('.mysteps-label')).map(el => el.textContent.trim())
        };
      }

      return {
        name: getText('[data-test="detail-name:candidate"]'),
        phone: contact('mobile').value,
        email: contact('email').value,
        wechat: contact('gllueextwechat').value,
        skype: contact('gllueextskype').value,
        contactStatus: { phone: contact('mobile').status, email: contact('email').status,
          wechat: contact('gllueextwechat').status, skype: contact('gllueextskype').status },
        lastContact: getField('lastContactDate'),
        contactRecords: Array.from(document.querySelectorAll('[data-test="detail-field:note$content"]')).map(el => {
          const block = el.closest('.detail-form');
          const field = name => block?.querySelector(`[data-test="detail-field:note$${name}"]`)?.innerText?.trim() || '';
          return { content: el.innerText?.trim() || '', date: field('date'), author: field('noteuser_set') };
        }),
        contactRecordsScope: 'rendered_only',
        experience: readSections('candidateexperience', 'company_name', ['company_name', 'title', 'time', 'description']),
        education: readSections('candidateeducation', 'school', ['school', 'major', 'degree', 'time']),
        readingScope: 'rendered_standard_resume',
        originalResumeEntry: (() => {
          const tabs = Array.from(document.querySelectorAll('.resume-tab-button'));
          const index = tabs.findIndex(el => /原始简历/.test(el.innerText));
          if (index < 0) return null;
          const count = tabs[index].innerText.match(/\d+/)?.[0];
          return { index, count: count === undefined ? null : Number(count) };
        })(),
        observedUrl: location.href,
        projectCount: (() => {
          const text = document.querySelector('[data-test="detail-tab$项目"]')?.textContent || '';
          const count = text.match(/\d+/)?.[0];
          return count === undefined ? null : Number(count);
        })(),
        company: getField('company'),
        title: getField('title'),
        location: getText('.location'),
        // 2026-09-29 全字段更新对齐：详情读取补齐 compare/update 新字段族
        // （依据 docs/test-records/gllue-update-field-audit-20260929.md 审计的
        // detail-field 选择器；nationality 弹窗字段名是 countries，对齐以它为准）
        // 注意：候选人「渠道」属性输出为 sourceChannel——envelope 的 channel 字段
        // 是记录来源渠道（channel: 'gllue'，hunter core 合并/身份判别依赖），两者不能撞名
        gender: getField('gender'),
        nationality: getField('countries'),
        industry: getField('industrys'),
        function: getField('functions'),
        sourceChannel: getField('gllueextChannel'),
        highestDegree: getField('gllueexthighestdegree'),
        certificate: getField('gllueextcertification'),
        city: getField('citys'),
        salary: getField('currentSalary') || getField('expectedSalary'),
        status: tags[0] || '',
        owner: getField('owner'),
        tags,
        rawJobText,
        rawStepData
      };
    });

    // 与字段同次采集网址，防止采集过程中切页后仍用请求网址冒充来源。
    let observed;
    try { observed = new URL(detail.observedUrl); } catch { /* 下方统一拒绝 */ }
    const expected = new URL(url);
    if (!observed || observed.origin !== expected.origin ||
        observed.pathname !== expected.pathname || observed.searchParams.get('id') !== String(id)) {
      throw new CommandExecutionError('详情页面身份不匹配，无法确认目标候选人；未保存');
    }

    // 用纯函数解析投递记录
    const parsedText = parseJobApplicationText(detail.rawJobText);
    const pipeline = parsePipelineStatus(detail.rawStepData.completedSteps, detail.rawStepData.currentStep, detail.rawStepData.totalSteps);
    let applyHistory = detail.rawJobText ? [{
      ...parsedText,
      ...detail.rawStepData,
      pipelineLabel: pipeline.label
    }] : [];

    const projectContext = { readStatus: 'unknown', expectedCount: detail.projectCount ?? null,
      activeState: 'unknown', scope: 'rendered_project_tab' };
    // Only the read-only tab is opened; never the similarly named association action.
    if (Number.isSafeInteger(detail.projectCount) && detail.projectCount > 0) {
      try {
        await this.page.click('[data-test="detail-tab$项目"]');
        await this.page.wait({ selector: '.jobsubmission-card-header', timeout: 10 });
        const snapshot = await this.page.evaluate(() => ({
          url: location.href,
          selected: !!document.querySelector('[data-test="detail-tab$项目"].slds-active'),
          projects: Array.from(document.querySelectorAll('.jobsubmission-card-header')).map(header => {
            const link = header.querySelector('a[href*="/crm/joborder/detail"]');
            const card = header.closest('.slds-card');
            return { jobId: link ? new URL(link.href).searchParams.get('id') : null,
              title: link?.textContent.trim() || '', url: link?.href || '',
              stageLabel: card?.querySelector('.mysteps-label')?.textContent.trim() || '',
              currentStep: Array.from(card?.querySelectorAll('.mysteps-step-circle') || [])
                .findIndex(el => el.classList.contains('mysteps-step-circle--current')) + 1 };
          })
        }));
        const source = new URL(snapshot.url);
        const rows = snapshot.projects;
        const valid = snapshot.selected && source.origin === expected.origin &&
          source.pathname === expected.pathname && source.searchParams.get('id') === String(id) &&
          Array.isArray(rows) && rows.length === detail.projectCount &&
          new Set(rows.map(row => row.jobId)).size === rows.length && rows.every(row => {
            const target = new URL(row.url);
            return /^\d+$/.test(row.jobId) && row.title && target.origin === expected.origin &&
              target.pathname === '/crm/joborder/detail' && target.searchParams.get('id') === row.jobId;
          });
        if (valid) {
          applyHistory = rows;
          projectContext.readStatus = 'complete';
        } else {
          projectContext.readStatus = 'incomplete';
          projectContext.reason = 'snapshot_not_verified';
        }
      } catch {
        projectContext.readStatus = 'incomplete';
        projectContext.reason = 'read_failed';
      }
    }

    const appliedJob = parsedText.jobTitle;
    const pipelineStep = pipeline.label;
    const { rawJobText, rawStepData, ...cleanDetail } = detail;
    const result = {
      id, url, ...cleanDetail, applyHistory, projectContext, appliedJob, pipelineStep,
      hunterId: `gllue:${observed.host}:${String(id)}`,
      channel: 'gllue',
      sources: ['gllue'],
      profileUrl: url,
      sourceRecord: { candidateId: String(id), origin: observed.origin, readAt: new Date().toISOString() }
    };

    if (!result.name) {
      throw new CommandExecutionError(`候选人详情为空，无法确认 ${id} 的读取结果；未保存`);
    }

    result.attachments = { originalResumeCount: detail.originalResumeEntry?.count ?? null, contentRead: false };
    delete result.originalResumeEntry;

    // 项目标签加载可能把同一浏览器标签重定向到登录页；不能把此前的 DOM 快照保存为成功读取。
    if (!await isLoggedIn(this.page)) {
      throw new AuthRequiredError(this.config.domain, '读取候选人期间 Gllue 会话失效；未保存结果');
    }

    const filePath = saveJson(this.config, 'candidates', `candidate_${id}.json`, result);
    return { ...result, filePath };
  }

  /**
   * 查看职位详情
   */
  async getJob(id) {
    await this.checkAuth();
    const url = buildUrl(this.config, `${this.config.paths.jobDetail}?id=${id}`);
    await hardGoto(this.page, url);
    await randomDelay(this.config.delays.pageLoad);

    // 点击"详情" tab 以触发字段渲染
    await this.page.evaluate(() => {
      const tab = document.querySelector('[data-test="detail-tab$\u8be6\u60c5"] a');
      if (tab) tab.click();
    });
    await randomDelay(this.config.delays.click);

    const detail = await this.page.evaluate(() => {
      const gf = (fieldName) => {
        const el = document.querySelector(`[data-test="detail-field:joborder$${fieldName}"]`);
        if (!el) return '';
        const container = el.querySelector('.field-container');
        return container ? container.textContent.trim().replace(/\s+/g, ' ') : '';
      };
      const getName = () => {
        const el = document.querySelector('[data-test="detail-name:joborder"]');
        return el ? el.textContent.trim().replace(/\s+/g, ' ') : '';
      };

      return {
        title: getName(),
        observedUrl: location.href,
        client: gf('client'),
        location: gf('citys'),
        salary: gf('annualSalary'),
        status: gf('jobStatus'),
        description: gf('description'),
        function: gf('function'),
        openDate: gf('openDate'),
        closeDate: gf('closeDate'),
        priority: gf('priority'),
        owner: gf('joborderuser_set')
      };
    });

    let observed;
    try { observed = new URL(detail.observedUrl); } catch { /* 下方统一拒绝 */ }
    const expected = new URL(url);
    if (!observed || observed.origin !== expected.origin || observed.pathname !== expected.pathname ||
        observed.searchParams.get('id') !== String(id)) {
      throw new CommandExecutionError('职位详情页面身份不匹配，未保存');
    }
    const result = { id, url, ...detail };

    if (!result.title || (!result.client && !result.location && !result.salary && !result.description)) {
      throw new CommandExecutionError(`职位 ${id} 详情为空或未加载，未保存；不能据此认定职位不存在`);
    }

    const filePath = saveJson(this.config, 'jobs', `job_${id}.json`, result);
    return { ...result, filePath };
  }

  /**
   * 通用行采集
   *
   * 使用 page.evaluate 在浏览器上下文中查询和解析行，
   * 因为 opencli 的 page wrapper 不支持 Puppeteer 的 $$ 方法。
   */
  async collectRows(rowSelector, limit, parseJsBody) {
    const rows = await this.page.evaluate(({ selector, maxRows, parser }) => {
      const elements = Array.from(document.querySelectorAll(selector)).slice(0, maxRows);
      return elements.map((el) => {
        const fn = new Function('el', 'return ' + parser);
        return fn(el);
      });
    }, { selector: rowSelector, maxRows: limit, parser: parseJsBody });

    return rows.filter((r) => r.id || r.name || r.title);
  }
}

export default GllueClient;
