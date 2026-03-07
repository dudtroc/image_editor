# image_editor - 서버와 클라이언트 동시 실행 (PowerShell)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "서버 창을 엽니다..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptDir\server'; npm run dev"

Write-Host "클라이언트 창을 엽니다..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$ScriptDir\client'; npm run dev"

Write-Host "`n서버와 클라이언트가 각각 새 창에서 실행 중입니다." -ForegroundColor Green
Write-Host "종료하려면 해당 창을 닫으세요." -ForegroundColor Gray
