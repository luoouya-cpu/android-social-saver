$ErrorActionPreference = 'Stop'

if (-not (Get-Command gradle -ErrorAction SilentlyContinue)) {
    throw '未找到 Gradle。请安装 Android Studio，或使用 GitHub Actions 构建 APK。'
}

Push-Location $PSScriptRoot
try {
    gradle assembleDebug --no-daemon
    $apk = Join-Path $PSScriptRoot 'app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path -LiteralPath $apk)) { throw "APK 未生成：$apk" }
    $output = Join-Path (Split-Path $PSScriptRoot -Parent) 'AndroidSocialSaver-debug.apk'
    Copy-Item -LiteralPath $apk -Destination $output -Force
    Write-Output "APK 已生成：$output"
} finally {
    Pop-Location
}
