@echo off
set GH=%USERPROFILE%\bin\gh.exe

:: Set git credential helper
"%GH%" auth setup-git >nul 2>&1

:: Set git user info if not set
git config user.name >nul 2>&1
if errorlevel 1 git config user.name "SongSkye"
git config user.email >nul 2>&1
if errorlevel 1 git config user.email "2248225741@qq.com"

:: Show current changes
echo ============================================
echo   Love Calendar - Upload to GitHub
echo ============================================
echo.
echo Current changes:
git status --short
echo.

:: Ask for commit message
set /p MSG="Enter commit message: "
if "%MSG%"=="" (
    echo.
    echo [ERROR] Commit message is empty, cancelled.
    pause
    exit /b 1
)

:: Add all changes
echo.
echo [1/3] Staging changes...
git add -A

:: Commit
echo [2/3] Committing...
git commit -m "%MSG%"
if errorlevel 1 (
    echo [INFO] Nothing to commit or commit failed.
    pause
    exit /b 0
)

:: Push
echo [3/3] Pushing to GitHub...
git push
if errorlevel 1 (
    echo [ERROR] Push failed. Check your network.
    pause
    exit /b
)

echo.
echo ============================================
echo   Done!
echo   https://github.com/SongSkye/love-calendar
echo ============================================
pause