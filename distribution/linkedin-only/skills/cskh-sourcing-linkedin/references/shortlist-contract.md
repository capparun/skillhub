# LinkedIn 两级短名单契约

## 初选名单

`preliminaryShortlist` 仅控制详情读取范围，不能进入触达：

```json
{
  "preliminaryShortlist": [
    {
      "candidateId": "linkedin-profile-id",
      "profileUrl": "https://www.linkedin.com/in/example/",
      "initialEvaluation": {
        "score": 82,
        "qualified": true,
        "reasons": ["列表字段支持的入选理由"],
        "risks": ["尚待详情核验的要求"]
      },
      "detailPriority": 1,
      "evidenceGaps": ["完整任职年限"]
    }
  ]
}
```

## 深读决定与结果

```json
{
  "detailReviewDecision": {
    "enabled": true,
    "confirmedAt": "ISO-8601",
    "source": "current_conversation"
  },
  "detailFetch": {
    "profile": "success",
    "experience": "success",
    "projects": "not_requested"
  }
}
```

关闭深读时 `detailReviewDecision.enabled` 为 `false`，最终候选人的 `evidenceLevel` 必须为 `list_only`。

## 最终复评与短名单

`initialEvaluation` 不得被覆盖。详情读取后另存 `finalEvaluation`：

```json
{
  "finalShortlist": [
    {
      "candidateId": "linkedin-profile-id",
      "profileUrl": "https://www.linkedin.com/in/example/",
      "initialEvaluation": { "score": 82, "qualified": true },
      "detailFetch": { "profile": "success", "experience": "success" },
      "finalEvaluation": {
        "score": 88,
        "qualified": true,
        "changeReasons": ["详情证实目标公司任职范围"]
      },
      "evidenceLevel": "profile_and_experience",
      "recommendationReason": "基于最终证据的推荐理由",
      "evidenceGaps": []
    }
  ]
}
```

只有 `finalShortlist` 可以交给 `cskh-outreach`。初选名单、详情读取失败记录和未入选候选人均保留在项目文件中供审计。
