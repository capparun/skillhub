# 猎聘寻访：官方 Site Adapter + Skill

帮助招聘顾问把已确认岗位要求转成搜索方案，在猎聘核实候选人的可见资料，并按授权收藏到准确分组。交付包含重点评估摘要、平台工作台和可追溯的原始证据。

当前为 **0.3.0 未发布候选**。版本和文件校验以包内 `manifest.json` 为准；安装、浏览器连接和业务验收分别判断。Windows 真机和目标 AI 客户端首次任务尚未完成，不把 macOS 证据外推。

## 从哪里开始

1. 按 [安装指南](INSTALL.md) 安装候选，保留安装回执和回滚文件。
2. 配置回执提供的一个 `opencli-mcp` 服务，并让助手发现 `hunter-liepin-mcp` Skill。不另配独立 Hunter 业务 MCP，也不要求全局安装 OpenCLI CLI。
3. Chrome 登录猎聘猎头端，保持已核验的单一兼容扩展启用。通过 Adapter `tabs` 与 `bind` 核对已有页面；需要新搜索工作页时使用 `connect(new_workspace:true)`。
4. 给出 JD、可接受例外、寻访范围及目标收藏分组。先探索关键词和真实筛选取值，再执行有界试搜。
5. 查看评估摘要中的跟进依据、准确分组确认、缺口及覆盖范围。收藏表示值得沟通，不表示全部资格已确认或最终录用。

## 分层与入口

| 层 | 入口 | 职责 |
| --- | --- | --- |
| Skill | `tools/liepin-mcp/skill/hunter-liepin-mcp/SKILL.md` | 需求、关键词、轮次、证据判断、反馈和交付编排 |
| 浏览器 Adapter | 官方 `sites` 中的 `liepin` | 13 个入口：tabs、bind、connect、prepare、search、results、current-detail、open-detail、detail-batch、saved-search、favorite、favorite-list、favorites |
| 本地工具 | 安装回执中的 `localCommand` | conditions、doctor、create、task、report；不为评估与导出建立浏览器连接 |
| 共享业务库 | `distribution/liepin-search/runtime/packages/liepin/lib/` | 筛选、任务、身份、队列、预算、恢复、评估和报告 |
| 连接组件 | 锁定的 opencli-mcp 及隔离兼容补丁 | 同会话标签生命周期及连接兼容；详见 [架构说明](ARCHITECTURE-DECISION.md) |

在候选包根目录可运行 `node tools/liepin-mcp/local.mjs conditions`；安装后使用回执的绝对路径与参数数组，不依赖当前目录或全局命令。

## 完整业务闭环

**确认标准及目标组 → 探索关键词与平台筛选 → 搜索与列表复核 → 按需要读取详情 → 逐条件证据核对 → 授权内收藏 → 目标组独立回读 → 重点交付与反馈。**

- 平台可准确表达的要求进入每轮筛选。单一“5–10年”不冒充“5年以上”；已批准的本科例外不因硕士筛选被默默丢弃。
- 相关或信息不足者进入持久详情队列，不固定只读3份；页面可见检查屏数与需要核实的候选人数是两回事。
- 默认重点检查最多3屏；资料就绪后核对栏目和滚动实际位置，不叠加按字数计算的固定停留。保存的账户可见全文用于本地分析，不为表现阅读反复访问。记录采集和可见栏目检查分段耗时，不能把机器耗时当成人工阅读时长。
- 每轮先处理当前资料和收藏闭环；有未处理项时明确延期原因，不不断开新搜索。
- 收藏按钮成功仅证明保存状态；独立读取准确目标组、核对稳定身份后才确认归属。写后回读可通过 `after_operation_id` 绑定已完成的同组写入。

## 异常与边界

- 登录失效、验证码、限流、白屏或效果未知时停止依赖动作并保留记录。先核对，再有限恢复；不自动重放搜索或收藏。
- 原任务自建搜索页已关闭时，可在精确授权的 `connect(new_workspace:true,replaces_operation_id:<原创建操作>)` 中替代：宿主必须通过浏览器 `tabs.get` 独立确认原标签不存在。其他会话占用、连接失败或仅在列表中未发现均不能认定关闭。该入口只打开固定搜索页，不提交搜索；后续恢复须新建结果集合、重新核实卡片身份，不迁移旧位置选择器，原队列、证据和计数保留。
- 仅关闭当前调用持有所有权的自建标签；用户页面保留。普通错误不反复拆装扩展。
- 不联系候选人、不索要附件、不购买或解锁。分组创建、取消收藏和方案写入须由对应授权覆盖。
- 浏览器业务只通过 Site Adapter，Skill 不依赖 Codex CUA，不以其他通道绕过失败。
- 原始简历、私有报告及凭据不进入源码或安装包。不承诺零风控。

## 开发验证

在源码仓库运行：

```text
node tools/liepin-mcp/scripts/test.mjs
node --test distribution/liepin-search/runtime/packages/liepin/test/*.test.js
node tools/liepin-mcp/scripts/verify-platform-install.mjs REPORT.json 0.3.0
node tools/liepin-mcp/scripts/verify-source-delivery.mjs SOURCE_REPORT.json
```

Windows 的测试枚举由 `scripts/test.mjs` 和平台验收脚本处理，不能依赖 Unix 通配符展开。测试、隔离安装、实际连接、真实业务及目标客户端验收分别报告；源码已提交或包已生成不等于已上线。

评估HTML会生成3个同目录文件：顶部统计与重点摘要、可点击的已保存详情、独立原始JSON。手机端纵向阅读，桌面端保持表格。平台原简历链接来自已观察地址，需要对应账号权限；受限字段仍未获取。移动报告时保留这3个文件，原始资料不嵌在主报告。
