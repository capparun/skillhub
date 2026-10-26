# 场景化补充寻访渠道

## 用途与边界

补充渠道用于扩大候选人发现视野、校验目标机构，或规划后续关系网络；它们不是平台插件，也不是立即执行的搜索任务。Align 每次最多建议 1 至 2 条最贴合职位的路线，并必须与用户一起确认。

| 标识 | 适用情况 | 建议动作 |
|---|---|---|
| `target-organization-mapping` | 稀缺岗位、目标雇主或学校明显 | 绘制目标机构、相邻职能和可能的人才流动路径 |
| `professional-association` | 专业认证、行业圈层或地区社群重要 | 识别相关协会、专业社群和活动名单 |
| `alumni-network` | 学历、培训体系或前雇主背景有信号 | 确定相关院校、项目或企业校友网络 |
| `referral-network` | 保密、信任关系或被动候选人优先 | 规划可向客户和已知行业联系人确认的转介绍方向 |
| `conference-speaker-list` | 专业影响力、公开表达或专家型角色重要 | 识别公开会议演讲者和专业内容作者作为研究线索 |

## 输出格式

将确认后的建议写在 `channelStrategy.supplementary`：

```json
{
  "channel": "target-organization-mapping",
  "label": "目标机构图谱",
  "type": "research",
  "reason": "岗位稀缺，需从目标学校与相邻机构扩展人才池",
  "manualNextStep": "确认目标机构清单后，再决定是否开展公开信息研究"
}
```

`type` 使用 `research` 或 `network`。这部分保留在 Align 报告中供顾问使用，但不写入 SourcingRequest 的 `confirmedChannels`。

## 执行约束

- 不因确认该建议而自动浏览、搜索、抓取、导出联系人或发送消息。
- 任何外部触达、上传或使用具体数据源，均需在后续流程取得即时授权，并遵循该渠道的规则。
- 仅使用合法公开信息；不得绕过访问限制或把补充渠道伪装成平台搜索命令。
