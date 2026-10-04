/** 卡片与向导共用产品发布状态；独立 CLI 包不能替代产品发布记录。 */
export type ReleaseState = "loading" | "ready" | "error";
export function releaseLabel(state: ReleaseState, release?: { version: string } | null): string {
  if (state === "loading") return "正在获取版本";
  if (state === "error") return "暂时无法获取版本";
  return release ? `已发布 · v${release.version}` : "尚未发布";
}
