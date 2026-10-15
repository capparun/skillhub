# Command Reference

All commands: `opencli gllue <command> [args]`

## login

Open Gllue login page and poll until user completes login in Chrome.

```bash
opencli gllue login --timeout 300
```

**When**: First-time setup or session expired. After login once, session cookies persist.

## test-connection

Verify that Browser Bridge can open the configured tenant and the page visibly looks logged in. `verification=visible_page_only` does not prove that a backend business request is authorized; use a scoped read command such as `search-candidates` when that evidence is required.

```bash
opencli gllue test-connection
```

## session-watch

Observe the already-bound Gllue tab without navigation, refresh, search or active network requests:

```bash
opencli gllue session-watch --seconds 45 --site-session persistent -f json
opencli gllue session-watch --seconds 45 --mode performance --site-session persistent -f json
```

`--mode capture`（默认）走被动网络捕获，可识别 HTTP 401 与响应正文里的明确失效消息；注意官方 OpenCLI 的捕获会在扩展内部暂存响应预览。`--mode performance` 只读页面 Performance 条目（时间戳与 HTTP 状态），不接触响应正文，适合长时间常规观察；它能识别 HTTP 401 与登录页跳转，但不解析正文里的失效消息——那类失效会以整页重载加登录页的形式显现，仍会被判为 `logout_detected`。performance 模式下请求证据的 `verification` 为 `performance_entries_and_visible_page`。

JSON returns one row with `status`, `lastNormalAt`, `firstAbnormalAt`, `pagePath`, `signal`, `verification` and redacted `evidence`. `logout_detected` means the login page appeared after a visible authenticated baseline in this invocation. `auth_required_observed` means it was already at login when observation began. `auth_failure_signal` means a site-originated `/rest/` request returned HTTP 401 or an explicit expiry message. `risk_prompt` is a visible verification/risk cue, not proof of the reason. `unavailable` and `observer_error` describe observation failure, not logout. `no_logout_signal` means no decisive evidence within the window; `visible_page_only` means no site request was captured, so backend auth was not verified. A normal `/rest/user/polling` response may have `status:false`; that flag alone is not a logout signal. No response bodies, credentials or URL queries are returned.

The command is independently callable. It does not replace the scoped business-read acceptance needed after login, and a scheduled invocation leaves gaps between windows.

## capability-probe

Read-only check of the configured tenant, login state, candidate search, job search, and optionally the candidate form. It never saves a candidate.

```bash
opencli gllue capability-probe
opencli gllue capability-probe --includeWrite true
```

## search-candidates

Search candidates via Gllue gql URL. Opens `/crm/candidate/list?gql=...&page=1`, parses rendered grid rows.

```bash
opencli gllue search-candidates --keyword "Synthetic Person" --limit 20
opencli gllue search-candidates --keyword "person@example.com" --limit 10
opencli gllue search-candidates --full-text "principal" --scope mine --limit 1
```

**Params**: `--keyword` (contains @: email; otherwise: name), or mutually exclusive `--full-text` (page keyword search). `--scope mine|accessible` defaults to accessible for compatibility; mine adds the current-owner restriction. Accessible means current account permissions, not guaranteed whole-database coverage. `--limit` defaults to 20. Ask for the business quantity (suggest 50) and scope before running a business search; do not silently adopt defaults. Only a single full-text term in mine scope has live acceptance so far; Boolean/combined expressions are not verified. Apply JBF requirements locally after detail reads rather than treating full-text hits as qualified matches.

**Output**: `output/candidates/candidates_<timestamp>.json` contains candidates and count, pagesRead, exhausted, fullText and scope. CLI JSON returns candidate rows. Pagination failures throw instead of returning a partial success.

**Selector key**: `.grid-row.grid-body-row` with semantic `list-table-data-grid:candidate$<field>` cells, not column positions.

## evaluate

Purely local evidence-rule scoring. It does not open Gllue, infer rules from prose, or authorize outreach.

```bash
opencli gllue evaluate --input <unscored-review.json> --output <new-scored-review.json>
```

