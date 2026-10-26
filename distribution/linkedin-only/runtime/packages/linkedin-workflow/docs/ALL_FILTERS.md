# SalesNav 全部可见筛选参数

2026-10-21：指定账号英文页面实际盘点，公司15项、人员33项，含各1项CRM限制字段。此清单不声称覆盖其他套餐或未来新增控件。

使用 account-search / lead-search 的 filters 对象。关键词 keywords 仍在顶层。

## account

| 参数 | 页面名称 | 输入 |
|---|---|---|
| industry | Industry | 数组 [{label,mode}]；include/exclude |
| headquarters_location | Headquarters location | 数组 [{label,mode}]；include/exclude |
| company_headcount | Company headcount | 数组 [{label,mode}]；include |
| number_of_followers | Number of followers | 数组 [{label,mode}]；include |
| fortune | Fortune | 数组 [{label,mode}]；include |
| job_opportunities | Job opportunities | 数组 [{label,mode}]；include |
| recent_activities | Recent activities | 数组 [{label,mode}]；include |
| connection | Connection | 数组 [{label,mode}]；include |
| saved_accounts | Saved accounts | 数组 [{label,mode}]；include |
| account_lists | Account lists | 数组 [{label,mode}]；include/exclude |
| annual_revenue | Annual revenue | 对象 {min?,max?,currency} |
| company_headcount_growth | Company headcount growth | 对象 {min?,max?} |
| department_headcount | Department headcount | 对象 {min?,max?,department} |
| department_headcount_growth | Department headcount growth | 对象 {min?,max?,department} |
| companies_in_crm | Companies in CRM | 当前验证账号受限，返回 feature_restricted |
## lead

| 参数 | 页面名称 | 输入 |
|---|---|---|
| geography | Geography | 数组 [{label,mode}]；include/exclude |
| current_company | Current company | 数组 [{label,mode}]；include/exclude |
| function | Function | 数组 [{label,mode}]；include/exclude |
| title | Current job title | 数组 [{label,mode}]；include/exclude |
| seniority | Seniority level | 数组 [{label,mode}]；include/exclude |
| company_headcount | Company headcount | 数组 [{label,mode}]；include |
| past_company | Past company | 数组 [{label,mode}]；include/exclude |
| company_type | Company type | 数组 [{label,mode}]；include |
| company_headquarters_location | Company headquarters location | 数组 [{label,mode}]；include/exclude |
| past_title | Past job title | 数组 [{label,mode}]；include |
| years_in_current_company | Years in current company | 数组 [{label,mode}]；include |
| years_in_current_position | Years in current position | 数组 [{label,mode}]；include |
| industry | Industry | 数组 [{label,mode}]；include/exclude |
| profile_language | Profile language | 数组 [{label,mode}]；include |
| years_of_experience | Years of experience | 数组 [{label,mode}]；include |
| groups | Groups | 数组 [{label,mode}]；include |
| school | School | 数组 [{label,mode}]；include |
| connection | Connection | 数组 [{label,mode}]；include |
| connections_of | Connections of | 数组 [{label,mode}]；include |
| persona | Persona | 数组 [{label,mode}]；include |
| account_lists | Account lists | 数组 [{label,mode}]；include/exclude |
| lead_lists | Lead lists | 数组 [{label,mode}]；include/exclude |
| people_interacted_with | People you interacted with | 数组 [{label,mode}]；include/exclude |
| saved_leads_and_accounts | Saved leads and accounts | 数组 [{label,mode}]；include/exclude |
| following_your_company | Following your company | true/false |
| viewed_your_profile_recently | Viewed your profile recently | true/false |
| past_colleague | Past colleague | true/false |
| shared_experiences | Shared experiences | true/false |
| changed_jobs | Changed jobs | true/false |
| posted_on_linkedin | Posted on LinkedIn | true/false |
| first_name | First name | 字符串 |
| last_name | Last name | 字符串 |
| people_in_crm | People in CRM | 当前验证账号受限，返回 feature_restricted |

## 语义与限制

- 年收入以所选币种的百万为单位；min/max使用页面支持的档位，最大值1001代表页面1000+。currency必填。
- 人数增长以百分比为单位；部门人数以人为单位。department必须为filter-options返回的英文部门名称。范围至少有一个边界，min不得大于max。
- 开关false表示不启用该条件，不等于“排除满足该条件的人”。每次请求重建完整条件；全false且无其他条件会拒绝。
- 实体/枚举选项来自页面，禁止猜ID；排除仍需当次候选实际提供。Groups、School、Connections of等动态值不存在或歧义时失败，不删条件继续。
- CRM输入已注册，但当前Core账号无集成控件，执行适配尚未验证，当前实现明确拒绝；不把锁定字段当作已可执行。
- Persona仅选择已有画像，不创建/编辑画像。列表仅筛选已有列表，不保存/修改名单。

## 验证状态

- 网页发现覆盖48字段；普通选项的多项真实URL映射已记录在私有本地回执，数字/文本/六个开关有实际选择证据。
- 正式CLI真实验证：4种范围组合（收入、公司增长、部门人数、部门增长）；姓名+换工作开关；粉丝数。每组1条结果，requested/applied一致，自动关闭自有页。
- 其他新增字段复用相同引擎，但尚未每字段独立跑完整CLI；不宣称全字段实测完毕。
- 搜索网页适配测试与名单业务合格是两个结论，本轮不进行公司寻访。
