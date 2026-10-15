# LinkedIn 使用说明更新

## 范围与依据

用户要求LinkedIn页面对应猎聘/Gllue做相同使用说明更新，沿用检查后上线流程。仅改LinkedIn页面3文件：landing.tsx、usage-examples.tsx、usage.module.css。

内容以线上soho-sourcing 2.0.15正式包为准，下载SHA256 d487f6bf9696341d62f7721b759c29377703db85f00daa277dd535498fdc319b。已读取包内cskh-sourcing-linkedin Skill 1.7.1核对能力。

10项示例，默认3项；分需求与搜索、详情与复核、评估与报告、连接与排错。每项含输入、输出、完整问法。遵循先确认画像、限定本轮规模、详情默认关闭与按需深读、两阶段复评、四格式本地报告。公开摘要不当作核实履历，解析缺失不当作不符合，不自动发送邀请或消息。

## 验证

TypeScript与ESLint通过；本地浏览器默认3项/全部10项、分类、展开、复制成功反馈通过；320/390px无横向溢出，手机视觉检查通过。未验证系统剪贴板实际粘贴。Spec与Standards复审均无阻塞。仅用户说明变化，不执行真实LinkedIn账号业务。

## 发布来源

基线为猎聘说明上线部署6ad07d43b94765dbcff03592，对应固定快照/private/tmp/liepin-usage-deploy。候选/private/tmp/linkedin-usage-deploy，完整文件清单见LINKEDIN_USAGE_SOURCE.json。只覆盖LinkedIn 3文件，其余现网页面及安装包保持现状。

使用现有scripts/deploy-zeabur.sh上传；失败可用基线快照同脚本回滚，不切换产品版本记录。
