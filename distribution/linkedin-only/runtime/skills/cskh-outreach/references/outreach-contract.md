# cskh-outreach 数据契约

## 输入

```json
{
  "projectId": "ai-product-lead-20260920",
  "jbf": {
    "title": "AI 产品负责人",
    "sellingPoints": ["从 0 到 1 推进招聘智能体产品"]
  },
  "finalShortlist": [
    {
      "candidate": {
        "name": "Example Candidate",
        "profileUrl": "https://www.linkedin.com/in/example/"
      },
      "recommendationReason": "候选人的可核验入选理由",
      "evidence": [
        { "source": "linkedin-profile", "fact": "候选人的可核验经历" }
      ]
    }
  ]
}
```

`finalShortlist` 必须来自完成详情深读或明确放弃深读后的最终名单。不得自动把发现结果或初选结果提升为最终短名单。

## 候选人门

每位候选人分别保存 `candidateApproval`：

```json
{
  "approved": true,
  "approvedAt": "2026-09-20T02:30:00.000Z",
  "source": "current_conversation",
  "profileUrl": "https://www.linkedin.com/in/example/"
}
```

## 关系结果

候选人门通过后先生成 `capabilitySnapshot`。它分为会话层与候选人层：会话层记录当前登录态下实际可见的搜索、人脉、消息及产品入口；候选人层记录精确主页的 Connect 位置、Message、Pending 和 InMail。账号套餐名称不能替代候选人页面观察。探测固定 `advisoryOnly=true`、`executionAllowed=false`，未观察到的能力保持 `not_observed`，不得解释为平台永久不支持。

只读准备链路首先生成 `relationship-evidence.json`。只能按精确主页 URL 将连接和邀请写入正式关系证据；仅按姓名命中的 Inbox 项先进入 `unverifiedConversationCandidates`，不得自动提升为 `conversations`。当且仅当同名线程唯一，且 `hunter-linkedin thread-snapshot` 对线程 URL 和可见收件人完成精确绑定时，可另行生成 `threadSnapshot` 与 `conversationStatus`，但仍不伪造 Inbox 未提供的候选人主页 URL。

`conversationStatus` 取值：

- `candidate_replied`：最新发言人精确等于候选人姓名，可进入回复草稿复核。
- `awaiting_candidate_reply`：最新发言人不是候选人，停止重复跟进并等待回复。
- `no_verified_thread`：没有通过绑定校验的唯一线程，按无已验证线程处理或转人工检查。

```json
{
  "relationshipState": "connected_no_thread",
  "observedAt": "2026-09-20T02:35:00.000Z",
  "evidence": {
    "connection": true,
    "pendingInvitation": false,
    "threadUrl": ""
  },
  "warnings": []
}
```

允许的业务状态由 `relationship-state` CLI 定义；Skill 不另造平行状态模型。

## 内容与执行门

非好友 Connect 在进入执行门前还必须保存独立的准备确认：

```json
{
  "connectPreparation": {
    "ready": true,
    "confirmedAt": "2026-09-20T02:38:00.000Z",
    "source": "current_conversation",
    "profileUrl": "https://www.linkedin.com/in/example/"
  }
}
```

`connectPreparation` 仅表示用户已完成发送前准备，不能代替对完整附言的真实发送确认。

`executionApproval.approvedAt` 与 `connectPreparation.confirmedAt` 只在 15 分钟内有效；未来时间或过期时间在任何 OpenCLI 访问前拒绝。统一执行器随后还要求 `capability-probe` 是 5 分钟内的已认证快照。

```json
{
  "channel": "linkedin_message",
  "purpose": "ai-product-lead-introduction",
  "content": "完整消息正文",
  "contentHash": "sha256:...",
  "executionApproval": {
    "approved": true,
    "approvedAt": "2026-09-20T02:40:00.000Z",
    "source": "current_conversation",
    "profileUrl": "https://www.linkedin.com/in/example/",
    "channel": "linkedin_message",
    "contentHash": "sha256:...",
    "content": "完整消息正文"
  }
}
```

`contentHash` 使用 UTF-8 完整内容计算 `sha256:<64位十六进制>`。邮件使用“主题 + 换行 + 正文”；其他渠道使用完整附言或正文。统一执行器会在访问 OpenCLI 前重新计算并比对，不能只信任上游传入值。

