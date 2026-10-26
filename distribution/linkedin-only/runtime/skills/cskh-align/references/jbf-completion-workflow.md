# JBF 基线与字段补全

## 基本规则

所有输入先映射到 JBF，再产生画像和寻访策略。`jobBrief` 保存字段值，`jbfCompletion` 保存每项的可靠性与处理状态；两者不能互相替代。

```json
{
  "jbfCompletion": {
    "status": "draft",
    "fields": {
      "vacancy.reason": { "status": "confirmed", "source": "meeting_notes" },
      "organization.directIndirectReports": { "status": "pending", "source": "missing" },
      "companyProfile.globalRevenue": { "status": "not_applicable", "source": "user_confirmation" }
    }
  }
}
```

`status` 只能是：

- `confirmed`：字段已有可用内容，或用户确认该内容。
- `pending`：尚未获得内容；必须在交付前向用户可见并被接受。
- `not_applicable`：用户明确确认该字段不适用。

`source` 使用 `document`、`meeting_notes`、`user_confirmation`、`derived` 或 `missing`。`derived` 只能作为待核实线索，不能把推导内容写成已确认事实。

## 补全节奏

1. 先澄清会决定人才池的字段：招聘背景、岗位范围、候选人要求、地点与薪酬。
2. 再按 JBF 章节补全组织与文化、薪酬流程、候选人卖点与初筛问题；每次只问 1 至 2 项。
3. JBF 交付前，展示暂缺与不适用字段摘要，并让用户确认该 JBF 是项目基线。
4. 只有确认后的 JBF 才可定稿画像和渠道策略；后续变更须回写 JBF 和对应字段状态，再重新确认受影响结论。