Input contains `jbf.version`, explicit `jbf.scoring.criteria[]` (`id`, `label`, `weight`, `required`, `evidenceTerms`), `jbf.scoring.passScore`, unscored `candidates`, and `failures`. The command refuses an existing output path and refuses candidates that already contain `evaluation`. Missing evidence is `unknown`, not proof that a candidate lacks the capability. A required unknown blocks qualification. The output does not create outreach permission.

## get-candidate

Read standard resume fields and rendered contact records. Do not open or parse PDF attachments.

```bash
opencli gllue get-candidate --id 22878
```

**Output**: `output/candidates/candidate_<id>.json`

**Identity**: id remains the platform ID. hunterId namespaces it by tenant host; channel/sources identify Gllue; profileUrl and sourceRecord preserve origin, candidateId and readAt. Use hunterId as the unified shortlist ID without changing the platform command ID.

**Contact states**: phone/email/wechat/skype retain visible values only. not_observed means the field was not found; missing means the rendered field was empty; not_expanded means a reveal placeholder; visible_unverified does not prove correctness or permission to contact. Source record metadata is observation provenance, not the contact's original acquisition date.

**Fields**: name, company, title, phone, email, location, status, tags, owner, experience, education, lastContact, contactRecords, applyHistory. `contactRecordsScope: rendered_only` is not complete history; `contactStatus` distinguishes unexpanded and unverified values. `attachments` only records count and `contentRead: false`. Empty or wrong-identity pages fail without saving.

**Selector key**: `[data-test="detail-name:candidate"]` for name, `[data-test="detail-card-field:candidate$<field>"]` for contact fields.

## compare-candidate

Compare one observed Gllue record with proposed external fields locally. This command never opens Gllue and never writes.

```bash
opencli gllue compare-candidate --input candidate-update-input.json --output candidate-update-preview.json
```

The input must bind `candidateId`, tenant-isolated `hunterId`, `origin`, and a valid `observedAt`, plus `current` and `proposed` objects. Contact fields also consume `fieldStates` from the observed record. Supported first-phase fields are name, English name, email, mobile, WeChat, Skype, company, title, and location. It classifies each proposed field as `addition`, `conflict`, `removal_blocked`, `unknown_blocked`, or `unchanged` and refuses unknown fields or an existing output path. A blank contact value is an addition only when its observed state is explicitly `missing`; `not_expanded`, `not_observed`, and `visible_unverified` never become writable emptiness.

Only a non-empty set of additions with no conflict or deletion risk produces `readyForApproval: true`. The output contains the exact `writeSet` and `contentHash`; this is a preview for a later write command, not permission and not proof that an update happened.

## check-exists

Check if an external candidate already exists in Gllue database. Runs multiple search strategies, scores matches, returns best result.

```bash
# Via JSON file
opencli gllue check-exists --file examples/linkedin-profile.json

# Direct params (any combination)
opencli gllue check-exists --name "Raffael Krause" --email "r@example.com" --company "某公司" --title "CTO" --threshold 60
```

**Queries**: email, name, name+company; a valid LinkedIn personal identifier is only a supplemental name query, not proof of a stored LinkedIn URL match. Company or title alone is insufficient. Multiple hits for one ID merge matchedQueries and reasons.

**Scoring**: Rules compare normalized name/company/title. An email-filter result gets 60 points as a search clue: the current list does not show the email, so it is not labeled an exact email match. The score is not an identity probability. All matches retain identityConfirmed=false and reviewRequired=true; legacy exists is only a threshold flag, not approval to update or deduplicate automatically.

**`--threshold`**: Minimum rule score (integer 0-100) to set the legacy `exists` flag. Default 60; `0` is preserved, values outside the range fail before browser access. This flag never confirms identity or authorizes a write.

**Output**: `output/candidates/duplicate-check_<timestamp>.json`. CLI JSON directly returns `status` (`review_required` or `no_match_in_scope`), `identityConfirmed: false`, `totalChecked`, `bestMatch`, `matches` and `filePath`. No match in a bounded search is not proof that the person is absent; query failures throw. The earlier development output was a bare matches array; consumers of that unreleased shape must use `matches` on the new object.

