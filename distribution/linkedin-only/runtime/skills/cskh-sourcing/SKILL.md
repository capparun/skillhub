---
name: cskh-sourcing
description: |
  猎头寻访平台分发器 skill。接收 cskh-align 交付的 SourcingRequest 后，
  按用户确认的渠道调用对应平台的原子化 pipeline。当前版本优先支持 LinkedIn。
  触发词: sourcing / 寻访 / pipeline / 人才寻访 / 候选人搜索
type: skill
version: 2.2.2
status: ready
disable: false
---

# cskh-sourcing: 寻访平台分发器

本 skill 是寻访执行的**通用入口**，不负责需求对齐、平台环境检查或具体平台内部的执行逻辑。它只接收已经确认的 SourcingRequest，并分发到对应平台 pipeline。

> **平台原子化原则**：不同平台的寻访逻辑、字段、命令相互独立，一个 skill 只负责一个平台。当前版本优先实现 LinkedIn，猎聘和脉脉的完整 pipeline 作为未来扩展。

## 触发条件

以下任一情况自动触发：
- 收到 `requestType: hunter-sourcing` 且 `nextAction: start_sourcing` 的 SourcingRequest。
- 对齐报告生成后，用户明确确认“现在开始搜索”。
- 用户带着已确认的对齐结果说“开始 sourcing / 寻访 / 候选人搜索”。

如果用户只提供 JD 或模糊招聘需求，先交给 `cskh-align`，不得在本 Skill 内重复对齐。

## 最小执行路径（TL;DR）

```
Step 1:  验证 SourcingRequest 结构和用户确认的渠道
Step 2:  验证本次开始搜索的授权证据
Step 3:  检查已明确提供的客户配置；仅启用 Gllue 时先走可选库内寻访
Step 4:  根据 confirmedChannels 和当前继续决定进入外部平台 skill
```

## 平台选择

### 客户可选的 Gllue 前置分支

此分支在 JBF/画像已确认、开始授权校验通过后，外部平台执行前运行。Gllue 不是新增的 `confirmedChannels` 值，不改写 Align 的渠道计划或已确认 JBF。

- 只读取当前任务明确提供的客户本地配置文件；无文件或 `integrations.gllue.enabled !== true` 时沿用原流程。不得根据客户名称、曾经使用 Gllue 或已安装插件猜测启用，不递归搜索用户目录，不修改全局配置。
- 配置文件已明确指定但无法读取/解析时，报告原因并询问是否跳过库内步骤，不默默当作未启用。
- enabled 为 true 时，先确认本轮是否查库、人数（建议 `defaultSearchLimit`，缺省 50）与范围。启用仅表示显示入口，不是搜索批准。建议人数必须是正整数，配置错误先澄清。
- 用户同意后加载独立 `cskh-gllue` Skill，传递只读 Align 路径、已确认 JBF/画像、客户配置路径及本次用户选择。缺少该 Skill/插件时说明缺项，不自动安装，也不在分发器内拼接 Gllue 命令。
- Gllue 报告完成后，询问是否继续已确认的外部渠道；不能因原 SourcingRequest 已批准而自动接着搜索 LinkedIn。拒绝库内搜索、库内失败或能力缺失时，也由用户明确选择继续外部渠道或结束。
- 本次分发上下文记录库内结果 `completed / skipped / failed` 和本地报告路径；恢复旧任务时说明已有产物并重新确认未完成动作，不重复执行已完成库内搜索。不要回写 Align 文件。
- Gllue 结果保持独立板块，不在分发器重新评分、混排或执行入库/触达。

用户明确只要求 Gllue 时直接交给 `cskh-gllue`，不为了库内查询强迫选择 LinkedIn，也不据此永久启用客户配置。

若请求中没有 `confirmedChannels`，必须先问用户：

> 请选择寻访平台：
> 1. **LinkedIn**（推荐，当前版本重点支持）
> 2. 猎聘
> 3. 脉脉

### 选择 LinkedIn

将上下文交给 `cskh-sourcing-linkedin` skill 执行：

```
进入 cskh-sourcing-linkedin pipeline：
读取已确认画像 → LinkedIn 关键词 → LinkedIn 发现路径 → normalize → LLM 评估 → LinkedIn 报告
```

