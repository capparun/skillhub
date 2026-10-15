/**
 * 详情页导航助手:不信任 SPA 同 URL 软导航。
 *
 * OpenCLI 的 goto 在目标地址与当前地址相同时不会整页重载,SPA 也不会
 * 重新拉取数据,DOM 会一直停留在旧快照(2026-09-28 实测:写入 16 分钟后
 * 同一持久标签仍读出写入前的旧值,而新开标签立即可见新值)。因此同 URL
 * 时必须显式 location.reload() 并确认新文档就绪;确认不了宁可抛错,
 * 也不让调用方把陈旧快照当成真实回读。
 *
 * 注意:这与 2026-09-28 早上"已在目标页时避免整页重载"的风控缓解方向相反。
 * 当时的规避只证明了"软导航也能读",从未证明整页重载会触发退登;而陈旧
 * 快照的危害已在真实写入验收中实测发生,正确性优先。
 */
export async function hardGoto(page, url, {
  waitUntil = 'networkidle2',
  timeoutSec = 15,
  intervalMs = 250,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  let currentUrl = '';
  try {
    currentUrl = await page.evaluate(() => location.href, { hardGoto: 'currentUrl' });
  } catch { /* 读不到当前地址就按普通导航处理 */ }
  if (currentUrl !== url) {
    await page.goto(url, { waitUntil });
    return { hardReload: false, confirmed: false };
  }

  let navStart = null;
  try {
    navStart = await page.evaluate(() => performance.timeOrigin, { hardGoto: 'navStart' });
  } catch { /* 拿不到文档纪元代时就退化为不确认的刷新 */ }
  try {
    await page.evaluate(() => location.reload(), { hardGoto: 'reload' });
  } catch { /* 重载会销毁旧文档上下文,evaluate 报错属预期 */ }
  if (typeof navStart !== 'number') {
    return { hardReload: true, confirmed: false };
  }

  const deadline = Date.now() + timeoutSec * 1000;
  for (;;) {
    await sleep(intervalMs);
    let state = null;
    try {
      state = await page.evaluate(
        () => ({ t: performance.timeOrigin, ready: document.readyState }),
        { hardGoto: 'poll' }
      );
    } catch { /* 新文档加载期间上下文不可用,继续等待 */ }
    if (state && typeof state.t === 'number' && state.t !== navStart &&
        state.ready && state.ready !== 'loading') {
      return { hardReload: true, confirmed: true };
    }
    if (Date.now() >= deadline) break;
  }
  throw new Error('同 URL 整页刷新后未观察到新文档;放弃读取以免把陈旧快照当成真实数据');
}