At least a name, email, or valid LinkedIn `/in/` profile URL is required. Company and title only refine a query; company/title-only input or an invalid LinkedIn URL is rejected before browser access.

## update-candidate

Apply exactly one approved field from a `compare-candidate` preview. Default execution is a local dry-run and does not touch the supplied page object.

```bash
opencli gllue update-candidate --input candidate-update-preview.json --field wechat
opencli gllue update-candidate --input candidate-update-preview.json --field wechat --confirm --approval approval.json
```

Write adapters cover 15 fields in 4 control families (2026-09-29 full-parity acceptance on the synthetic `__TEST__` fixture, see `docs/test-records/gllue-update-fields-acceptance-20260929.md`):

- **text**: `wechat`, `skype`, `sourceChannel`（候选人渠道）, `highestDegree`, `email`, `mobile`, `name`（中文名）, `englishName`
- **textarea**: `certificate`
- **radio**: `gender`（男/女，动态数字 id 前缀，按 `[id$="_gender-true|false"]` 定位）
- **tree**: `nationality`（目录值如 美国）, `industry`, `function`, `owner`, `city`（层级树支持逐层展开钻取；多选树为 set 语义：清空后选目标值）

Both `addition` and `conflict`（覆盖已有值）preview entries are writable; removal risks and unverified masked contacts stay human-handled. Email/mobile are masked on the detail page ("查看" state): observation and readback both go through the edit-popover input (open editor → read input → cancel), never clicking 查看/解锁, so no contact-view quota is consumed. Real execution requires a preview with `readyForApproval=true`, exactly one field in `writeSet`, plus an approval no more than 15 minutes old that binds `candidateId`, `field`, and the preview `contentHash`. Before page access, the preview origin must match the configured Gllue tenant. After navigation, the command checks the page's actual URL rather than a cached request URL. Immediately before the only save click, it atomically claims the approval in the configured output directory; a repeat use or claim failure prevents saving. If the page already shows the target value, it cancels the editor and returns ok without claiming the approval or clicking save. After the single save click it polls read-only until the editor closes, reloads the detail page, and retries the readback (read-only reloads, not write retries) to absorb persistence lag; it returns `uncertain` without retrying the write if verification stays inconclusive. The local claim prevents replay only within the same output directory, not across devices or newly issued approvals.

## add-note

Write one 快捷备注 (quick note) to a candidate. The available options are **tenant-configured tags**, enumerated at runtime — never hardcoded.

```bash
opencli gllue add-note --id 11589 --list                       # 只读枚举当前租户配置的选项
opencli gllue add-note --id 11589 --text 等简历                 # dry-run，附 contentHash
opencli gllue add-note --id 11589 --text 等简历 --confirm --approval approval.json
```

`--list` opens the 「快捷备注」 tab and reads the tags the tenant admin configured; the returned set is whatever is configured at that moment, so a tenant adding or renaming tags changes the output with no code change. `--text` not in that set returns `no_match` with the options actually observed. Real execution requires `--text` plus a fresh approval binding `candidateId`, `origin`, `text` and `contentHash` (same 15-minute one-shot contract as `update-candidate`); the gate is checked before any page access.

Clicking the tag is the single external write: the tag's own `onClick` calls the backend save directly — there is **no confirmation dialog**. So one approval = one tag click, no automatic retry. Pages notes render in the record list (`.card__event-border`); verification compares the record count against a baseline taken just before the click, because the stored `content` is the tag's translation rather than the literal label text. The tag's own panel also contains identically-named tags, so a text match inside the panel would falsely confirm an unwritten note.

## search-jobs

Search job orders. Opens `/crm/joborder/list`, reads default rendered list.

```bash
opencli gllue search-jobs --limit 10
```

