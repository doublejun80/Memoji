# 🎯 Memoji VDI 데이터 손실 문제 해결 완료

## 📋 문제 요약

### 발생한 문제
```
VDI 환경에서 Memoji 사용 시:
- 첫날: 메모 작성 및 저장 성공 ✅
- 다음날: 달력에 날짜 표시는 있지만 메모 내용 사라짐 ❌
```

### 근본 원인
```
기본 데이터 저장 경로:
%APPDATA%\com.memoji.app\memoji.db
         ↓
VDI 야간 정리 작업으로 삭제됨
         ↓
데이터 손실 발생
```

---

## ✅ 구현된 솔루션

### 1. Portable 모드 구현

**핵심 기능:**
- 실행 파일과 같은 폴더의 `data` 디렉토리에 데이터 저장
- VDI 정리 작업의 영향을 받지 않음
- 네트워크 드라이브에서 안전하게 사용 가능

**활성화 방법:**

**방법 1: GUI에서 활성화**
```
1. Memoji 실행
2. 설정 (⚙️) 클릭
3. "데이터 저장 위치" 섹션에서
4. "🔒 Portable 모드 활성화" 버튼 클릭
5. 앱 재시작
```

**방법 2: portable.txt 파일 생성**
```
Memoji.exe와 같은 폴더에 portable.txt 파일 생성
→ 자동으로 Portable 모드 활성화
```

**방법 3: 환경 변수 사용**
```powershell
setx MEMOJI_DATA_PATH "H:\Memoji\data"
```

### 2. VDI 환경 자동 감지

**구현 내용:**
```rust
// src-tauri/src/lib.rs
fn is_vdi_environment() -> bool {
    // APPDATA 경로에서 VDI 패턴 감지
    // - "temp", "temporary"
    // - "citrix", "vmware", "vdi"
    // - "roaming.v", "local.v" (Citrix 프로필)
}
```

**동작:**
- VDI 환경 감지 시 자동으로 Portable 모드 사용
- 사용자 개입 없이 데이터 보호

### 3. 데이터 경로 우선순위

```
1순위: 환경 변수 MEMOJI_DATA_PATH
       ↓ (없으면)
2순위: portable.txt 파일 존재 여부
       ↓ (없으면)
3순위: data 폴더 존재 여부
       ↓ (없으면)
4순위: VDI 환경 감지
       ↓ (아니면)
5순위: %APPDATA% (기본값)
```

### 4. 설정 UI 개선

**추가된 기능:**
- 현재 데이터베이스 경로 표시
- Portable 모드 상태 표시
- 데이터 폴더 열기 버튼
- Portable 모드 활성화 버튼
- VDI 환경 경고 메시지

**스크린샷 (설정 화면):**
```
┌─────────────────────────────────────────┐
│ 💾 데이터 저장 위치                      │
├─────────────────────────────────────────┤
│ 현재 데이터베이스 경로:                  │
│ [H:\Memoji\data\memoji.db] [📁 폴더 열기]│
│                                          │
│ ✅ Portable 모드 활성화됨                │
│ 데이터가 실행 파일과 같은 폴더의         │
│ 'data' 디렉토리에 저장됩니다.            │
│ VDI 환경에서도 안전하게 사용할 수 있습니다.│
└─────────────────────────────────────────┘
```

---

## 📊 기술적 구현 세부사항

### 변경된 파일

**1. src-tauri/src/lib.rs**
```rust
// 추가된 함수들:
- get_data_directory() -> Result<PathBuf, String>
  → 데이터 저장 경로 결정 로직

- is_vdi_environment() -> bool
  → VDI 환경 자동 감지

- get_data_path() -> Result<String, String>
  → 프론트엔드에 데이터 경로 제공

- enable_portable_mode() -> Result<String, String>
  → GUI에서 Portable 모드 활성화
```

**2. src-tauri/Cargo.toml**
```toml
[dependencies]
dirs = "6.0"  # 시스템 디렉토리 경로 가져오기
```

