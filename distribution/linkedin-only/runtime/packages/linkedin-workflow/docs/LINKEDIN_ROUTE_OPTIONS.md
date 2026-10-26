# 账号能力与普通路径：本轮开发契约

日期：2026-10-25。开发中，未发布。

## 使用方法

`HUNTER_OPENCLI_ENTRY=/absolute/path/opencli.mjs node src/linkedin-cli.mjs route-options input.json`

这是本地方案检查，不访问页面、不读取余额、不自动选择或执行替代路径。输入 candidates 为标准平台请求列表（provider、operation、account、input）；observations 为调用方提供的能力证据列表。每条证据包括 provider、operation、profile、identity_url、status、observed_at、expires_at、source，可附 reason。时间为 ISO 字符串，status 为 available/unavailable/unknown/blocked。

输出逐项 eligible/unavailable/needs_check/blocked/unsupported。账号、操作必须精确匹配；过期、缺少证据不能开放。Premium 等套餐标签不授予操作权限。任何被检查路径 blocked 时，整体返回 blocked，不能据此自动切换另一条路线。eligible 仅表示提供的证据支持计划；正式 execute 仍核对身份和平台状态。该命令不是可信权限凭证签发器。

## 新增普通读取

通过原有 plan/execute/task-execute 使用：

| operation | input | 输出 |
|---|---|---|
| company.read | company：公司 slug 或完整 www.linkedin.com/company 链接 | 公司资料行；保留原始响应 |
| person.experience | profile_url：精确个人主页 | 一个实体下的多段 experience；section_count 为经历条数 |
| person.projects | profile_url：精确个人主页 | 一个实体下的多段 projects；section_count 为项目条数 |

经历/项目不会每段变成一个候选人；主页不匹配返回错误；每次读取消耗一个本地详情预算。字段缺失不推断当前任职。新普通入口已通过合成测试，尚未真实账号验收。

## 验收与剩余项

194项测试通过；新增普通路径用合成进程回执穿过账号核对、网关、任务记录、详情、模型评估、HTML/CSV，不调用 SN。此测试不是浏览器真实端到端。route-options 覆盖无 SN、Premium 无权限证据、过期、跨账号、阻塞及 RPS 不支持。

普通搜索旧 scout 推广文字误判补丁已获准应用：一次真实普通搜索、一页，解析9条并返回3条，不再误报。limit目前只限制输出；完整普通深读与报告真实链路仍待验收。新增触达交接函数尚未暴露为CLI，未视为已交付；通用商务 Outreach、实际权益自动检测、真实普通链路、最终包和发布仍未完成。

### 真实普通入口追加验证

2026-10-25：复用3人真实搜索回执，通过统一execute读取1人主页（partial）及独立经历（9段，completed），随后离线恢复真实回执到任务并生成HTML/CSV。没有重复搜索。确认搜索命中可来自历史任职，报告必须区分当前与过去。此验收不是免费账号权益验证，也不是从新建任务自动派发全部平台操作的完整E2E；人员项目读取尚未真实验证。私有回执不随包分发。

## 名单交接：task-prepare-outreach

`node src/linkedin-cli.mjs task-prepare-outreach input.json`

输入示例（本地准备，不访问平台）：

```json
{"directory":"/absolute/private/task","task_id":"people","assessment_id":"review-v2","handoff_id":"outreach-v1","person_keys":["https://www.linkedin.com/in/example"],"purpose":"介绍本次招聘岗位"}
```

输出为本地 `.outreach.json`，含姓名、精确公开主页、入选理由、证据、来源任务与资料版本；固定 `prepared_not_approved`、`executionAllowed:false`。名单必须来自人员任务且已评估为符合，不能传入未评估对象、重复选择或仅有 SalesNav 内部链接的对象。同一 handoff_id 再次使用返回文件已存在，不覆盖旧内容。

### 新资料使旧判断失效

评估绑定当前资料版本。新增读取、搜索结果或错误处理记录后，旧评估不可直接生成新报告或新交接，返回 `assessment_stale`；重新评估并使用新 assessment_id。旧评估文件未记录版本时同样要求重评，不静默迁移。报告和交接文件仍是历史快照；准备实际触达时必须重新核对当前任务资料版本，文件存在不等于仍有效或已批准。

后续仍进入既有 cskh-outreach 的候选人门、关系核验与逐项发送审批。本命令没有调用这些流程，也不生成审批信息。现有接收流程要求招聘JD/JBF；通用商务联系尚未整合，不宣称适用所有联系目的。

198项测试通过，包括正式CLI准备、旧判断失效、重评后恢复、错误对象、重复选择、公开主页缺失、旧格式评估和禁止覆盖。未执行真实消息读取或发送。

## 转成旧 Outreach 的单人输入

`node src/linkedin-cli.mjs task-outreach-input input.json`

输入：directory、task_id、handoff_id、person_key，以及 recruiting_context（confirmed:true、description、source，来自实际已确认岗位资料，不可伪造）。输出 collector_input.candidate、purpose、recruitingContext。旧收集脚本一次处理一人，不接受整份 finalShortlist 作为 candidate。

命令核对当前任务与交接版本；新资料或新评估使旧交接失效。缺少岗位背景、目标不在名单中时拒绝。固定 awaiting_candidate_approval，绝不生成 candidateApproval。后续须按旧Skill获得当次候选人批准，再在使用前重新核对版本；此命令不调用旧脚本、不读取关系、不发送。

实际旧 collect-outreach-context 模块已用合成人员验证：缺少批准立即拒绝，注入的平台执行器调用数为0。这个验证不是已批准链路或真实发送验收。当前支持招聘资料衔接；通用商务流程仍待设计。

## 自动读取账号检查：account-inspect

`HUNTER_OPENCLI_ENTRY=/absolute/path/opencli.mjs node src/linkedin-cli.mjs account-inspect input.json`

输入为 account（profile、expected_identity、expected_profile_url）和 candidates（provider、operation、input数组）。最多20项，只按涉及的平台执行一次现有 account.inspect；不会执行 candidates 中的搜索、详情或消息，也不会为普通任务打开SN。返回自动取得的 observations、routes 和原诊断回执。

普通入口目前只确认身份，搜索权限仍为 needs_check，套餐与余额为 unknown；没有已验证的普通订阅读取能力。SN复用已有诊断，只有明确读取到的搜索入口权限、套餐和当前余额才保留；搜索权限不推出详情、API或发送权限。RPS保持unsupported。不使用本地tier配置或月度赠送数作为权限或余额。

身份失败、登录验证等阻塞停止后续检查；整体blocked。失败回执保留原因，不泄露原始异常文本。观察只用于短期计划参考（当前60秒），正式执行仍校验身份和实际目标，余额不作为发送授权。当前未实现跨调用账号检查缓存。

验证：204项回归通过。真实试运行得到identity_unconfirmed，未执行搜索；这是阻塞证据，不是自动检查真实通过。免费账号、普通订阅与余额、完整自动权限选择仍未验收。此更新晚于dev.12候选包，不在此前候选包中。

### 按需读取订阅页

account-inspect 可设 include_subscription:true。新确定性读取器只读取订阅页 Plan Details 区域中的已识别套餐与续期原文；推广、徽章、未知布局和冲突字段不证明套餐。识别为SN后再读对应设置页；两处套餐一致才接受可见余额。未显示余额保持unknown，续期日期不等于InMail重置日期。不据订阅值自动授予搜索或发送权限。读取前后核对身份并清理本命令标签；默认不开订阅页。当前支持已观察的英文结构，其他结构需单独适配。
