# image_editor - 서버와 클라이언트 동시 실행 (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Triton 브릿지는 실제 Python이 필요함. Windows '앱 실행 별칭' 스텁이면 실행 안 됨.
$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if ($pythonExe -and $pythonExe -match "WindowsApps\\python\.exe$") {
    Write-Host "`n[경고] 'python'이 Windows 스토어 스텁을 가리킵니다. Triton 브릿지를 켤 수 없습니다." -ForegroundColor Yellow
    Write-Host "  해결: https://www.python.org/downloads/ 에서 Python 설치 시 'Add Python to PATH' 체크 후 설치하세요." -ForegroundColor Gray
    Write-Host "  설정 > 앱 > 고급 앱 설정 > 앱 실행 별칭 에서 'python.exe' 끄면 실제 설치 경로가 사용됩니다.`n" -ForegroundColor Gray
}

Write-Host "서버 창을 엽니다..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptDir\server'; npm run dev"

Write-Host "클라이언트 창을 엽니다..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptDir\client'; npm run dev"

Write-Host "Triton 브릿지 창을 엽니다..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptDir\server\triton_bridge'; python -m pip install -q -r requirements.txt; python main.py"

Write-Host "`n서버, 클라이언트, Triton 브릿지가 각각 새 창에서 실행 중입니다." -ForegroundColor Green
Write-Host "종료하려면 해당 창을 닫으세요." -ForegroundColor Gray
