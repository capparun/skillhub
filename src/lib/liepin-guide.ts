import {liepinExtensionFor} from './liepin-browser-assets';
/** Resolve the shipped transport before generating user installation instructions. */
export function isLiepinMcpRelease(version?: string): boolean {
  const parts = version?.match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  return !!parts && (Number(parts[1]) > 0 || Number(parts[2]) >= 3);
}
export function liepinMcpGuide(input: { version: string; sha256: string; command: string; platform: 'mac' | 'windows'; appUrl?: string; keyword: string; city: string }) {
  const system = input.platform === 'windows' ? 'Windows PowerShell' : 'macOS 终端';
  const extension=liepinExtensionFor(input.version);
  const extensionSource=extension&&input.appUrl ? `独立扩展ZIP：${new URL(extension.downloadPath,input.appUrl).href}\nZIP SHA-256：${extension.sha256}。此哈希只校验扩展ZIP，不用于完整安装包。` : '独立扩展请使用本页与产品版本匹配的下载入口；没有匹配版本时使用安装回执中的extensionDirectory，不猜链接。';
  return {
    environment: '请准备猎聘 MCP 搜索环境：检查 Node.js 22+、配套 npm 和 Chrome，并确认我使用的本地 AI 助手支持 MCP。安装包会提供固定 opencli-mcp 依赖和猎聘 Site Adapter。先报告实际系统、Node/npm版本及助手名称；安装、浏览器连接、客户端发现和首次业务分别核对。',
    install: `请在${system}安装猎聘 MCP 独立包。执行网站安装命令：\n${input.command}\n\n版本：${input.version}\n安装包 .tar.gz SHA-256：${input.sha256}\n此哈希只校验下载包，不用于校验 install.ps1。安装前确定当前使用的 AI 助手及其 Skill 绝对目录。先为本次安装进程设置 HUNTER_SKILLS_DIR 指向已确认目录，再执行上面的命令；不要修改系统全局环境。macOS应让变量同时传入执行安装的bash进程，Windows使用当前PowerShell的$env:HUNTER_SKILLS_DIR。记录实际选择，避免安装到无关项目。\n包根 install.mjs 会准备持久运行时、hunter-liepin-mcp Skill和浏览器资产，再执行本地 doctor。请报告安装回执路径、三个Skill目录、extensionDirectory、expectedExtensionId与mcpServer配置。安装后必须继续展示Chrome扩展加载步骤和实际绝对目录：打开chrome://extensions，开启开发者模式，点击“加载已解压的扩展程序”选择该目录。扩展加载后核对实际ID，再预览并应用浏览器通信接入计划，调用MCP doctor验证宿主连接；需要用户操作时停在具体动作处。不得省略此步骤或说已经全部装好。status=local-installed-browser-setup-required表示本地装好，下一步仍要接入浏览器和客户端。不要把本地检查说成业务通过。`,
    connect: `请按hunter-liepin-mcp Skill和安装回执完成浏览器接入。本阶段不打开猎聘、不搜索、不读取简历。
1. 读取回执的extensionDirectory、expectedExtensionId与assetsFile，先核对Chrome当前个人资料是否已有匹配扩展；有则复用，不重复加载。
2. 若没有扩展，优先使用安装回执中的持久目录。请给用户实际绝对路径及明确操作：打开chrome://extensions→开启开发者模式→点击“加载已解压的扩展程序”→选择extensionDirectory。若用户只有独立ZIP，下载校验后解压到持久目录，选择含manifest.json的HL-MCP文件夹；不能选择ZIP或系统临时目录。
${extensionSource}
独立ZIP只提供扩展，不能替代完整组件及本机宿主安装。
3. 核对实际扩展ID与expectedExtensionId一致。只保留一份匹配兼容扩展启用，不擅自删除其他扩展。
4. 用assetsFile和实际ID运行包内browser-setup plan，展示差异；按授权apply并保存回滚收据，不手改注册表或通信文件。
5. 使用回执mcpServer配置接入所选助手，保留其他MCP设置，通过当前对话实际调用MCP doctor。host_unavailable只表示宿主未连，不直接判定扩展未安装。
分别报告本地组件、扩展加载、本机通信、助手MCP、浏览器宿主状态。doctor确认宿主已连接后，本阶段才算完成；猎聘页面绑定与业务另行执行。`,
    search: `请使用 hunter-liepin-mcp Skill与猎聘 Site Adapter完成一次试搜。关键词：${input.keyword.trim() || '请先询问我'}；城市：${input.city.trim() || '不限'}。先整理需求，并在搜索前询问本次收藏目标分组列表，可选择本次不收藏；同一任务复用已确认选择。选择分组不等于授权收藏人选。\n展示筛选方案，我确认后记录任务和本轮范围，绑定现有页面，执行一次首页搜索、最多读取5条，不翻页。本轮不执行收藏、方案写入或联系。以结构化列表及本地可视化报告交付，区分页面总数、实际保存条数、详情已读与部分可见。结果不明先核对，不重复提交。`,
  };
}
export function liepinMcpUsagePrompt(id: string, original: string): string {
  let prompt = original.replaceAll('hunter-liepin-search', 'hunter-liepin-mcp').replaceAll('liepin 插件', 'liepin Site Adapter');
  if (id === 'connect') prompt = '请使用客户安装回执与hunter-liepin-mcp Skill核对连接：本地doctor、持久兼容扩展及Native通信、当前助手的MCP发现分别检查。使用猎聘 Site Adapter的tabs/bind复用已打开页面，核对准确tab_id和完整URL。只检查连接，不搜索、不设置筛选；报告实际结果，不反复切换扩展或重装。';
  if (id === 'search') prompt += ' 搜索前集中询问本次收藏目标分组列表，也可以明确不收藏；同一任务复用选择，不把选组当作批量收藏授权。';
  if (id === 'favorites') prompt += ' 添加时使用搜索前确认过的准确现有分组；尚未选定或原组不存在时先询问，不默认未分组，不创建新组。';
  if (id === 'saved') prompt += ' 保存前核对已提交的非关键词筛选摘要及可见保存入口；仅关键词或输入草稿不足时说明前置，不自动添加条件。';
  return prompt;
}
