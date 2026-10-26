# 通用筛选搜索闭环（dev.20）

本版修复平台执行，不固定任何公司、行业或业务标准。按输入精确选择、核对实际查询，结果就绪后区分有结果、零匹配、执行失败；业务是否达标仍由模型依据任务判断。

## 正式入口与输入

`opencli hunter-linkedin salesnav-lead-search --input search.json`

```json
{
  "profile": "example-profile",
  "expected_identity": "Example User",
  "expected_profile_url": "https://www.linkedin.com/in/example-user/",
  "filters": {"current_company": [{"label": "Example (Region)", "mode": "include", "lookup_query": "Example"}]},
  "limit": 3,
  "max_pages": 1,
  "evidence_directory": "/absolute/path/new-private-evidence"
}
```

`lookup_query`只查候选，最终公司仍须精确匹配label。`evidence_directory`可省略；指定时必须为新目录且父目录存在，不覆盖已有证据。只在本地保存截图，可能包含账号及专业资料；不放入分享包。

## 操作与输出

| 步骤 | 平台执行 | 可核对的输出 |
|---|---|---|
| 账号检查 | 核对明确Profile、本人URL与工作区 | 身份不明或明确无权限时停止 |
| 候选选择 | 精确匹配字段/名称/模式，滚入可视区，检查裁剪/遮挡，重新定位后点击 | 不选择其他同名/近似候选；未发出点击的失效定位只局部重新观察一次 |
| 条件验证 | 核对实际URL查询和字段标签 | requested/applied及查询指纹；不是仅回显输入 |
| 结果等待 | 加载完成且查询、账号一致后读取 | 返回数、分页、完整性、stop_reason及interruption |
| 零匹配 | 无卡片、空提示、独立0 results且再次确认 | verified_empty，不把加载中/失败当零匹配 |
| 截图证据（可选） | 关闭前读取就绪状态、截图、再次核对 | ui_evidence.status=captured、图片与evidence.json；截图失败独立标failed |
| 执行失败 | 保留错误与现场截图，清理自有会话 | 阶段/最后操作/耗时/cleanup；不盲重跑、不改其他用户标签 |

正常结果不足目标或达到页数/数量范围仍须说明partial，不声称全量。纯关键词API结果不等同工作区画面，该模式截图证据返回unsupported_evidence；不影响对API结果的独立验收。截图核对使用现有操作计数，不擅自提高或另设停止预算。

## 验收边界

本地回归覆盖可视区/裁剪/遮挡、精确名称、加载中、矛盾空提示、明确零匹配、失效选择器、超时不重放、证据前后查询变化以及关闭前截图顺序。真实验收、失败和候选来源另存本地任务记录；不把受控测试当真实网站通过，不固定历史结果为未来预期。

当前未证明全部高级组合、所有窗口状态或其他账号长期稳定。RPS、发送和邀请不属于本轮；未改共享扩展/全局OpenCLI或正式发布。正式交付前仍需固定源码构建、核对包内文件，并用解包入口实际执行案例。

预算口径：request_budget未提供时只记录消耗，不再默认设置120次停止上限；显式提供时按该值执行。单次操作技术超时、就绪判定及平台限制处理不变。次数/时间/费用的任务停止预算应先由用户确认，不从模型建议或旧案例自动继承。

## 发布状态说明

固定dev.20候选已完成指定零匹配与非空人员搜索的解包真实验收；这不等于全能力发布。后续工作区差异、各能力证据及发布条件见[发布就绪清单](RELEASE_READINESS.md)。