## 统一执行输入

LinkedIn 真实执行必须把执行门已经展示并批准的数据写入同一个输入文件，再交给 `scripts/execute-approved-outreach.mjs`。三种路由与渠道必须严格对应：

| route | channel | 额外要求 |
|---|---|---|
| `connect` | `linkedin_connect` | `connectPreparation` 精确绑定当前候选人 |
| `first_message` | `linkedin_message` | 已连接且尚无已验证线程 |
| `existing_thread` | `linkedin_message` | `conversationStatus=candidate_replied`，并提供最新消息哈希或正文 |

```json
{
  "candidate": {
    "name": "Example Candidate",
    "profileUrl": "https://www.linkedin.com/in/example/"
  },
  "channel": "linkedin_message",
  "route": "existing_thread",
  "purpose": "ai-product-lead-follow-up",
  "content": "完整消息正文",
  "contentHash": "sha256:...",
  "threadUrl": "https://www.linkedin.com/messaging/thread/example/",
  "conversationStatus": "candidate_replied",
  "threadSnapshot": {
    "latestMessageHash": "sha256:latest-visible-message"
  },
  "execute": true,
  "executionApproval": {
    "approved": true,
    "approvedAt": "2026-09-20T02:40:00.000Z",
    "source": "current_conversation",
    "profileUrl": "https://www.linkedin.com/in/example/",
    "channel": "linkedin_message",
    "contentHash": "sha256:...",
    "content": "完整消息正文"
  }
}
```

执行器固定执行 `ledger check → send=false → 单次 send=true → ledger record`。官方 `safe-send` 的 `verified_dry_run` 只代表预检通过，`sent` 才归一为成功。任何异常或无法确认的返回都按 `uncertain` 记账，不自动重试。

## 执行结果

```json
{
  "executionResult": {
    "status": "success",
    "occurredAt": "2026-09-20T02:45:57.362Z",
    "externalActionCreated": true,
    "platformEvidence": {
      "kind": "linkedin_thread",
      "threadUrl": "https://www.linkedin.com/messaging/thread/example/",
      "recipient": "Example Candidate"
    }
  }
}
```

`status` 取值：

- `success`
- `explicit_failure`
- `uncertain`
- `draft_ready`（仅草稿，不得作为发送成功写入）

## 邮件草稿

邮件只接受带来源、验证方式和时间的已验证地址。草稿输入示例：

```json
{
  "candidate": {
    "name": "Example Candidate",
    "profileUrl": "https://www.linkedin.com/in/example/"
  },
  "email": {
    "address": "candidate@example.com",
    "verificationStatus": "verified",
    "source": "candidate public profile",
    "verificationMethod": "public_source_match",
    "verifiedAt": "2026-09-20T09:00:00.000Z"
  },
  "draft": {
    "subject": "个性化主题",
    "body": "完整正文"
  },
  "personalization": {
    "jdFact": "一个已确认的 JD/JBF 事实",
    "candidateFacts": ["至少一个候选人可核验证据"]
  }
}
```

`create-email-draft.mjs` 输出 `email-draft.json` 与 `email-draft.md`，状态固定为 `draft_ready`、`externalActionCreated=false`。它不调用邮箱连接器，草稿也不进入只记录真实执行结果的 `outreach-ledger`。

## 台账键

防重键由 `outreach-ledger` 生成，语义为：

```text
候选人精确 LinkedIn 主页 + 渠道 + 触达目的
```

同一防重键已有 `success` 或未解决的 `uncertain` 时，新的真实执行必须停止。

## 批次汇总视图

批次输入只使用每位候选人已经确定的展示字段，不重新执行关系判断或审批。允许的汇总状态为：

- `success`、`explicit_failure`、`uncertain`、`draft_ready`
- `awaiting_candidate_reply`、`invitation_pending`
- `awaiting_candidate_approval`、`awaiting_execution_approval`
- `blocked`、`not_started`

`summarize-outreach-batch.mjs` 按精确 LinkedIn 主页去重，输出 `outreach-summary.json` 与 `outreach-summary.md`。结果固定包含 `advisoryOnly=true`、`executionAllowed=false`；这是业务阅读视图，不能作为任何真实动作的授权输入。
