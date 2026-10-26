---
name: cskh-outreach
description: |
  Hunter 候选人触达编排 Skill。接收已确认的 JD/JBF 与最终短名单，逐人核验 LinkedIn 关系状态，生成个性化 Connect、LinkedIn Message 或邮件草稿，经过候选人门与执行门后调用安全原子命令，并写入防重台账。用于“联系候选人、生成触达话术、发 Connect、发 LinkedIn 消息、邮件草稿、候选人 outreach”等请求。
metadata:
  type: skill
  version: 1.6.0
  status: ready
  disable: false
---

# cskh-outreach：候选人触达编排

把已确认的最终短名单转成安全、可审计的候选人触达。业务判断、个性化内容和人工确认留在本 Skill；关系归并、渠道计划、防重和页面写入复用现有 Hunter/OpenCLI 原子命令。

完整输入输出字段见 [references/outreach-contract.md](references/outreach-contract.md)。

## OpenCLI 2.0 工作区入口

工作区使用 `node <hunter仓库>/scripts/opencli.mjs <原命令参数>`，或在 csk 根目录运行
`npm run opencli -- <原命令参数>`。下文 `opencli` 命令表示该项目入口，不默认切换全局安装。
本 Skill 的脚本会自动定位工作区启动器；2.0 交付安装器会写入产品入口回执。
单独复制 Skill 时须设置 `HUNTER_OPENCLI_ENTRY` 为对应产品 `runtime/opencli.mjs` 的绝对路径。
JSON 命令成功结果读取 `data`；错误包装按失败处理。业务结果文件（`--output`）保持原 schema。
项目离线兼容已验证；登录态、页面与真实业务仍须按原审批流程验收，不自动放宽配额或并发。

## 不可突破的边界

1. 只处理已经确认的 JD/JBF 与 `finalShortlist`，不重新定义岗位，也不把初选名单当最终短名单。
2. 必须逐人通过候选人门；未批准候选人不得读取私有关系数据、生成待发送内容或进入执行。
3. 必须逐条通过执行门。任何真实发送都要在当次执行前再次取得用户明确确认；候选人、渠道、主题、正文或关系状态变化后，原审批失效。
   执行审批与 Connect 准备确认仅在生成后的 15 分钟内有效，未来时间或过期记录必须重新确认。
4. 批量确认不能替代逐条确认，不得自行补造 `approvedAt`、`source` 或 `contentHash`。
5. LinkedIn 浏览器命令严格串行执行，不得并发访问多个候选人或同时运行读写命令。
6. `uncertain` 后禁止自动重试或再次发送；先只读核验平台状态，再由用户决定。
7. 邮件只生成草稿。没有可验证邮箱时不得猜测邮箱；本 Skill 不直接发送邮件。
8. 不调用 LinkedIn 私有接口，不复制 OpenCLI 已有页面读取能力，不自动跟进候选人。

## 最小执行路径

```text
1. 校验输入、实时命令表与当前会话能力
2. 逐人确认是否允许进入触达（候选人门）
3. 对精确候选人运行 capability-probe，采集最小关系证据并运行 relationship-state
4. 运行 outreach-plan，生成个性化内容
5. 非好友 Connect 等待用户完成准备并明确回复“已准备好”
6. 展示完整内容并逐条确认（执行门）
7. outreach-ledger check → send=false 预检 → 单次执行
8. 平台回查 → outreach-ledger record → 汇总
```

## Step 1：校验输入与运行能力

要求同时具备：

- 已确认的 JD/JBF、岗位卖点和证据来源
- `finalShortlist`，每位候选人包含姓名、精确 LinkedIn 主页、入选理由及可核验证据
- 当前对话中明确的触达意图

每次新会话首次进入本 Skill 时执行一次 `opencli list -f json`，确认任务需要的实时命令。缺少命令时报告缺口并停止对应分支，不猜旧命令名。需要参数时读取实时 `--help -f yaml`。

最小依赖：

