# MCP 兼容预览版验收 2026-10-19

状态：未通过完整验收，未发布。

## 本轮真实动作

- 使用 /private/tmp/hunter-mcp-compat-030-alpha1-hardened，扩展 ID bbfgangndlmhofleiinbnhnebnbhceob。
- 通过 tools/liepin-mcp/server.mjs 创建测试页，填写嵌入式开发，选择 3–5 年，点击一次搜索。
- 23:44:53 浏览器动作返回 received；随后列表保存报错“列表结果缺少有效来源”。该错误来自本地 mergeListResults，不是白屏错误。
- 异常后停止，未打开详情、未翻页、未联系、未收藏、未解锁。未生成本轮真实候选人报告。
- 测试页已通过 liepin_close 关闭；原 Native Messaging 配置已逐字节恢复；兼容版停用，官方扩展已启用且 runtime.getManifest 返回 opencli-mcp 0.0.22。

## 修复及验证

- 修复 MCP js 参数 maxChars 超过上游 120000 上限的问题，并保留上游 isError 原始消息。
- 搜索引擎返回行写入任务前补齐 source=liepin，保持无稳定身份行的 unresolved 状态。
- 本地测试 12/12 通过；修复后未重放真实搜索，不将本地回归写成真实验收通过。
- 私有任务与动作记录位于 /private/tmp/hunter-mcp-alpha1-task.json、hunter-mcp-alpha1-events.jsonl，不纳入发布包。

## 架构修正

当前已安装 opencli-mcp 0.0.30 正式支持 Site Adapter，提供 opencli-mcp/adapter-sdk、tools.define/try/activate、site_run 及 sites.enable。猎聘下一版应优先评估此官方扩展接口，复用本地业务模块；当前独立 stdio server 仅为原型，不能称为唯一或最终架构。旧 OpenCLI 插件不能原样作为 MCP adapter 使用。Runtime 兼容扩展与业务 adapter 是两个独立层次。

后续验收必须覆盖详情展开、身份关联、恢复、正式 adapter 安装及报告；本轮没有这些证据。
