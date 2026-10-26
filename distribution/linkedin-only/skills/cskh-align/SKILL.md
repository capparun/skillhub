---
name: cskh-align
version: 1.7.6
status: ready
description: |
  猎头需求对齐助手。将 JD、会议记录或零散招聘需求收敛为经用户确认的 JBF，再据此生成画像、寻访策略、搜索参数和可视化 HTML 报告。
  当用户要求分析职位、澄清招聘需求、构建人才画像或制定寻访方案时使用。
  本 Skill 不检查搜索环境、不执行搜索；用户确认开始搜索后，仅向 cskh-sourcing 交付 SourcingRequest。
allowed-tools:
  - Read
  - Edit
  - Write
  - Bash
  - AskUserQuestion
---

# cskh-align：需求对齐

## 目标

先把任何招聘输入整理成一份可以被用户确认、保存和独立交付的 Job Briefing Form（JBF），再从 JBF 推导人才画像和寻访策略。**JBF 是整个项目的唯一需求基线**：任何搜索、候选人评估和后续交付都必须可追溯到它。Align 的终点是确认后的 JBF 与 HTML 对齐报告，搜索属于后续 Sourcing 流程。

## 核心边界

**Align 负责：**

- 将 JD、会议记录、聊天记录和零散需求映射为完整 JBF。
- 分组交互补全 JBF，记录每个字段的来源与状态。
- 生成人才画像，并让用户单独确认。
- 推荐渠道策略，并让用户单独确认。
- 生成平台中立的搜索参数草案。
- 保存 `align.json` 和可视化 `align.html`。
- 保存 JBF 业务字段和 JBF 字段状态；未提供的标准字段标记为“暂缺”，不得静默省略或以推导内容冒充事实。
- 在搜索确认前，引导用户决定是否将正式 JBF 归档到本地或上传到企业微信等协作渠道。
- 用户明确选择开始搜索后，生成 `sourcing-request.json` 并交给 `cskh-sourcing`。

**Align 不负责：**

- 检查或安装 OpenCLI、插件和浏览器依赖。
- 检查 LinkedIn、猎聘或脉脉登录状态。
- 创建搜索会话、结果目录或候选人文件。
- 执行、重试或监控搜索。
- 处理、评分或输出候选人短名单。

搜索失败不得回写或改变已经确认的 Align 结果。

客户可选 Gllue 库内寻访由交接后的 `cskh-sourcing` 分发器检查启用配置并询问，不在 Align 内检查页面或执行查询。仅启用的客户会出现此步骤；Gllue 报告后是否继续外部搜索仍需用户决定。保留单一 SourcingRequest 交接，不额外并发交接 Gllue 与 LinkedIn。

## 输入

- JD 文本、文件或链接中的职位内容。
- 会议记录、聊天记录、邮件、口述需求等零散输入。
- JBF 文档及其中的职位、客户、公司、招聘背景、组织、文化、薪酬与面试字段。
- 用户补充的职级、地点、预算、目标公司、排除公司、到岗时间和紧急度。
- 用户对人才画像和渠道方案的修订意见。

## 交互式问答协议

所有会改变对齐结果的用户输入，都应优先使用宿主提供的交互式选择能力，例如选择卡片、按钮或交互式提问工具。不要绑定某一个产品或工具名称。

- 信息补全：优先使用交互式选择，每次最多询问 1 至 2 个最关键问题。
- 人才画像确认：使用交互式确认，不得只在长篇回复末尾写“请确认”。
- 渠道策略确认：选项应允许确认、调整或暂不决定。
- 是否开始搜索：明确提供“暂不开始”和“确认并开始搜索”。
- JBF 归档与交付：明确提供“保存到本地（推荐）”“保存并上传到企业微信”和“暂不归档”。

如果宿主不支持原生交互控件，一次只提出一个问题，并使用可直接回复的编号选项；最后提供“其他：自定义答案”。用户回答后再进入下一题，不得因此阻断整个 Align 流程。

每个交互问题都应：

1. 用短标题说明正在确认什么。
2. 说明该答案会影响画像、渠道还是搜索范围。
3. 提供 2 至 3 个互斥选项；推荐项排在第一位并注明推荐理由。
4. 保留用户自定义答案入口，用于文档存在笔误或选项不覆盖实际情况时修正。

如果同一轮有多个缺口，按影响程度排序，先确认会改变硬性条件、预算或候选人池范围的事项。得到回答后更新上下文，再提出下一轮问题；不要把全部未知项一次性堆给用户。JBF 的低优先级字段也不能被忽略：在画像确认前后按章节继续补全，直至用户确认 JBF 基线或明确将字段标为暂缺/不适用。

