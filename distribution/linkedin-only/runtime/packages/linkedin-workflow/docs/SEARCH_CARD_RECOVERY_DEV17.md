> 后续进展：dev.18纯关键词人员搜索与游标续读已通过真实CLI验收，见docs/SEARCH_REPAIR_DEV18.md；高级筛选与公司搜索仍未在此次复验。以下为dev.17历史记录，不能作为当前完整能力结论。

> 状态更正（2026-10-25）：本文早期局部成功不等于完整验收。后续完整预检与采集仍有失败，当前未稳定修复；“后续调用默认回到后台”的归因未获证实，OpenCLI 2.0.1源码默认foreground。以workflow-runs/search-repair-review/single-page-diagnostic.html为最新证据说明。

# 人员搜索空卡片恢复修复（dev.17）

问题：搜索页显示479条结果，但采集器只读到空卡片容器，最终 page_incomplete、0条。不能把它解释为无匹配结果。原始失败没有可见性快照，无法断言每次失败都由隐藏页面造成；复测确认隐藏页面/延迟卡片是一条可复现故障路径，原选择器在正常页面有效。

修复：连续两次未取得卡片时，隐藏页面激活本次自有标签，并在后续读取和滚动中保持 foreground；可见页面仅重新进入同一已验证查询一次。每类恢复最多一次，之后仍失败则明确报告中断。每帧继续校验账号、查询、页码，不绕过任何检查。新增 visibility、slot_count、readable_slots 诊断。恢复流程不返回首页。

验证：236项本地测试通过。真实浏览器受控注入前两帧空卡片，分别验证查询重入和自有标签激活后均采集1条；注入仅修改测试返回帧，不修改平台DOM。完整原生 opencli hunter-linkedin salesnav-lead-search 同账号同关键词 limit=1 成功返回1条，无interruption，stop_reason=result_limit，自有会话关闭。

边界：limit=1 表示按请求提前停止，completeness=partial、truncated=true是正确语义，不代表此次失败。479条没有全部采集。完整调用仍含账号预检（本次6次open、2次首页），本补丁没有消除这部分开销，也没有证明比上游快。未测试发送、邀请或所有高级筛选组合。

本地私有证据：.local/search-card-fix/final-live.json、activation-live.json、recovery-live.json、tests-final.log。不纳入发布包或Git。

## 连接诊断补充修复

BROWSER_CONNECT 映射为 bridge_unreachable，表示当前执行环境无法访问本机服务，不推断扩展断连。doctor 在服务不可达、超时或未知桥接错误时提示检查服务和执行权限；只有查明指定 Profile 不在线才提示连接该 Profile。账号预检保留底层连接原因，人员/公司搜索将该原因传至 CLI，避免被 account_unconfirmed 覆盖。显式 Profile 校验继续拒绝其他在线账号替代；全局默认配置不做修改。

新增服务不可达与错误账号回退回归用例。239项测试通过；实际插件 doctor 指定当前 Profile 返回 selected_profile_connected、ready_for_account_check=true。本轮诊断未打开浏览器页面。执行环境的权限限制本身不能由插件自动解除；Skill 已要求在授权执行环境中验证，禁止把受限环境失败直接归咎于用户未连接。
