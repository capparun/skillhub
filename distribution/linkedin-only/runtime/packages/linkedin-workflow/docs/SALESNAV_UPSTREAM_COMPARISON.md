# SalesNav 上游与自研对比 · 2026-10-25

范围：本机OpenCLI2.0.1上游与自研dev.16；同一已核对身份的Profile，搜索关键词SPD Scientific，输出limit=1。仅小样本、单次时延，不代表性能基准。原始私有回执在.local/upstream-comparison，不分发。

| 上游命令 | 实现与输出 | 自研对应关系 | 本轮验证 |
|---|---|---|---|
| linkedin salesnav-search | 登录态内调用SalesNav搜索接口，keywords+limit(1–500)，自动API分页；姓名/职位/公司/地点/关系度/两种主页URL/recipient_urn | hunter-linkedin salesnav-lead-search通过页面控件筛选，可传高级filters、max_pages、身份绑定、预算；返回应用筛选、partial/游标及会话清理。自研另有公司搜索，上游该命令只有人员搜索 | 上游5.59秒返回1人；自研31.83秒返回partial/page_incomplete、0条，会话关闭。不得把ok:true视为业务成功 |
| linkedin salesnav-inbox | 列会话，limit、max-pages、unread-only；会话ID、摘要、未读数、参与人 | 没有重复自研SalesNav收件箱，也未映射到统一任务网关；普通LinkedIn inbox不是同一收件箱 | 2.97秒EMPTY_RESULT/66；只证明当前空结果路径 |
| linkedin salesnav-thread | 按会话ID/URL或人名/人员标识读取历史，支持limit/max-pages | 没有重复自研SN会话读取；普通thread-snapshot不是等价替代 | 收件箱无样本，未调用真实会话；不编造ID |
| linkedin salesnav-message | recipient、subject、body，send默认false，copy-to-crm默认false；读取人员限制和额度，发送后验证 | 没有自研SN InMail执行器。execute-approved-outreach目前仅regular LinkedIn connect/first_message/existing_thread；不能把它当SN发送审批层已接通 | 模拟page执行上游真实函数，send=false：2个模拟GET、0个POST、validated_dry_run。真实发送不执行 |

## 本轮结论

1. 简单人员关键词搜索应优先复用上游，避免重复维护同样的读取；这只是建议，尚未自动改变路由。
2. 自研独有价值是高级筛选、公司研究、精确账号绑定、覆盖/预算/续跑及业务报告；当前页面读取出现page_incomplete，需单独修复/验收。
3. 收件箱与历史读取优先复用上游；要进入统一任务流还需新增稳定操作映射与输入输出转换，不等于已有完整接入。
4. 上游message默认dry-run，但--send true会进入发送，没有Hunter当前对话审批对象的校验；不要直接让业务Agent绕过现有授权约束。后续需明确SN发送审批桥接再做独立验收。
5. OpenCLI上游适配器调用的是LinkedIn网页内部接口，不是LinkedIn公开官方API；仍可能因站点接口变化失效。不要将本轮成功外推全部套餐或筛选。
