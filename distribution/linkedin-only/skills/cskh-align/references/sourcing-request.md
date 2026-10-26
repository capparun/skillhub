# SourcingRequest 交接协议

SourcingRequest 是 Align 与 Sourcing 之间唯一的执行交接对象。只有用户在 HTML 对齐报告生成后明确选择“开始搜索”，Align 才能创建它。

推荐保存路径：

```text
~/.hunter/output/align/{projectId}/sourcing-request.json
```

人读版寻访方案 HTML 与 JSON 同目录落盘，用户查看与确认一律使用 HTML：

```text
~/.hunter/output/align/{projectId}/sourcing-plan.html
```

## 必填字段

| 字段 | 约束 |
|---|---|
| `schemaVersion` | 当前固定为 `1` |
| `requestType` | 固定为 `hunter-sourcing` |
| `nextAction` | 固定为 `start_sourcing` |
| `projectId` | 与 Align 项目一致的稳定标识 |
| `alignResultPath` | 已确认 `align.json` 的路径 |
| `alignReportPath` | 已生成 `align.html` 的路径 |
| `startAuthorization` | 本次开始搜索授权；必须包含 `approved: true`、ISO-8601 `approvedAt` 和 `source: current_conversation` |
| `persona` | 用户确认后的人才画像 |
| `confirmedChannels` | 用户确认后的渠道列表 |
| `searchParameters` | Align 生成的平台中立搜索参数 |
| `channelPlans` | 每个已确认可执行渠道的寻访方案（search / filters / scoring 三层）；与 align.json 中的 `channelPlans` 一致 |

## 补充渠道的处理

`align.json` 可以包含 `channelStrategy.supplementary`，用于保存已确认的研究或关系网络建议。它们不属于可执行的 `confirmedChannels`，也不能据此自动启动浏览、搜索、抓取或外部触达。

## 接收方规则

`cskh-sourcing` 收到请求后：

1. 先验证 SourcingRequest 结构、确认状态和 `startAuthorization`。历史请求中的批准记录不能单独触发搜索；缺失或无法证明是本次连续流程授权时，返回 Align 刷新授权。
2. 把 Align 结果视为只读输入，不重复生成人才画像、渠道策略或寻访方案。执行时优先消费 `channelPlans` 中的平台原生 search 条件；filters / scoring 留给评估步骤在本地执行。
3. 由选中的平台 Skill 初始化和验证 OpenCLI、插件、登录态及搜索输出目录；分发器自身不执行平台环境检查。
4. 只执行 `confirmedChannels` 中受支持的渠道；`channelStrategy.supplementary` 只作为顾问工作计划，不执行。新增或替换渠道必须重新获得用户确认。
5. 搜索失败只更新 Sourcing 状态和日志，不得修改 Align 文件。