- Hunter：`capability-probe`、`relationship-state`、`outreach-plan`、`outreach-ledger`、`connect-safe`、`first-message-safe`
- OpenCLI LinkedIn：`connections`、`sent-invitations`、`inbox`、`safe-send`、`profile-read`
- Hunter LinkedIn 插件：`opencli hunter-linkedin thread-snapshot`（已有会话的精确只读快照）

解析一次 Hunter 数据目录，优先使用安装回执的 `stateTarget`，其次使用 `HUNTER_DATA_DIR`，否则使用 `~/.hunter`。所有证据、计划和台账使用该目录，不写入 Skill 源码目录。

## Step 2：候选人门

以表格展示姓名、主页、入选理由、关键证据和证据缺口，逐人询问是否允许进入触达。将结果记录为 `candidateApproval`：

```json
{
  "approved": true,
  "approvedAt": "ISO-8601",
  "source": "current_conversation",
  "profileUrl": "https://www.linkedin.com/in/example/"
}
```

只加载历史文件、沉默、模糊答复或旧的 `approved: true` 都不构成本次批准。未批准者保留在报告中，状态记为 `not_approved`，不继续处理。

## Step 3：采集最小关系证据

只对候选人门已批准的人执行，且逐人串行：

1. 运行 `opencli hunter-linkedin capability-probe <profileUrl> --expectedName <name>`，读取当前会话的搜索、人脉和消息入口，以及候选人主页直接按钮和 More 菜单中的 Connect、Message、Pending、InMail。探测只允许展开并关闭 More 菜单，固定 `executionAllowed=false`；不得点击任何动作入口。
2. 用精确主页 URL 在 `connections` 结果中匹配，不按姓名猜测。
3. 在 `sent-invitations` 中检查是否已有待处理邀请。
4. 在 `inbox` 中检查是否已有普通消息线程；命中后用 `opencli hunter-linkedin thread-snapshot <threadUrl> --expectedName <name>` 获取精确线程证据。
   - 仅有一个同名线程且快照中的线程 URL、可见收件人均精确匹配时，才生成 `threadSnapshot`。
   - 最新发言人是候选人：`conversationStatus=candidate_replied`，可进入回复内容复核。
   - 最新发言人不是候选人：`conversationStatus=awaiting_candidate_reply`，停止生成重复跟进并等待回复。
   - 多个同名线程、快照失败或绑定校验失败：保持未验证并转人工检查。
5. 必要时用 `profile-read` 补充主页资料，但动作能力以 `capability-probe` 的可见 UI 证据为准；页面形态未知时标记 warning，不推断可 Connect。
6. 将证据包交给 `opencli hunter-linkedin relationship-state <evidence.json>`。

证据必须带 `observedAt`。生成计划和真正执行之间关系发生变化时，废弃计划与审批并回到本步骤。

### 只读准备链路

候选人门通过后，优先运行本 Skill 自带的只读编排脚本，把官方证据采集、关系归并、渠道计划和台账查重串起来：

```text
node <本 Skill 目录>/scripts/collect-outreach-context.mjs <input.json> --output-dir <候选人目录>
```

脚本严格串行调用 `connections`、`sent-invitations`、`inbox`、`profile-read` 和 Hunter 插件 `capability-probe`；存在唯一同名线程时追加 `thread-snapshot`，再调用 `relationship-state`、`outreach-plan` 和 `outreach-ledger --action check`。它不会调用 `connect-safe`、`first-message-safe`、`safe-send` 或任何真实发送命令，最终固定返回 `executionAllowed: false`。

关系归并仍只接受精确主页 URL。由于 `inbox` 当前只返回姓名和线程 URL，同名项先写入 `unverifiedConversationCandidates`，不能直接写入 `conversations`。仅当同名线程唯一且插件快照精确匹配线程 URL 与可见收件人时，才生成独立的 `threadSnapshot` 和 `conversationStatus`；多个同名线程或快照失败均转人工检查。账号套餐只作为提示，渠道判断必须使用 `capability-probe` 对当前候选人实际页面的观察；未观察到不等于平台永久不支持。

## Step 4：渠道计划与个性化草稿

