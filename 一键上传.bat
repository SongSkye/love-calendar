@echo off
chcp 65001 >nul
set GH_HOME=%USERPROFILE%\bin\gh.exe

echo ========================================
echo   恋爱日历 - 一键上传 GitHub
echo ========================================
echo.

:: 检查 gh CLI
if not exist "%GH_HOME%" (
    echo [错误] 未找到 gh CLI: %GH_HOME%
    pause
    exit /b 1
)

:: 设置 git 凭证
"%GH_HOME%" auth setup-git >nul 2>&1

:: 设置 git 用户信息（如果还没设置）
git config user.name >nul 2>&1
if errorlevel 1 git config user.name "SongSkye"
git config user.email >nul 2>&1
if errorlevel 1 git config user.email "2248225741@qq.com"

:: 显示当前状态
echo [1/4] 当前变更文件:
git status --short
echo.

:: 让用户输入提交信息
set /p COMMIT_MSG="[2/4] 请输入提交描述: "

if "%COMMIT_MSG%"=="" (
    echo [提示] 提交描述不能为空，已取消
    pause
    exit /b 1
)

:: 添加所有变更
echo.
echo [3/4] 正在添加变更...
git add -A

:: 提交
echo [3/4] 正在提交...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo [提示] 没有需要提交的变更
    pause
    exit /b 0
)

:: 推送
echo [4/4] 正在推送到 GitHub...
git push
if errorlevel 1 (
    echo [错误] 推送失败，请检查网络
    pause
    exit /b 1
)

echo.
echo ========================================
echo   上传完成！^_^
echo   https://github.com/SongSkye/love-calendar
echo ========================================
pause