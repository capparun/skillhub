/** Resolve the shipped transport before generating user installation instructions. */
export function isLiepinMcpRelease(version?: string): boolean {
  const parts = version?.match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  return !!parts && (Number(parts[1]) > 0 || Number(parts[2]) >= 3);
}
export function liepinMcpGuide(input: { version: string; sha256: string; command: string; platform: 'mac' | 'windows'; keyword: string; city: string }) {
  const system = input.platform === 'windows' ? 'Windows PowerShell' : 'macOS 终端';
  return {
    environment: '请准备猎聘 MCP 搜索环境：检查 Node.js 22+、配套 npm 和 Chrome，并确认我使用的本地 AI 助手支持 MCP。安装包会提供固定 opencli-mcp 依赖和猎聘 Site Adapter。先报告实际系统、Node/npm版本及助手名称；安装、浏览器连接、客户端发现和首次业务分别核对。',
    install: `请在${system}安装猎聘 MCP 独立包。执行网站安装命令：\n${input.command}\n\n版本：${input.version}\n安装包 .tar.gz SHA-256：${input.sha256}\n此哈希只校验下载包，不用于校验 install.ps1。安装前确定当前使用的 AI 助手及其 Skill 绝对目录。先为本次安装进程设置 HUNTER_SKILLS_DIR 指向已确认目录，再执行上面的命令；不要修改系统全局环境。macOS应让变量同时传入执行安装的bash进程，Windows使用当前PowerShell的$env:HUNTER_SKILLS_DIR。记录实际选择，避免安装到无关项目。\n包根 install.mjs 会准备持久运行时、hunter-liepin-mcp Skill和浏览器资产，再执行本地 doctor。请报告安装回执路径、Skill目录、extensionDirectory、expectedExtensionId与mcpServer配置。status=local-installed-browser-setup-required表示本地装好，下一步仍要接入浏览器和客户端。不要把本地检查说成业务通过。`,
    connect: '请按 hunter-liepin-mcp Skill和客户安装回执接入浏览器。使用回执中的持久兼容扩展目录，在Chrome加载并核对实际ID与expectedExtensionId；保留一份兼容扩展启用，旧版作为回退。先展示browser-setup接入计划，按我的授权应用并保留回滚收据。把回执mcpServer中的Node命令和参数配置到我选定的AI助手，保留其他MCP设置；确认Skill和官方liepin Site Adapter可发现。\n我会登录猎聘并打开找简历。先用tabs读取已有标签，再bind准确tab_id和完整URL；只读核对页面，不搜索、不修改筛选。分别报告本地检查、扩展通信、助手发现和页面绑定结果，失败时给出具体步骤。保持已验证兼容环境，不反复拆装扩展。',
    search: `请使用 hunter-liepin-mcp Skill与官方liepin Site Adapter完成一次试搜。关键词：${input.keyword.trim() || '请先询问我'}；城市：${input.city.trim() || '不限'}。先整理需求，并在搜索前询问本次收藏目标分组列表，可选择本次不收藏；同一任务复用已确认选择。选择分组不等于授权收藏人选。\n展示筛选方案，我确认后记录任务和本轮范围，绑定现有页面，执行一次首页搜索、最多读取5条，不翻页。本轮不执行收藏、方案写入或联系。以结构化列表及本地可视化报告交付，区分页面总数、实际保存条数、详情已读与部分可见。结果不明先核对，不重复提交。`,
  };
}
export function liepinMcpUsagePrompt(id: string, original: string): string {
  let prompt = original.replaceAll('hunter-liepin-search', 'hunter-liepin-mcp').replaceAll('liepin 插件', 'liepin Site Adapter');
  if (id === 'connect') prompt = '请使用客户安装回执与hunter-liepin-mcp Skill核对连接：本地doctor、持久兼容扩展及Native通信、当前助手的MCP发现分别检查。使用官方liepin Site Adapter的tabs/bind复用已打开页面，核对准确tab_id和完整URL。只检查连接，不搜索、不设置筛选；报告实际结果，不反复切换扩展或重装。';
  if (id === 'search') prompt = '请使用 hunter-liepin-mcp 按岗位找人：【粘贴JD】。先探索关键词，整理硬条件、可接受例外和详情核实项；把平台可表达的硬条件落实到筛选条，向我展示方案并确认本次覆盖范围。搜索前集中询问本次收藏目标分组列表，也可明确不收藏，同一任务复用已确认选择。用户未限定读取量时先保存当前完整页（最多30条），再按职位相关证据决定详情队列，不把安装试搜5条当作正式寻访上限。标准和收藏授权确认后，将值得跟进的人选加入准确目标组并独立核实归属；收藏代表跟进池，不是最终录用判断。交付顶部统计、重点表格、简历链接和独立原始记录的本地报告。只操作授权轮次，不自动联系、解锁或翻页，未知结果先核对。';
  if (id === 'favorites') prompt += ' 添加时使用搜索前确认过的准确现有分组；尚未选定或原组不存在时先询问，不默认未分组，不创建新组。';
  if (id === 'saved') prompt += ' 保存前核对已提交的非关键词筛选摘要及可见保存入口；仅关键词或输入草稿不足时说明前置，不自动添加条件。';
  return prompt;
}
