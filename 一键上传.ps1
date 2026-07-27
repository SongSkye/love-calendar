# 恋爱日历 - 一键上传 GitHub
# 用法：右键此文件 -> 使用 PowerShell 运行
# 或者：在终端输入 .\一键上传.ps1

$ghCli = "$env:USERPROFILE\bin\gh.exe"
$repoUrl = "https://github.com/SongSkye/love-calendar"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  恋爱日历 - 一键上传 GitHub" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 gh CLI
if (-not (Test-Path $ghCli)) {
    Write-Host "[错误] 未找到 gh CLI: $ghCli" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

# 设置 git 凭证
& $ghCli auth setup-git *>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[警告] gh auth setup-git 失败，尝试继续..." -ForegroundColor Yellow
}

# 设置 git 用户信息
$name = git config user.name
if (-not $name) {
    git config user.name "SongSkye"
    Write-Host "[信息] 已设置 git user.name = SongSkye" -ForegroundColor Gray
}
$email = git config user.email
if (-not $email) {
    git config user.email "2248225741@qq.com"
    Write-Host "[信息] 已设置 git user.email = 2248225741@qq.com" -ForegroundColor Gray
}

# 显示当前状态
Write-Host "[1/4] 当前变更文件:" -ForegroundColor Yellow
git status --short
Write-Host ""

# 输入提交描述
$commitMsg = Read-Host "[2/4] 请输入提交描述"
if ([string]::IsNullOrWhiteSpace($commitMsg)) {
    Write-Host "[提示] 提交描述不能为空，已取消" -ForegroundColor Yellow
    Read-Host "按回车键退出"
    exit 1
}

# 添加所有变更
Write-Host ""
Write-Host "[3/4] 正在添加变更..." -ForegroundColor Yellow
git add -A

# 提交
Write-Host "[3/4] 正在提交..." -ForegroundColor Yellow
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host "[提示] 没有需要提交的变更，或提交失败" -ForegroundColor Yellow
    Read-Host "按回车键退出"
    exit 0
}

# 推送
Write-Host "[4/4] 正在推送到 GitHub..." -ForegroundColor Yellow
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[错误] 推送失败，请检查网络" -ForegroundColor Red
    Read-Host "按回车键退出"
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  上传完成!" -ForegroundColor Green
Write-Host "  $repoUrl" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Read-Host "按回车键退出"