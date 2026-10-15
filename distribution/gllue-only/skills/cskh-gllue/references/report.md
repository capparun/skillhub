# 本地审核报告

从能够解析 Gllue 插件安装目录的位置执行；`<gllue-plugin-root>` 表示实际安装的 Gllue 插件根目录：

```text
node <gllue-plugin-root>/scripts/render-review.mjs <review.json> <新的本地报告.html>
```

输出文件必须尚不存在。脚本不调用浏览器、网络或平台写接口，只渲染输入，不做评分或身份判断。

输入必需：`jbf.version`、`jbf.summary`、正整数 `requestedCount`、`candidates` 数组、`failures` 数组。另提供 `searchConditions`，如实说明平台筛选和本地评估边界。

真实批次另提供可选 `performance`：`durationMs`、`totalReadAttempts`、`successfulReads`、`failedReads`、`averageReadMs`、`maxReadMs`、`checkpointsUsed` 及 `checkpointDecision`。计数必须与 candidates/failures 一致，否则拒绝生成；不得用估算值冒充真实测速。

10 人以上批次先运行 `node <gllue-plugin-root>/scripts/batch-checkpoint.mjs init <search.json> <checkpoint.json> 10`，再运行 `claim <checkpoint.json> <worker-name>` 固定领取一组并保存返回的 claimId。逐人读取后运行 `record <checkpoint.json> <claim-id> <candidate-id> <read|existing_current_run|command_failed> <duration-ms> <complete|incomplete|unknown> [error]`。恢复时先运行 `status`，不得另领重叠组。检查点仍含 pending / claimed 时，`prepare-review.mjs` 拒绝生成不完整审核输入；完成后只从合法逐条记录计算真实耗时，外部汇总仅作一致性校验。三个脚本均在 Gllue 插件包的 `scripts/` 内，随插件安装和客户分发包交付，不依赖 Hunter 源码仓库。

每位候选人保留 get-candidate 的标准字段及 ID；补充本轮 `readStatus`（成功为 success）、`evaluation.score`、`evaluation.evidence`、`missingFields`、`contacts`（含来源/验证状态）、`contactChannels`、`outreach.allowed` 与 `outreach.reasons`、`writePreview`。未完成的字段省略或填 null，不能编造。

`contactChannels` 只接收有明确来源的结构化条目，例如 `{ "channel": "电话", "status": "visible_unverified", "evidence": "结构化记录标记" }`。审核页会将它与“可见联系记录”分开显示；未提供时明确显示历史渠道待核验。不得从备注文字、联系方式字段非空或最近联系日期推断实际使用渠道，更不能据此宣称渠道有效或推荐优先级。

### 与 Hunter 短名单衔接

`get-candidate` 的 `id` 仍是平台 Gllue ID，用于后续原子命令；新增 `hunterId`（`gllue:<租户host>:<ID>`）、`channel`、`sources`、`profileUrl` 和 `sourceRecord`（平台 ID、origin、readAt）。报告保留这两个 ID；交给统一短名单时使用 `hunterId` 作为统一 `id`，保留 `sourceRecord.candidateId` 用于平台回读。不得丢失租户后只拿数字 ID 跨库去重。

评分输入使用同一份已确认 JBF/画像及已确认的规则、权重，记录对应版本或只读 Align 路径；不是复制 LinkedIn 的字段缺失假设或关系度加分。工作、教育和联系记录保留原结构与出处，未知字段记缺失，不能为了适配格式推断年限或学历。评估产物按 hunterId 对应回原记录，分数和理由保存在 evaluation，不覆盖原始读取结果。未评分保留待评分。Gllue 与外部记录相似只产生人工复核线索，不自动合并。

`evaluate` 输出的 `shortlistProposal` 只是评分建议：统一 `id` 使用租户隔离的 hunterId，`platformCandidateId` 保留 Gllue ID，且固定 `approvalRequired=true`、`finalShortlist=false`。报告必须明确展示“不是最终短名单”。只有用户在当前对话中明确选择后，Skill 才能创建最终短名单；该选择也不构成触达或平台写入授权。

失败项使用 `{ "id": "候选人ID", "error": "失败原因" }`。报告显示实际输入数量，调用方必须核对批次完整性。失败者不能虚构 readStatus=success。

写入预览仅供审核，HTML 无提交或发送按钮，不产生授权。真实人才数据禁止作为公共示例；页面视觉验收使用合成数据。