**Note**: Platform keyword submission is not yet verified. The command preserves the default page filter and scans pages, filtering title/client locally until it finds limit matches or exhausts that scope. The observed default is current-user related Live jobs, not all jobs. Read scopeGql, pagesRead, scannedCount and exhausted in the saved result; exhausted means the filtered page scope was scanned, not that all matching rows were returned when limit truncates the last page. Page failures and scope drift fail without saving partial results.

The default gql contains a `{{user.id}}` template, so pagination uses the rendered page's own next action; changing `page=` in a copied URL can return a false zero-result page. Authentication is verified from the page's observed `location.href`, not the browser wrapper's requested URL. If the adapter tab redirects to `/?next=...`, run `opencli gllue login` in that OpenCLI site session before retrying; do not interpret the redirect as zero jobs.

**Output**: `output/jobs/search-<timestamp>.json`

**Selector key**: `.grid-body-row` rows, `data-test` column selectors.

## get-job

View job order detail page.

```bash
opencli gllue get-job --id 351
```

**Implementation**: Automatically clicks the "详情" tab to trigger React rendering, then extracts fields via `[data-test="detail-field:joborder$<field>"]`.

**Fields extracted**: client, location, salary, description, owner, status, etc.

**Output**: `output/jobs/job-<id>.json`

## associate-job（默认只读；合成对象单次提交已独立回读）

默认核对目标候选人的页面身份，打开“加入项目”弹窗，按职位名称关键词检索，再用职位 ID 唯一确认可选项；结束时关闭弹窗。不选中项目，不点击“确定”，不产生关联。只读预览已在真实 Gllue 页面验收。

```bash
opencli gllue associate-job --candidateId <候选人ID> --jobId <职位ID> --jobKeyword <职位名称关键词> --output <新的审核文件.json> -f json --site-session persistent
```

`--output` 可省略；提供时只会创建新的私有审核文件，拒绝覆盖旧文件。页面登录中途失效会报鉴权错误；目标项目未唯一出现会失败，不把空结果当成功。返回的 `contentHash` 本身不是写入授权。

只有在用户对具体候选人和职位逐项批准后，才可用本轮预览文件生成 `action=associate_job`、`approved=true`、`source=current_conversation`、`approvedAt`、`candidateId`、`jobId`、`origin`、`contentHash` 均精确匹配的私有授权 JSON，再执行 `--confirm --input <预览.json> --approval <授权.json>`。命令在访问页面前校验 15 分钟时效，提交前复核项目数与职位标题；最终“确定”点击前在本机输出目录原子占用一次性授权，重复使用或无法记录均拒绝点击。只尝试点击一次“确定”；只有弹窗明确结束才重新进入详情页回读目标项目，未结束时不导航。`uncertain` 表示不能证明写入成功或失败，禁止自动重试；`projectCountScope=before_submit` 表明 `projectCount` 不是提交后的事实，`observedProjectCount` 与 `verification` 分别给出回读时见到的数量和脱敏失败阶段。占用记录只覆盖同一输出目录，不提供跨设备幂等。合成候选人 #67286 与合成职位 #3695 已单次提交、由独立页面确认关联落库；CLI 当时返回 `uncertain`，不得再次提交同一关联。后续本地代码增加回读等待与诊断字段，未通过第二次真实提交验证修复。

## add-candidate

Create a new candidate in Gllue. Opens `/crm/candidate/add`, fills form fields, optionally saves. For a confirmed save, the command checks that exactly one enabled Save button is visible before claiming the one-time local approval; an unavailable or ambiguous button does not consume it. Once claimed, an uncertain click result must not be retried automatically.

```bash
# Dry-run (default): fill form + screenshot, don't save
opencli gllue add-candidate --file candidate.json

# Only after approval of this candidate and this exact preview
opencli gllue add-candidate --file candidate.json --confirm --approval approval.json

# Changed fields require a fresh preview and approval
opencli gllue add-candidate --file candidate.json --name "张三" --mobile "13800138000"
```

**Input fields** (from `--file` JSON or CLI override):