## 工作流

### 1. 建立 JBF 草稿

先从所有输入提取职位、职级、地点、经验、技能、预算、汇报线、团队规模、公司背景、文化、卖点和初筛信息，并映射到 `references/jbf-schema.md` 的完整标准字段。输入不是 JBF 时，也必须先生成 JBF 草稿；JD 或会议记录只是证据来源，不是 JBF 基线本身。

- 每轮询问 1 至 2 个问题；优先处理招聘背景、岗位范围、候选人要求、组织/文化、薪酬流程、卖点/初筛这六组字段。
- 无完整 JD 时，优先确认职位/职级、地点、预算和核心技能，再继续完成其余 JBF 分组。
- 信息矛盾时明确展示风险和可调整项。
- JD 只是输入，不等于已对齐需求。
- 发现薪资上下限倒置、年限口径不明、汇报线冲突等问题时，先通过交互式选择逐项澄清；不得先形成定稿画像后再一次性追问多个缺口。
- 读取 `references/jbf-completion-workflow.md`。每个 JBF 标准字段必须在 `jbfCompletion.fields` 留下状态：`confirmed`、`pending` 或 `not_applicable`；并记录来源为 `document`、`meeting_notes`、`user_confirmation`、`derived` 或 `missing`。
- 不得把 JBF 草稿中的推导内容当作已确认事实。

### 2. 确认 JBF 基线（硬性关口）

先向用户展示 JBF 的已确认、暂缺与不适用字段摘要，再单独交互询问：**“是否将这份 JBF 确认为当前项目基线？”**

- 用户确认：将 `jbfCompletion.status` 设为 `confirmed`，并保留已接受的 `pending` / `not_applicable` 字段。
- 用户继续补充：回到缺口所属章节，每次只确认 1 至 2 项。
- 用户暂不确认：保留草稿；未确认 JBF 基线不得定稿人才画像或渠道策略，也不得交接 SourcingRequest。

### 3. 从 JBF 生成人才画像并确认

输出以下结构：

- `mustHave`：硬性要求。
- `niceToHave`：加分项。
- `exclusions`：排除项。
- `unknowns`：仍未确认的信息。
- `risks`：预算、供给、时效或要求冲突。

必须单独交互询问用户：**“这份人才画像是否确认？”**，至少提供“确认画像”和“需要调整”两个选项。

用户修改时更新画像并再次确认。未确认不得进入渠道策略定稿。

### 4. 从 JBF 推荐渠道策略并确认

根据人才画像推荐标准平台渠道与场景化补充渠道，并说明选择理由。渠道是业务策略，不是执行命令。

LinkedIn 在本流程中只支持两种发现方式：

- `xray`：公开网页/X-Ray 发现。
- `browser`：用户登录态下的浏览器发现。

不得推荐或生成 Apify 渠道。

补充渠道只在确有助于扩大候选人池、验证目标机构或建立转介绍路径时推荐，通常每次不超过 1 至 2 个。可选类型包括：

- `target-organization-mapping`：目标机构图谱（如竞品、目标学校、实验室或区域机构）。
- `professional-association`：行业协会、专业社群与活动。
- `alumni-network`：相关院校、前雇主或专业项目的校友网络。
- `referral-network`：客户、候选人或行业联系人转介绍网络。
- `conference-speaker-list`：会议演讲者、专业内容作者等公开专业影响力线索。

读取 `references/supplementary-sourcing-channels.md`，按职位选择最相关的路线并说明边界。补充渠道须由用户与平台渠道一起单独确认；它们是研究或关系建立建议，**不得自动触发外部搜索或触达**，也不属于可执行的 `confirmedChannels`。

必须单独交互询问用户：**“是否按这份渠道策略继续？”**，至少提供“确认策略”和“需要调整”两个选项。

用户可删除、增加或调整渠道优先级；更新后再次确认。

### 5. 生成搜索参数草案与渠道寻访方案

在渠道策略确认后，先生成平台中立参数：

- `keywordGroups`
- `locations`
- `targetCompanies`
- `excludedCompanies`
- `poolTarget`
- `shortlistTarget`

再为每个已确认的可执行渠道生成一份寻访方案，写入 `channelPlans.<channel>`。当前可执行渠道为 `linkedin`，结构分三层：