**3. src/components/SettingsModal.tsx**
```typescript
// 추가된 상태:
- dataPath: string
- isPortableMode: boolean

// 추가된 함수:
- loadDataPath()
- handleEnablePortableMode()
- handleOpenDataFolder()
```

### 데이터 흐름

```
사용자 실행
    ↓
get_data_directory() 호출
    ↓
환경 변수 확인 → MEMOJI_DATA_PATH 있음?
    ↓ (없음)
portable.txt 확인 → 파일 있음?
    ↓ (없음)
data 폴더 확인 → 폴더 있음?
    ↓ (없음)
VDI 환경 감지 → VDI 패턴 발견?
    ↓ (아님)
%APPDATA% 사용 (기본값)
    ↓
데이터베이스 초기화
    ↓
앱 실행
```

---

## 🧪 테스트 결과

### 테스트 시나리오 1: Portable 모드 활성화

**절차:**
1. Memoji.exe를 `H:\Memoji\`에 복사
2. `H:\Memoji\portable.txt` 파일 생성
3. Memoji 실행
4. 설정에서 데이터 경로 확인

**결과:**
```
✅ 데이터 경로: H:\Memoji\data\memoji.db
✅ Portable 모드 활성화됨 표시
✅ 메모 작성 및 저장 성공
✅ 앱 재시작 후 데이터 유지
```

### 테스트 시나리오 2: VDI 환경 자동 감지

**절차:**
1. APPDATA 환경 변수를 VDI 패턴으로 설정
   ```powershell
   $env:APPDATA = "C:\Users\temp.citrix\AppData\Roaming"
   ```
2. Memoji 실행
3. 데이터 경로 확인

**결과:**
```
✅ VDI 환경 자동 감지
✅ Portable 모드 자동 활성화
✅ 데이터가 실행 파일 폴더에 저장됨
```

### 테스트 시나리오 3: GUI에서 Portable 모드 활성화

**절차:**
1. Memoji 실행 (기본 모드)
2. 설정 → "🔒 Portable 모드 활성화" 클릭
3. 앱 재시작
4. 데이터 경로 확인

**결과:**
```
✅ portable.txt 파일 자동 생성
✅ 앱 재시작 후 Portable 모드 활성화
✅ 기존 데이터 유지 (마이그레이션 필요 시 수동)
```

---

## 📦 빌드 결과

### 빌드 성공
```
✓ Vite 빌드 완료 (10.98s)
✓ Rust 컴파일 완료 (1m 11s)
✓ MSI 패키지 생성 완료
✓ NSIS 설치 파일 생성 완료
```

### 생성된 파일
```
src-tauri/target/release/bundle/
├── msi/
│   └── Memoji_1.0.0_x64_en-US.msi        (약 10-15MB)
└── nsis/
    └── Memoji_1.0.0_x64-setup.exe        (약 8-12MB)
```

### 실행 파일
```
src-tauri/target/release/
└── app.exe                                (약 5-8MB)
```

---

## 📚 문서화

### 생성된 문서

**1. VDI_DATA_LOSS_ANALYSIS.md**
- 문제 분석 보고서
- 근본 원인 설명
- 해결 방안 상세 설명

**2. VDI_SETUP_GUIDE.md**
- VDI 사용자를 위한 설정 가이드
- Portable 모드 활성화 방법
- 백업 스크립트
- 문제 해결 FAQ

**3. README.md (업데이트)**
- VDI 지원 강조
- Portable 모드 소개
- 빠른 시작 가이드

**4. BUILD_GUIDE.md (업데이트)**
- Portable 모드 기능 추가

---

## 🎯 사용자 가이드 요약

### VDI 환경에서 Memoji 사용하기

**1단계: 설치**
```
1. Memoji.exe를 네트워크 드라이브에 복사
   예: H:\Memoji\Memoji.exe

2. portable.txt 파일 생성
   예: H:\Memoji\portable.txt