运行 `opencli hunter-linkedin outreach-plan <input.json>`，然后按 `relationshipState` 选择最小渠道：

| 状态 | 渠道 | 行为 |
|---|---|---|
| 未连接且可 Connect | Connect | 生成 80–150 字符附言；硬上限 200 字符 |
| 已连接、尚无线程 | LinkedIn 首次消息 | 使用 `first-message-safe` |
| 已有线程 | LinkedIn 后续消息 | 使用官方 `safe-send` |
| 邀请待处理 | 等待 | 不重复 Connect；默认不发送其他内容 |
| 有可验证邮箱 | 邮件 | 生成主题和正文，并导出本地草稿；不连接发送器 |
| 无可靠渠道 | 暂缓 | 记录原因，不猜联系方式 |

每条草稿必须同时引用：

- 一个已确认的 JD/JBF 事实或岗位卖点
- 一至两个候选人资料中的可核验证据
- 一个清晰、低压力的下一步

不得引用缺失、错位或模型推断的经历。生成内容后计算稳定的 `contentHash`；Connect 对完整附言计算，LinkedIn Message 对完整正文计算，邮件对“主题 + 换行 + 正文”计算。

### 邮件草稿导出

邮箱必须包含地址、来源、验证方式、验证时间和 `verificationStatus=verified`；猜测地址或只有公司域名时停止。生成个性化主题、正文及依据后调用：

```text
node <本 Skill 目录>/scripts/create-email-draft.mjs <input.json> --output-dir <候选人目录>
```

脚本只在本地输出 `email-draft.json` 与 `email-draft.md`，状态固定为 `draft_ready`、`externalActionCreated=false`。它不连接邮箱账号，不调用发送器，也不把草稿写入真实执行台账。

### Connect 准备确认

对“未连接且可 Connect”的候选人，生成附言后先停在 `awaiting_user_preparation`，提示用户提前准备：确认当前登录账号、核对目标主页、检查邀请附言和当日发送安排。只有用户在当前对话针对该候选人明确回复“已准备好”或同等明确表述，才记录 `connectPreparation` 并进入执行门。

```json
{
  "ready": true,
  "confirmedAt": "ISO-8601",
  "source": "current_conversation",
  "profileUrl": "https://www.linkedin.com/in/example/"
}
```

准备确认不是发送批准，不能替代下一步对完整待发内容的执行门确认。旧对话中的准备状态、笼统的“继续”或对其他候选人的准备确认均不得复用。

## Step 5：执行门

在任何页面写操作前，逐条展示以下内容：

| 字段 | 必须展示 |
|---|---|
| 候选人 | 姓名与精确主页；邮件分支还需已验证邮箱及来源 |
| 关系状态 | 状态、观察时间和关键证据 |
| 渠道 | Connect、LinkedIn Message 或邮件草稿 |
| 完整内容 | 不截断的主题、正文或附言及字符数 |
| 个性化依据 | 使用的 JD 事实与候选人事实 |
| 防重信息 | 历史触达、`contentHash`、下一步 |

只有用户在当前对话明确确认该条完整内容后，创建 `executionApproval`。这是任何真实写入前必须再次取得的明确确认；Connect 还必须已经具备有效的 `connectPreparation`：

```json
{
  "approved": true,
  "approvedAt": "ISO-8601",
  "source": "current_conversation",
  "profileUrl": "https://www.linkedin.com/in/example/",
  "channel": "linkedin_message",
  "contentHash": "sha256:...",
  "content": "完整待发送内容"
}
```

一次确认只绑定一个候选人、一个渠道和一个内容版本。

## Step 6：防重、预检与执行

创建与 Step 5 展示内容完全一致的执行输入后，统一调用本 Skill 自带执行器；不得由 Agent 手工拆开并跳过其中任一步：

```text
node <本 Skill 目录>/scripts/execute-approved-outreach.mjs <execution.json> --output-dir <候选人目录>
```