- `search`：平台搜索接口可直接传入的原生字段（`keywords` / `title` / `location` / `currentCompany` / `pastCompany` / `school` / `industry` / `connection` / `language` / `limit`）。只能放平台认的字段，画像要求不得硬塞进 search。
- `filters`：搜索返回后用于硬淘汰 / 保留的规则。分两类：profile 直接可读字段（`titleMustInclude` / `titleExclude` / `minExperienceYears` / `preferredCompanies` / `excludedCompanies` / `requiredSkills` / `locationMatch` / `degreeMin`），以及逻辑推导字段（`derived`，如目标公司经历、稳定性、管理经验、职级推断等），推导规则写清输入字段与判据，由评估步骤计算。
- `scoring`：软性加分项与权重（`mustHave` / `niceToHave` / `weights`），用于排序不打淘汰。

学历等渠道不可达的字段只能进 `scoring` 说明，不得进 `filters` 硬性淘汰。`poolTarget` 决定 `limit` 的初始值，评估不足时由寻访编排放大，不得由 Align 猜测追加。

此阶段不生成或执行 OpenCLI 命令，也不检查运行环境。

### 6. 保存对齐结果和 HTML

推荐路径：

```text
~/.hunter/output/align/{projectId}/align.json
~/.hunter/output/align/{projectId}/align.html
```

`align.json` 的最小结构：

```json
{
  "schemaVersion": 1,
  "projectId": "ai-inference-engineer",
  "role": { "title": "AI Inference Engineer", "location": "Shanghai" },
  "jobBrief": {
    "meta": {},
    "companyProfile": {},
    "vacancy": {},
    "candidatePersonalData": {},
    "positionScope": {},
    "organization": {},
    "cultureLeadership": {},
    "compensation": {},
    "sellingPoints": [],
    "screeningQuestions": []
  },
  "jbfCompletion": {
    "status": "draft",
    "fields": {
      "meta.positionTitle": { "status": "confirmed", "source": "document" },
      "companyProfile.globalRevenue": { "status": "pending", "source": "missing" }
    }
  },
  "persona": {
    "mustHave": [],
    "niceToHave": [],
    "exclusions": [],
    "unknowns": []
  },
  "channelStrategy": {
    "primary": [],
    "secondary": [],
    "supplementary": [],
    "reasons": []
  },
  "confirmations": {
    "persona": true,
    "channels": true,
    "documentDelivery": false,
    "startSearch": { "approved": false, "approvedAt": "", "source": "" }
  },
  "documentDelivery": {
    "decision": "pending",
    "localPath": "",
    "enterpriseWeChat": { "requested": false, "destination": "", "status": "not_requested" }
  },
  "searchParameters": {
    "keywordGroups": [],
    "locations": [],
    "targetCompanies": [],
    "excludedCompanies": [],
    "poolTarget": 50,
    "shortlistTarget": 10
  },
  "channelPlans": {
    "linkedin": {
      "search": {
        "keywords": [],
        "title": "",
        "location": "",
        "currentCompany": [],
        "pastCompany": [],
        "school": [],
        "industry": "",
        "connection": "",
        "language": "",
        "limit": 0
      },
      "filters": {
        "titleMustInclude": [],
        "titleExclude": [],
        "minExperienceYears": 0,
        "preferredCompanies": [],
        "excludedCompanies": [],
        "requiredSkills": [],
        "locationMatch": [],
        "degreeMin": "",
        "derived": []
      },
      "scoring": {
        "mustHave": [],
        "niceToHave": [],
        "weights": {}
      }
    }
  },
  "risks": []
}
```

使用本 Skill 自带脚本生成静态 HTML：

命令示例一律写成单行：Windows PowerShell 不认 POSIX 的反斜杠续行。

```
node <cskh-align目录>/scripts/render-align-report.mjs --input ~/.hunter/output/align/{projectId}/align.json --output ~/.hunter/output/align/{projectId}/align.html
```

HTML 必须先完整呈现 JBF 标准字段与每项的来源/状态，再呈现人才画像、已确认渠道、搜索参数、渠道寻访方案和风险。空白 JBF 字段显示“暂缺”；被确认不适用的字段显示“不适用”。HTML 是只读业务文档，不展示 JBF 落盘、企业微信上传或开始搜索等流程操作卡片，也不包含自动执行搜索的逻辑；这些确认只在宿主对话中交互完成。

JBF 字段名称和映射规则见 `references/jbf-schema.md`。

### 7. 确认 JBF 归档与交付

HTML 生成后，先交互询问：**“是否需要将这份正式 JBF 落盘或交付？”**

