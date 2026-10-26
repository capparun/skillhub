/**
 * Google X-Ray 结果归一化
 * 不消耗 LinkedIn CUL、不需要 LinkedIn 登录态的候选人发现路径。
 * 仅用于解析用户可复核的 Google 首页结果，不做大规模抓取。
 * 搜索本身由 Skill 编排 opencli google search 完成，这里只负责把
 * 搜索结果 JSON 归一化为候选人档案。
 */

/**
 * 过滤并归一化 opencli google search --format json 的返回项。
 * 非 LinkedIn URL、空 URL、重复 profileId 均被剔除；按 limit 截断。
 * @param {Array} items - google search 的 JSON 返回数组
 * @param {number} [limit]
 * @returns {Array<{profileId: string, profileUrl: string, snippetTitle: string, snippet: string}>}
 */
export function filterGoogleSearchResults(items, limit = 100) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const results = [];
  // Public profile identifiers are the first path segment after /in/. Google
  // may return a locale-suffixed URL such as /in/<slug>/en; that suffix is not
  // part of the profile identifier and must not reach downstream commands.
  const linkedinRe = /^(https?:\/\/[a-z]{2,3}\.linkedin\.com)\/in\/([^/?#]+)(?:\/[^?#]*)?\/?(?:[?#].*)?$/i;

  for (const item of items) {
    if (results.length >= limit) break;
    const url = item?.url || '';
    const m = url.match(linkedinRe);
    if (!m) continue;
    const profileId = decodeURIComponent(m[2]).replace(/\/+$/, '');
    if (!profileId || seen.has(profileId)) continue;
    seen.add(profileId);
    results.push({
      profileId,
      profileUrl: `${m[1]}/in/${encodeURIComponent(profileId)}`,
      snippetTitle: item.title || '',
      snippet: item.snippet || '',
    });
  }
  return results;
}
