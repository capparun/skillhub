/** Project saved facts for readers without guessing identity from page chrome. */
export function candidatePresentation(row) {
  const observations = row.observations ?? [];
  const lists = observations.filter(item => item.stage === 'list' || (!item.stage && row.identityStatus === 'unresolved')).map(item => item.data);
  // Membership snapshots are intentionally sparse. They prove group placement,
  // not a replacement recruiting profile. Keep the most recent search profile.
  const profiles = lists.filter(item => item?.collection !== 'favorites');
  const latest = profiles.at(-1) ?? lists.at(-1) ?? {};
  const detail = observations.filter(item => item.stage === 'detail' &&
    ['readable', 'partial'].includes(item.data?.status)).at(-1)?.data;
  const text = value => typeof value === 'string' ? value.trim() : '';
  return {
    name: text(latest.name).replace(/([*＊]+)\s*阅$/u,'$1') || '姓名待确认',
    position: text(latest.currentTitle) || text(latest.position),
    company: text(latest.currentCompany) || text(latest.company),
    city: text(latest.city),
    summary: text(latest.summary),
    detailState: detail?.status ?? 'unread',
    detailStatus: detail?.status === 'partial' ? '已读取部分可见详情' :
      detail ? '已读取可见详情' : '未读取可用详情',
    sections: (detail?.sections ?? []).filter(section =>
      text(section.heading) && text(section.text)).map(section => ({
      heading: section.heading, text: section.text,
    })),
  };
}
