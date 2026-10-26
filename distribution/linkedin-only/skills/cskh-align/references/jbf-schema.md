# Job Briefing Form 标准字段

当输入为 JBF，或用户要求按 JBF 格式输出时，`align.json` 必须包含完整的 `jobBrief`。原文未填写的字段保留为空值，并由 `jbfCompletion` 标记为“暂缺”或“不适用”；不得删除字段或用模型推断冒充原始答案。字段状态与来源规则见 `jbf-completion-workflow.md`。

## 字段结构

```json
{
  "jobBrief": {
    "meta": {
      "consultant": "",
      "date": "",
      "positionTitle": "",
      "client": "",
      "location": "",
      "website": "",
      "contactName": "",
      "contactTitle": "",
      "contactEmail": "",
      "contactPhone": ""
    },
    "companyProfile": {
      "globalRevenue": "",
      "globalHeadcount": "",
      "countryRegionRevenue": "",
      "countryRegionHeadcount": "",
      "historyProductsServices": "",
      "majorCustomersSuppliersCompetitors": "",
      "objectivesGrowthTargets": "",
      "offLimits": ""
    },
    "vacancy": {
      "type": "",
      "reason": "",
      "openDuration": "",
      "competingAgencies": "",
      "interviewedCandidates": "",
      "availableCandidates": "",
      "confidential": "",
      "disclosureStage": ""
    },
    "candidatePersonalData": {
      "ageExperience": "",
      "preferredNationality": "",
      "education": "",
      "languages": ""
    },
    "positionScope": {
      "mainChallenges": "",
      "keyFocus": "",
      "mustHave": "",
      "travelRate": "",
      "careerPath": ""
    },
    "organization": {
      "directManagerName": "",
      "directManagerTitleLocation": "",
      "organizationChart": "",
      "dottedManagerName": "",
      "dottedManagerTitleLocation": "",
      "directIndirectReports": "",
      "entitiesCovered": ""
    },
    "cultureLeadership": {
      "companyCulture": "",
      "lineManagerBackgroundStyle": "",
      "idealPersonalityStyle": "",
      "teamLeadershipNeeds": ""
    },
    "compensation": {
      "salary": "",
      "bonus": "",
      "benefits": "",
      "interviewProcess": [],
      "finalDecisionMaker": ""
    },
    "sellingPoints": [],
    "screeningQuestions": []
  }
}
```

## 数据原则

- `jobBrief` 保存原始业务底稿及用户明确修正后的值。
- 模型推导的人才画像、风险、渠道和搜索参数分别保存在 `persona`、`risks`、`channelStrategy` 和 `searchParameters`，不得混入 JBF 原始字段。
- 原文与用户修正冲突时，以用户修正为准，并保留风险说明。
- 列表型字段可以使用字符串数组；单值字段使用字符串。
- HTML 输出顺序固定为：JBF 十个章节 → 对齐结论 → 搜索确认。