执行输入及路由字段见 [references/outreach-contract.md](references/outreach-contract.md)。执行器会重新校验审批、Connect 准备状态、路由与渠道的一致性；已有会话还会绑定 `threadSnapshot` 的最新消息哈希，等待候选人回复时直接拒绝执行。

每条按固定顺序执行：

1. 调用 `outreach-ledger --action check`。若返回 `duplicate_success`、`unresolved_previous_attempt` 或其他不安全原因，停止该候选人。
2. 重新轻量核验关系状态。变化时废弃审批，回到 Step 3。
3. 使用相同目标和内容运行一次 `send=false` 预检。
4. 预检通过后，再核对执行门审批仍与目标、渠道、内容及哈希完全一致。
5. 紧邻真实发送前再次验证确认来自当前对话；不得把“已准备好”、候选人门或旧审批解释成发送批准。
6. 只执行一次真实写入，不在同一次任务中重放。

执行路由：

- Connect：`connect-safe <profileUrl> --send false`，批准后同参数 `--send true --approval <file>`。
- 已连接但尚无线程：`first-message-safe <profileUrl> --send false`，批准后单次真实发送。
- 已有线程：必须是 `conversationStatus=candidate_replied`，并把 Hunter 插件 `thread-snapshot` 的最新消息哈希交给官方 `safe-send` 做发送前一致性校验。
- 邮件：使用 `create-email-draft.mjs` 生成并导出本地草稿，状态为 `draft_ready`，不得进入统一发送执行器或调用邮件发送器。

## Step 7：平台回查与台账

把执行结果归一为：

| status | 处理 |
|---|---|
| `success` | 保存平台证据并记录成功，后续同目的默认防重 |
| `explicit_failure` | 仅在确认没有产生外部动作时允许未来重新审批 |
| `uncertain` | 记录待核验；不得自动重试或再次发送 |
| `draft_ready` | 仅用于邮件草稿或明确的非发送预检 |

Connect 使用目标主页 `Pending` 与 `sent-invitations` 回查；LinkedIn Message 使用目标线程、完整消息预览和时间回查。然后用 `outreach-ledger --action record` 写入 `executionResult`、平台证据和下一步建议。

若命令返回 `uncertain`，只执行只读状态核验。确认已产生外部动作后按 `success` 记录；仍无法确认则保留 `uncertain`，结束本次候选人处理。

## 输出

默认用表格汇报，每位候选人一行：

| 候选人 | 关系状态 | 建议/实际渠道 | 内容状态 | 审批状态 | 执行结果 | 下一步 |
|---|---|---|---|---|---|---|

同时返回：

- `outreachPlanPath`
- `ledgerPath`
- 每位候选人的证据时间和 `contentHash`
- 成功、失败、待核验、等待、仅草稿的数量

多人批次完成或暂停后，把每位候选人已经确定的结果交给本地汇总脚本：

```text
node <本 Skill 目录>/scripts/summarize-outreach-batch.mjs <batch.json> --output-dir <批次目录>
```

脚本输出 `outreach-summary.json` 与 `outreach-summary.md`。汇总表只是展示视图，固定 `advisoryOnly=true`、`executionAllowed=false`；不得从汇总状态反推关系、补造审批或启动发送。

不得把草稿、预检或命令返回当作平台成功；成功必须有平台回查证据。

## 失败与恢复

| 情况 | 行为 |
|---|---|
| Browser Bridge 或登录态不可用 | 停止 LinkedIn 分支，保留已生成草稿，不改用其他账号 |
| 关系证据冲突 | 标记 `relationship_unknown`，要求人工核验 |
| 页面控件或收件人不匹配 | 停止，不点击，不更换选择器猜测目标 |
| 内容超过平台限制 | 返回草稿修改，不自动截断 |
| 台账文件损坏 | 停止写操作，保留原文件并报告路径 |
| 用户中途修改内容 | 重新计算 `contentHash`，重新走执行门 |
| 用户要求自动批量发送 | 拒绝绕过逐条执行门；可批量生成草稿供审阅 |
| 非好友 Connect 尚未准备 | 状态停在 `awaiting_user_preparation`，不预检、不点击、不发送 |
