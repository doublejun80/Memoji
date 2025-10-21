# 🖥️ Memoji VDI 환경 사용 가이드

## 🎯 VDI 환경에서 Memoji 사용하기

**Memoji는 기본적으로 VDI 환경을 지원합니다.**

데이터가 실행 파일과 같은 폴더의 `data` 디렉토리에 자동으로 저장되므로,
VDI 야간 정리 작업의 영향을 받지 않습니다.

---

## 🚀 빠른 시작 (3단계)

### 1단계: Memoji.exe 복사
```
VDI 환경의 원하는 위치에 Memoji.exe를 복사하세요.
예: C:\Memoji\Memoji.exe
```

### 2단계: 실행
```
Memoji.exe를 더블클릭하여 실행하세요.
```

### 3단계: 확인
```
메모를 작성하고 저장하세요.
데이터는 자동으로 C:\Memoji\data\memoji.db에 저장됩니다.
```

**끝! 이게 전부입니다.**

---

## 📁 데이터 저장 위치

Memoji는 실행 파일과 같은 폴더에 `data` 디렉토리를 자동으로 생성합니다:

```
C:\Memoji\
├── Memoji.exe          ← 실행 파일
└── data\               ← 자동 생성됨
    └── memoji.db       ← 데이터베이스
```

**VDI 환경에서도 안전:**
- ✅ 야간 정리 작업의 영향 없음
- ✅ 로그아웃 후에도 데이터 유지
- ✅ 별도 설정 불필요

## 🔧 고급 설정 (선택사항)

### 환경 변수로 데이터 경로 변경

특별한 경우에만 사용하세요. 대부분의 사용자는 이 설정이 필요 없습니다.

**PowerShell에서 실행:**
```powershell
# 환경 변수 설정
setx MEMOJI_DATA_PATH "D:\MyData\Memoji"

# Memoji 재실행
```

**사용 예:**
- 특정 폴더에 데이터를 저장하고 싶을 때
- 여러 Memoji 인스턴스를 다른 데이터로 실행하고 싶을 때

---

## 💾 데이터 백업 (선택사항)

### 간단한 백업 방법

데이터베이스 파일을 복사하면 됩니다:

```
C:\Memoji\data\memoji.db
```

이 파일을 USB나 다른 위치에 복사해두세요.

**복원:**
```
1. Memoji 종료
2. 백업한 memoji.db 파일을 C:\Memoji\data\ 폴더에 복사
3. Memoji 재실행
```

---

## 🛠️ 문제 해결

### Q1: Portable 모드가 활성화되지 않아요

**확인 사항:**
```
1. portable.txt 파일이 Memoji.exe와 같은 폴더에 있는지 확인
2. 파일 이름이 정확한지 확인 (portable.txt, 대소문자 구분 없음)
3. Memoji를 완전히 종료하고 재실행
```

**확인 방법:**
```powershell
# PowerShell에서 실행
cd "H:\Memoji"
dir portable.txt
# 파일이 보이면 OK
```

### Q2: 데이터가 여전히 사라져요

**원인 분석:**
```
1. 설정 → 데이터 저장 위치 확인
2. 경로에 "data\memoji.db"가 포함되어 있는지 확인
3. 포함되어 있지 않으면 Portable 모드가 활성화되지 않은 것
```

**해결 방법:**
```
1. Memoji 완전 종료
2. portable.txt 파일 다시 생성
3. Memoji 재실행
4. 설정에서 경로 다시 확인
```

### Q3: 네트워크 드라이브에서 느려요

**원인:**
- 네트워크 지연
- VPN 연결 불안정

**해결 방법:**
```
1. 로컬 드라이브 사용 (C:\Memoji)
2. portable.txt 생성
3. 매일 백업 스크립트로 네트워크 드라이브에 백업
```

**백업 스크립트 수정:**
```powershell
# 로컬에서 작업, 네트워크로 백업
$source = "C:\Memoji\data\memoji.db"
$destination = "H:\Memoji\backup\memoji_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"

Copy-Item -Path $source -Destination $destination
```

### Q4: 여러 VDI에서 같은 데이터를 사용하고 싶어요