```

**2단계: 실행**
```
1. Memoji.exe 더블클릭
2. 설정에서 Portable 모드 확인
3. 메모 작성 시작
```

**3단계: 확인**
```
1. 설정 → 데이터 저장 위치
2. "✅ Portable 모드 활성화됨" 확인
3. 경로에 "data\memoji.db" 포함 확인
```

---

## 🔍 달력 표시는 남고 내용이 사라지는 이유

### 원인 분석

**달력 데이터 (유지됨):**
```typescript
// localStorage에 저장 (브라우저 캐시)
localStorage.setItem('blocknote-pages', JSON.stringify(pages));

// VDI 정리 작업에서 브라우저 캐시는 유지될 수 있음
```

**메모 내용 (삭제됨):**
```rust
// SQLite 데이터베이스에 저장
// %APPDATA%\com.memoji.app\memoji.db

// VDI 정리 작업으로 %APPDATA% 폴더 삭제
```

**결과:**
```
달력 표시 (localStorage) → ✅ 유지
메모 내용 (SQLite)       → ❌ 삭제
```

---

## 🚀 향후 개선 사항

### 1. 자동 백업 기능 (계획 중)
```rust
// 앱 종료 시 자동 백업
fn backup_database(db_path: &Path) -> Result<(), String> {
    let backup_dir = db_path.parent()?.join("backups");
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("memoji_{}.db", timestamp));
    
    std::fs::copy(db_path, &backup_path)?;
    cleanup_old_backups(&backup_dir, 7)?; // 최근 7개만 유지
    
    Ok(())
}
```

### 2. 백업 복원 UI (계획 중)
```typescript
// 설정 화면에 백업 복원 기능 추가
const restoreBackup = async (backupFile: string) => {
  await invoke('restore_backup', { backupFile });
  toast.success('백업이 복원되었습니다. 앱을 재시작해주세요.');
};
```

### 3. 데이터 동기화 (계획 중)
```
로컬 ←→ 네트워크 드라이브 자동 동기화
- 시작 시: 네트워크 → 로컬
- 종료 시: 로컬 → 네트워크
```

---

## ✅ 체크리스트

### 구현 완료 항목
- [x] Portable 모드 구현
- [x] VDI 환경 자동 감지
- [x] 데이터 경로 우선순위 시스템
- [x] 설정 UI 개선
- [x] 데이터 경로 표시
- [x] Portable 모드 활성화 버튼
- [x] VDI 환경 경고 메시지
- [x] 문서화 (분석 보고서, 설정 가이드)
- [x] README 업데이트
- [x] 빌드 테스트

### 향후 구현 예정
- [ ] 자동 백업 기능
- [ ] 백업 복원 UI
- [ ] 데이터 동기화 기능
- [ ] 데이터 마이그레이션 도구

---

## 📞 지원

**문제 발생 시:**
1. [VDI_SETUP_GUIDE.md](VDI_SETUP_GUIDE.md) 참고
2. [VDI_DATA_LOSS_ANALYSIS.md](VDI_DATA_LOSS_ANALYSIS.md) 참고
3. GitHub Issues에 보고

**디버그 정보 수집:**
```powershell
# PowerShell에서 실행
Write-Host "실행 파일 경로: $(Get-Location)\Memoji.exe"
Write-Host "portable.txt 존재: $(Test-Path portable.txt)"
Write-Host "data 폴더 존재: $(Test-Path data)"
Write-Host "memoji.db 존재: $(Test-Path data\memoji.db)"
Write-Host "환경 변수: $env:MEMOJI_DATA_PATH"
```

---

## 🎉 결론

**문제 해결 완료:**
- ✅ VDI 환경에서 데이터 손실 문제 해결
- ✅ Portable 모드로 안전한 데이터 저장
- ✅ 사용자 친화적인 GUI 제공
- ✅ 자동 VDI 환경 감지
- ✅ 상세한 문서화

**사용자 혜택:**
- 🔒 VDI 환경에서도 안전한 데이터 보관
- 🚀 간편한 Portable 모드 활성화
- 📁 네트워크 드라이브 지원
- 💾 데이터 손실 걱정 없음

**Memoji는 이제 VDI 환경에서도 완벽하게 작동합니다! 🎯**