- `保存到本地（推荐）`：确认目标目录和文件名，保存正式 JBF 文档，并将路径写入 `documentDelivery.localPath`。
- `保存并上传到企业微信`：先保存本地文件，再询问接收人或群聊。仅在宿主具备相应上传能力且用户在上传前明确确认时执行；否则保留本地文件并说明需要手动上传。
- `暂不归档`：记录选择，不影响对齐结果。

企业微信上传属于外部写操作，不得仅根据“开始搜索”或此前的渠道确认推断授权。记录结果时更新 `documentDelivery` 和 `confirmations.documentDelivery`，不得修改已确认的人才画像或渠道策略。

### 8. 询问是否开始搜索

JBF 归档与交付选择完成后，必须再单独交互询问：**“需求对齐已经完成。现在开始搜索吗？”**

- 用户选择“不开始”：将 `confirmations.startSearch` 重置为 `{"approved": false, "approvedAt": "", "source": "current_conversation"}`，以 `DONE` 或 `DONE_WITH_CONCERNS` 结束并保留对齐文件；不得保留旧项目的批准状态。
- 用户选择“开始”：把 `confirmations.startSearch` 写为 `{"approved": true, "approvedAt": "<ISO-8601>", "source": "current_conversation"}`，生成 SourcingRequest，并用本 Skill 自带脚本同时渲染一份人读版寻访方案 HTML（Sourcing Plan），然后一并交给 `cskh-sourcing`；Align 到此结束。

SourcingRequest 落盘的同时必须生成人读版 HTML：用户要看的内容一律以 md 或 HTML 呈现，不得只给裸 JSON：

```
node <cskh-align目录>/scripts/render-sourcing-plan.mjs --input ~/.hunter/output/align/{projectId}/sourcing-request.json --output ~/.hunter/output/align/{projectId}/sourcing-plan.html
```

不得在用户确认前初始化或验证搜索环境。历史文件中的 `startSearch.approved: true` 只用于审计，不能脱离当前对话中的明确授权再次启动搜索。

## SourcingRequest

最小交接对象：

```json
{
  "schemaVersion": 1,
  "requestType": "hunter-sourcing",
  "nextAction": "start_sourcing",
  "projectId": "ai-inference-engineer",
  "alignResultPath": "~/.hunter/output/align/ai-inference-engineer/align.json",
  "alignReportPath": "~/.hunter/output/align/ai-inference-engineer/align.html",
  "startAuthorization": {
    "approved": true,
    "approvedAt": "2026-09-15T12:00:00.000Z",
    "source": "current_conversation"
  },
  "persona": {},
  "confirmedChannels": [],
  "searchParameters": {},
  "channelPlans": {}
}
```

完整约束见 `references/sourcing-request.md`。

## 确认状态契约

各步骤如何提问以上文工作流为准；本表只定义是否可以越过关口，避免重复维护问法：

| 关口 | 已完成的机器判据 | 未完成时 |
|---|---|---|
| JBF 基线 | `jbfCompletion.status === "confirmed"` | 停留在步骤 1–2 |
| 人才画像 | `confirmations.persona === true` | 停留在步骤 3 |
| 渠道策略 | `confirmations.channels === true` | 停留在步骤 4 |
| JBF 归档与交付 | `documentDelivery.decision !== "pending"` | 停留在步骤 7；外部上传仍需即时授权 |
| 开始搜索 | 用户在当前对话明确选择开始，且 `confirmations.startSearch.approved === true` | 执行步骤 8；复制该证据到 `startAuthorization` 后才创建 `nextAction: "start_sourcing"` |

五个关口不可合并。用户已经明确完成且机器判据成立的关口不得重复询问；任何前置判据不成立时，不得创建 SourcingRequest。

## 对话原则

- 先给当前结论，再说明缺口。
- 问题要说明它会影响画像、渠道还是搜索范围。
- 尽量给 2 至 3 个可选项，并给出推荐及理由。
- 用户修订后，展示更新内容并重新确认。
- 不把技术环境问题暴露到 Align 阶段。

## Completion Status Protocol

- `DONE`：对齐完成，HTML 已生成；用户选择暂不搜索，或已成功交接 SourcingRequest。
- `DONE_WITH_CONCERNS`：对齐完成，但保留明确风险或未确认的非核心信息。
- `NEEDS_CONTEXT`：缺少职位、地点或核心能力等必要上下文。
- `BLOCKED`：输入无法形成有效画像，且用户无法补充关键约束。
