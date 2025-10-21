# Memoji 빌드 전 정리 스크립트

Write-Host "🧹 Memoji 빌드 전 정리 시작..." -ForegroundColor Cyan

# 1. 브라우저 localStorage 정리 안내
Write-Host "`n📝 브라우저 데이터 정리 안내:" -ForegroundColor Yellow
Write-Host "   개발 중 저장된 데이터를 정리하려면 브라우저 개발자 도구에서:" -ForegroundColor Gray
Write-Host "   localStorage.clear()" -ForegroundColor White
Write-Host "   를 실행하세요.`n" -ForegroundColor Gray

# 2. Tauri 개발 데이터베이스 정리
Write-Host "🗄️  Tauri 개발 데이터베이스 정리..." -ForegroundColor Yellow

$appDataPath = "$env:APPDATA\com.memoji.app"
if (Test-Path $appDataPath) {
    Write-Host "   발견: $appDataPath" -ForegroundColor Gray
    $confirm = Read-Host "   이 폴더를 삭제하시겠습니까? (y/N)"
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        Remove-Item -Path $appDataPath -Recurse -Force
        Write-Host "   ✅ 삭제 완료" -ForegroundColor Green
    } else {
        Write-Host "   ⏭️  건너뜀" -ForegroundColor Gray
    }
} else {
    Write-Host "   ℹ️  개발 데이터베이스 없음" -ForegroundColor Gray
}

# 3. 빌드 폴더 정리
Write-Host "`n🗑️  이전 빌드 정리..." -ForegroundColor Yellow

$foldersToClean = @(
    "dist",
    "src-tauri\target\release",
    "src-tauri\target\debug"
)

foreach ($folder in $foldersToClean) {
    if (Test-Path $folder) {
        Write-Host "   삭제: $folder" -ForegroundColor Gray
        Remove-Item -Path $folder -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ 완료" -ForegroundColor Green
    }
}

# 4. node_modules 캐시 정리 (선택)
Write-Host "`n📦 node_modules 캐시 정리 (선택)..." -ForegroundColor Yellow
$cleanNodeModules = Read-Host "   node_modules를 정리하시겠습니까? (y/N)"
if ($cleanNodeModules -eq 'y' -or $cleanNodeModules -eq 'Y') {
    if (Test-Path "node_modules") {
        Write-Host "   삭제 중..." -ForegroundColor Gray
        Remove-Item -Path "node_modules" -Recurse -Force
        Write-Host "   ✅ 완료" -ForegroundColor Green
        Write-Host "   npm install을 실행하세요." -ForegroundColor Yellow
    }
}

Write-Host "`n✨ 정리 완료!" -ForegroundColor Green
Write-Host "`n다음 단계:" -ForegroundColor Cyan
Write-Host "1. npm run tauri build" -ForegroundColor White
Write-Host "2. 빌드된 파일은 src-tauri\target\release\bundle 에 생성됩니다." -ForegroundColor White
Write-Host ""

