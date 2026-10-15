# Gllue 工作流

## 库内寻访

确认 JBF → 客户启用检查 → 询问是否查库与人数（建议 50）→ 页面预检 → 已验证的搜索条件 → 建立每 10 人检查点 → 对每位返回候选人读取标准简历并逐条落盘 → 同一 JBF 本地评估 → 本地审核交付 → 用户决定是否继续外部寻访。

keyword 仅映射姓名或邮箱；JBF 关键词用 full-text，二者不可混用。先确认 scope：mine 是我的候选人，accessible 是账号可访问人才，不声称覆盖不可访问记录。单关键词 mine 已实测，组合语法尚未验证。全文命中只提供线索，不代替 JBF 评估；有限范围无关键词列表读取须用户同意。

不读取 PDF。逐人记录读取失败、缺失信息和未展开联系方式；可见联系记录不代表全部历史。按 [报告输入](report.md) 调用本地脚本，生成 HTML 后还需打开核验，不能以文字说明冒充文件。

10 人以上批次使用 Gllue 插件随包脚本 `<gllue-plugin-root>/scripts/batch-checkpoint.mjs`：`init` 从真实搜索结果建立不覆盖的私有检查点；`claim` 固定领取下一组并返回 claimId；`record` 携带 claimId 为单个 ID 原子记录 `read` / `existing_current_run` / `command_failed`；`status` 只展示状态，不动态滑动领取范围。一个活跃组完成前拒绝新 claim，文件锁阻止并发写覆盖。恢复时沿用活跃 claimId；若详情文件已经完整落盘并通过 ID、租户和附件边界校验，记录 `existing_current_run`，不重新打开页面。所有 pending / claimed 完成后才允许 `prepare-review.mjs` 汇总。该脚本只管理本地进度，不调用 Gllue，也不扩大用户批准的人数与范围。

国际学校校长方向已有 `assets/international-school-principal-jbf-draft.json` 评分草案。它只是方便审核的起点，不是已确认业务规则；必须展示岗位层级、国际学校经历、领导经验、课程认证四项及其权重和及格线，得到用户确认后才能复制进本轮 evaluate 输入。不得因为草案随 Skill 分发而自动启用。

## 最终短名单回流

用户选人 → check-exists → 人工核对身份 → 读取已有详情 → 整批新建/更新预览 → 逐人批准 → 对应原子写命令 → get-candidate 回读核验。

当前已有 add-candidate 新建路径，先默认 dry-run，不自动添加 --confirm。dry-run 的 writePreview 必须完整展示；用户逐人批准当前内容后，才生成 15 分钟有效、同时绑定 `candidateName`、`contentHash`、`targetTenant → tenant` 与 `targetOrigin → origin` 的授权文件，并传入 `--confirm --approval <file>`。内容或租户站点变化必须重新预览和批准；安全门在页面访问前执行，最终保存点击前一次性占用同一授权。曾获批准保存的 `__TEST__` 合成候选人只验证到详情 ID，邮箱与电话未展开，严格结果仍为 `uncertain`，不得再次保存或换授权重试。

查重命中并人工确认身份后，先用 get-candidate 保存当前观察，再用 compare-candidate 生成字段级差异。addition 是已确认空字段新增；conflict 是已有非空值与建议值不同；removal_blocked 是建议清空已有值；unknown_blocked 是联系方式未展开、未观察或只是可见未验证；unchanged 不写。只有无冲突、无删除风险、无未知状态且至少一项新增时可进入授权准备。compare-candidate 不访问页面，也不代表已更新。

update-candidate 每次只选一个 writeSet 字段，默认 dry-run。真实保存必须有 15 分钟内绑定 candidateId、field 和 contentHash 的当前对话授权。点击一次保存后，编辑器未明确结束则保持页面并返回 uncertain；结束后重新打开同一详情页，只有独立回读到新值才返回 ok。当前只开放真实页面已观察的 Wechat/Skype 文本编辑器；真实保存尚未验收，不得因代码存在而称已可用。`associate-job` 默认只读预览；合成候选人 #67286 → 合成职位 #3695 已单次提交并从两侧页面独立确认落库，CLI 当时返回 uncertain，不能重试。后续新关联仍须逐项批准，遇 uncertain 先独立回读，不以提交前 `projectCount` 判断结果。找不到职位不新建职位，保留待关联事项。

关联功能的真实写入技术验收只能使用专门构造的测试候选人和测试职位，不使用真实业务记录。当前合成客户、联系人、职位和候选人均已有各自授权及验收记录；这不构成创建新测试记录、更新字段或清理旧记录的预授权。创建测试记录、关联和清理分别确认，不把一次“继续”当成三项授权。

review_required 表示有待复核线索；no_match_in_scope 表示本轮范围内无命中。两种状态都不是写入授权，规则分数不是身份确认概率。结果 uncertain 不自动重试。
