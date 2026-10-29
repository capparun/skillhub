$ErrorActionPreference = 'Stop'
$env:HUNTER_SKILLS_DIR = Join-Path $env:RUNNER_TEMP '谷露 验收\skills'
$env:HUNTER_STATE_DIR = Join-Path $env:RUNNER_TEMP '谷露 验收\state'
$fixture = Start-Process node -ArgumentList @('--import','tsx','scripts/gllue-windows-fixture.ts') -PassThru -RedirectStandardOutput fixture.log -RedirectStandardError fixture-error.log
try {
  $ready = $false
  for ($i=0; $i -lt 30; $i++) {
    try { $script = Invoke-RestMethod "$env:PUBLIC_APP_URL/install.ps1"; $ready = $true; break } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { Get-Content fixture-error.log; throw 'Fixture not ready' }
  & ([scriptblock]::Create($script.TrimStart([char]0xFEFF))) -Product 'gllue-only'
  if (-not (Test-Path (Join-Path $env:HUNTER_SKILLS_DIR 'cskh-gllue/SKILL.md'))) { throw 'Skill missing from selected Agent directory' }
  $installed = Join-Path $env:HUNTER_STATE_DIR 'packages/gllue-only'
  # Remove extraction directories to catch absolute npm workspace junctions.
  Get-ChildItem $env:TEMP -Directory -Filter 'hunter-install-*' | Where-Object { $_.Name -notlike 'hunter-install-log-*' } | Remove-Item -Recurse -Force
  & node (Join-Path $installed 'doctor.mjs') --json
  if ($LASTEXITCODE -ne 0) { throw 'Persistent doctor failed' }
  $cli = Join-Path $installed 'runtime/opencli.mjs'
  if (-not (Test-Path $cli)) {
    $manifest = Get-Content (Join-Path $installed 'runtime/node_modules/@jackwener/opencli/package.json') -Raw | ConvertFrom-Json
    $bin = if ($manifest.bin -is [string]) { $manifest.bin } else { $manifest.bin.opencli }
    $cli = Join-Path (Join-Path $installed 'runtime/node_modules/@jackwener/opencli') $bin
  }
  & node $cli gllue check-exists --help
  if ($LASTEXITCODE -ne 0) { throw 'Persistent Gllue command failed' }
  & node (Join-Path $installed 'install.mjs') --preflight --json --product gllue-only
  if ($LASTEXITCODE -ne 0) { throw 'Persistent installer dependencies missing' }
} finally { Stop-Process -Id $fixture.Id -ErrorAction SilentlyContinue }