**방법 1: 네트워크 드라이브 사용**
```
1. 네트워크 드라이브에 Memoji 설치 (H:\Memoji)
2. portable.txt 생성
3. 모든 VDI에서 H:\Memoji\Memoji.exe 실행
```

**방법 2: 동기화 스크립트**
```powershell
# sync.ps1
$local = "C:\Memoji\data\memoji.db"
$network = "H:\Memoji\data\memoji.db"

# 시작 시: 네트워크 → 로컬
if (Test-Path $network) {
    Copy-Item $network $local -Force
    Write-Host "✅ 데이터 동기화 완료 (네트워크 → 로컬)"
}

# Memoji 실행
Start-Process "C:\Memoji\Memoji.exe"

# 종료 시: 로컬 → 네트워크
# (작업 스케줄러로 종료 시 실행)
```

### Q5: 데이터베이스 파일이 손상되었어요

**증상:**
- 앱이 실행되지 않음
- 데이터가 보이지 않음
- 오류 메시지 표시

**해결 방법:**
```powershell
# 1. 백업에서 복원
Copy-Item "H:\Memoji\backup\memoji_최신날짜.db" `
    "H:\Memoji\data\memoji.db" -Force

# 2. 데이터베이스 무결성 검사 (SQLite 도구 필요)
sqlite3 memoji.db "PRAGMA integrity_check;"

# 3. 복구 시도
sqlite3 memoji.db ".recover" | sqlite3 memoji_recovered.db
```

---

## 📊 권장 설정

### VDI 환경별 권장 설정

| VDI 유형 | 권장 설정 | 백업 주기 |
|---------|----------|----------|
| **비영구 VDI** | Portable 모드 + 네트워크 드라이브 | 매일 |
| **영구 VDI** | 기본 설정 또는 Portable 모드 | 주 1회 |
| **Citrix** | Portable 모드 + 로컬 드라이브 | 매일 |
| **VMware Horizon** | Portable 모드 + 네트워크 드라이브 | 매일 |

### 최적 폴더 구조

```
H:\Memoji\                    ← 네트워크 드라이브
├── Memoji.exe                ← 실행 파일
├── portable.txt              ← Portable 모드 활성화
├── data\                     ← 데이터 폴더
│   └── memoji.db             ← 데이터베이스
├── backup\                   ← 백업 폴더
│   ├── memoji_20250121.db
│   ├── memoji_20250122.db
│   └── memoji_20250123.db
└── scripts\                  ← 스크립트 폴더
    ├── backup.ps1
    └── sync.ps1
```

---

## 🎯 체크리스트

### 초기 설정 체크리스트

- [ ] Memoji.exe를 네트워크 드라이브에 복사
- [ ] portable.txt 파일 생성
- [ ] Memoji 실행 및 Portable 모드 확인
- [ ] 테스트 메모 작성
- [ ] 앱 재시작 후 메모 유지 확인
- [ ] 백업 스크립트 설정
- [ ] 작업 스케줄러 등록

### 일일 사용 체크리스트

- [ ] Memoji 실행
- [ ] 메모 작성
- [ ] 저장 확인 (Ctrl+S)
- [ ] 종료 전 백업 확인 (자동)

### 주간 점검 체크리스트

- [ ] 백업 파일 확인
- [ ] 데이터베이스 크기 확인
- [ ] 오래된 백업 정리
- [ ] 데이터 무결성 확인

---

## 📞 지원

문제가 계속되면:
1. GitHub Issues에 보고
2. 데이터베이스 경로 스크린샷 첨부
3. 오류 메시지 복사

**디버그 정보 수집:**
```powershell
# debug_info.ps1
Write-Host "=== Memoji 디버그 정보 ===" -ForegroundColor Cyan
Write-Host "실행 파일 경로: $(Get-Location)\Memoji.exe"
Write-Host "portable.txt 존재: $(Test-Path portable.txt)"
Write-Host "data 폴더 존재: $(Test-Path data)"
Write-Host "memoji.db 존재: $(Test-Path data\memoji.db)"
Write-Host "환경 변수 MEMOJI_DATA_PATH: $env:MEMOJI_DATA_PATH"
Write-Host "APPDATA: $env:APPDATA"
```

---

**이 가이드로 VDI 환경에서도 안전하게 Memoji를 사용하세요! 🚀**

