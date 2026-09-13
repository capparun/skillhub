import { env } from '@/lib/server/env';

export const runtime = 'nodejs';

function renderScript(appUrl: string): string {
  return `# Hunter Windows 安装引导脚本（由服务器生成）
param([Parameter(Mandatory=$true)][string]$Product, [string]$Token = '')
$ErrorActionPreference = 'Stop'
$Server = '${appUrl}'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '未找到 Node.js。请先安装 Node.js 20 或更高版本：https://nodejs.org' }
if ([int](node -p "process.versions.node.split('.')[0]") -lt 20) { throw "Node.js 版本过低：$(node --version)；需要 20 或更高版本" }

$workDir = Join-Path ([System.IO.Path]::GetTempPath()) ('hunter-install-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $workDir | Out-Null
Set-Location $workDir

if ($Token) {
  Invoke-RestMethod -Method Post -Uri "$Server/api/install-tokens/$Token/redeem" | ConvertTo-Json -Depth 10 | Set-Content redeem.json -Encoding utf8
} else {
  Invoke-RestMethod -Uri "$Server/api/releases/latest?product=$Product" | ConvertTo-Json -Depth 10 | Set-Content redeem.json -Encoding utf8
}

$payload = Get-Content redeem.json -Raw | ConvertFrom-Json
if ($payload.error) { throw "服务器返回错误：$($payload.error.message)" }
$release = if ($payload.release) { $payload.release } else { $payload }
$downloadUrl = $payload.downloadUrl
if (-not $downloadUrl -or -not $release.sha256 -or -not $release.version) { throw '服务器响应缺少下载地址、哈希或版本信息' }

Invoke-WebRequest -Uri $downloadUrl -OutFile pkg.tar.gz
$actual = (Get-FileHash pkg.tar.gz -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $release.sha256.ToLowerInvariant()) { throw '安装包校验失败（SHA-256 不一致），已中止。' }

tar.exe -xzf pkg.tar.gz
$packageDir = Get-ChildItem -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'install.mjs') } | Select-Object -First 1
if (-not $packageDir) { throw '安装包内容不正确：未找到 install.mjs' }
Set-Location $packageDir.FullName
$args = @('install.mjs', '--product', $Product, '--version', $release.version, '--server', $Server)
if ($payload.updateCredential) { $args += @('--update-credential', $payload.updateCredential) }
& node @args
& node doctor.mjs
Write-Host '✓ 安装完成，可以开始使用了'
`;
}

export async function GET() {
  return new Response(renderScript(env.publicAppUrl()), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