| CLI arg | JSON key | Field | Type |
|---------|----------|-------|------|
| `--name` | `name` | 姓名 | text (React) |
| `--email` | `email` | 邮箱 | text |
| `--mobile` | `mobile` | 手机 | text (React) |
| `--wechat` | `gllueextwechat` | 微信 | text |
| `--englishName` | `englishName` | 英文名 | text |
| `--nationality` | `nationality` | 国籍（页面字段 `countries`） | TreeSelect |
| `--channel` | `gllueextChannel` | 渠道 | text |
| `--gender` | `gender` | 性别 | radio (男/女) |
| `--industry` | `industry` | 行业 | TreeSelect |
| `--function` | `function` | 职能 | TreeSelect |
| `--owner` | `owner` | 拥有者 | TreeSelect |
| `--highestDegree` | `gllueexthighestdegree` | 最高学历 | text |
| `--certificate` | `gllueextcertification` | 证书 | textarea |
| `--resume` | `resume` | 简历文本 | CKEditor paste |

**Form filling behavior**:
- Text inputs (name, mobile, email, etc.): React setter + `input`/`change` events
- Radio (gender): `.click()` + `change` event
- TreeSelect (industry, function, owner, nationality): `dispatchEvent(new MouseEvent('mousedown'))` on `.rlt-select-selector` to open dropdown, then `mousedown`+`mouseup`+`click` on `.rlt-select-tree-title` to select option. **CDP `click()` does NOT work** — must use DOM event dispatch.
- Resume paste: Opens CKEditor "粘贴文档" modal, sets editor content via `CKEDITOR.instances[].setData()`, clicks "确定"

**Save behavior**:
- Default is dry-run (fills form + takes screenshot, does NOT click save)
- Dry-run output contains `writePreview.action`, the exact normalized `candidate`, `contentHash`, `targetTenant` and `targetOrigin`
- `--confirm` alone is insufficient. Real creation also requires `--approval <json>` with `action=add_candidate`, `approved=true`, `source=current_conversation`, exact `candidateName`, `contentHash`, `tenant` and `origin`, plus an `approvedAt` no more than 15 minutes old
- Approval validation runs before authentication or any Gllue page access. Missing, future, expired, wrong-candidate, changed-content, wrong-tenant or wrong-origin approval fails closed
- The hash is `sha256:` of UTF-8 JSON after recursively sorting keys in `{ action: "add_candidate", candidate: <exact fields written> }`
- The command clicks a unique, enabled Save button at most once. A click error or any later page/readback error is `uncertain`, never an automatic retry
- Before the Save click, the local output directory atomically records that this exact approval has been used for one write attempt. Reusing the same approval, including a copied approval file, is blocked; failure to record it also blocks the click. This is a same-output-directory safety guard, not cross-device idempotency. A new approval must not be issued merely to retry an `uncertain` result—first manually check the Gllue record.
- The same-tenant `/crm/candidate/detail?id=<number>` URL supplies only an ID. `status=ok` and `externalActionCreated=true` require a separate `get-candidate` readback matching ID, name, email, mobile, company and title; hidden or mismatched fields remain `uncertain`. A single duplicate card returns `duplicate_detected` without claiming creation; multiple IDs return `uncertain`

Approval file example (create it only after the user sees the dry-run preview and explicitly approves this exact candidate and content):

```json
{
  "action": "add_candidate",
  "approved": true,
  "approvedAt": "2026-09-22T10:00:00.000Z",
  "source": "current_conversation",
  "candidateName": "Synthetic Person",
  "contentHash": "sha256:<64 hex characters from writePreview>",
  "tenant": "<writePreview.targetTenant>",
  "origin": "<writePreview.targetOrigin>"
}
```

**Known quirks**:
- Name and mobile are React-dynamic: wait for mount with retry loop (up to 20 tries × 1s)
- TreeSelect options rendered in a React portal outside the form element
- CKEditor modal needs 3-5s after button click for editor instance to load

**Output** (dry-run): `output/candidates/add-candidate-last.json` + screenshot `output/debug/add-candidate-filled.png`
**Output** (confirmed and approved): `output/candidates/add-candidate.json` with the observed ID and verification status when result capture succeeds; `uncertain` is possible after the click and must not be retried automatically