### 选择猎聘

当前完整 pipeline skill 尚未实现。明确告知用户该渠道暂不可执行；不要在分发器内拼装或执行猎聘命令。

### 选择脉脉

当前完整 pipeline skill 尚未实现。明确告知用户该渠道暂不可执行；不要在分发器内拼装或执行脉脉命令。

## 输入输出

**输入：**
- `cskh-align` 生成的 SourcingRequest。
- `startAuthorization`：`approved`、`approvedAt`、`source` 三项齐全的本次授权证据。
- 已确认的 `persona`、`confirmedChannels` 和 `searchParameters`。
- `alignResultPath` 和 `alignReportPath`，均作为只读输入。

**输出：**
- 平台选择结果
- 对应平台的执行计划或 CLI 命令
- 如果选 LinkedIn：由 `cskh-sourcing-linkedin` 输出完整报告

## 平台交接契约

分发到平台 Skill 时，只传递以下已确认内容，不补写或改写字段：

- `persona`
- 当前单个平台的 `confirmedChannel`
- `searchParameters`
- `alignResultPath`、`alignReportPath`

## 开始授权校验

只有同时满足以下条件才能进入平台 Skill：

1. `startAuthorization.approved === true`
2. `startAuthorization.approvedAt` 是有效的 ISO-8601 时间
3. `startAuthorization.source === "current_conversation"`
4. 当前对话中存在用户本次明确要求开始搜索的语义，或本请求由 `cskh-align` 在同一连续流程中即时交接

缺少字段、值无效或只加载了历史 SourcingRequest 时，停止执行并返回 `cskh-align` 刷新授权。历史 `approved: true` 仅是审计记录，不得单独触发搜索；分发器不得自行补造时间、来源或批准状态。

平台 Skill 必须返回一个终态：

| status | 分发器行为 |
|---|---|
| `completed` | 记录平台产物路径；多平台任务继续下一平台 |
| `unsupported` | 向用户说明该平台尚不可执行；不替换成其他平台 |
| `failed` | 保留错误分类和已有产物；不修改 Align 结果 |

全部渠道结束后，分发器只汇总各平台状态和产物路径，不重新解释候选人数据或生成平台报告。

## 触发词优先级

| 用户输入 | 触发行为 |
|---------|---------|
| "LinkedIn sourcing" / "LinkedIn 寻访" | 有已确认对齐结果时触发 `cskh-sourcing-linkedin`；否则先进入 `cskh-align` |
| "猎聘寻访" | 明确提示对应平台 Skill 尚未实现 |
| "脉脉寻访" | 明确提示对应平台 Skill 尚未实现 |
| "帮我招一个 AI 工程师" | 先触发 `cskh-align` |
| "sourcing / 寻访 / pipeline" | 有 SourcingRequest 时执行；否则要求先完成对齐 |

## 边界条件

1. **SourcingRequest 字段或本次授权不完整**：返回 Align 补齐或刷新授权，不自行推断已确认项。
2. **用户未确认渠道**：停止初始化，并要求先确认渠道。
3. **用户同时确认多个平台**：逐个平台执行独立 pipeline，不共享平台内部状态。
4. **请求包含未支持渠道**：明确报告，不静默替换渠道。
5. **执行失败**：只更新 Sourcing 状态，不修改 `align.json` 或 `align.html`。

## 与平台 skill 的关系

```
用户请求
   │
   ▼
cskh-sourcing（分发器）
   │
   ├── 选择 LinkedIn ──→ cskh-sourcing-linkedin
   │
   ├── 选择猎聘 ───────→ 报告暂不支持（未来 cskh-sourcing-liepin）
   │
   └── 选择脉脉 ───────→ 报告暂不支持（未来 cskh-sourcing-maimai）
```

LinkedIn 任务必须加载并遵循 `cskh-sourcing-linkedin` 的“浏览器导航稳定性规则”。分发器不得自行并发执行 LinkedIn 浏览器命令、创建逐关键词 session、关闭命令留下的标签页，或在 `xray` 外重复编排 Google/Brave/Yahoo；具体冷却时间、有限重试和错误分类以平台 Skill 为准。
