# 🔍 Memoji VDI 환경 데이터 손실 문제 분석 보고서

## 📋 문제 요약

**증상:**
- VDI 환경에서 Memoji 실행 파일(exe)을 사용 중
- 첫날 메모 작성 및 저장 성공
- 다음날 앱 재실행 시:
  - ✅ 달력에 메모 작성 날짜 표시(점)는 남아있음
  - ❌ 실제 메모 내용은 사라짐

---

## 🔬 근본 원인 분석

### 1. 데이터 저장 메커니즘

#### **SQLite 데이터베이스 저장 경로**

**코드 분석 (`src-tauri/src/lib.rs` 73-79줄):**
```rust
let app_data_dir = app.path().app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;

std::fs::create_dir_all(&app_data_dir)
    .map_err(|e| format!("Failed to create app data dir: {}", e))?;

let db_path = app_data_dir.join("memoji.db");
```

**실제 저장 경로 (Windows):**
```
%APPDATA%\com.memoji.app\memoji.db
```

**전체 경로 예시:**
```
C:\Users\[사용자명]\AppData\Roaming\com.memoji.app\memoji.db
```

#### **데이터베이스 구조**

**Pages 테이블 (`src-tauri/src/database.rs` 32-45줄):**
```sql
CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    icon TEXT NOT NULL,
    parent_id TEXT,
    content TEXT NOT NULL,        -- ⚠️ 실제 메모 내용
    created_at TEXT NOT NULL,      -- ✅ 날짜 정보 (달력 표시용)
    updated_at TEXT NOT NULL,
    type TEXT NOT NULL,
    tags TEXT NOT NULL,
    page_order INTEGER NOT NULL
)
```

---

### 2. VDI 환경에서 데이터 손실 원인

#### **🎯 핵심 원인: VDI 프로필 초기화**

VDI 환경에서는 일반적으로 다음과 같은 정책이 적용됩니다:

**1. 비영구 VDI (Non-Persistent VDI)**
```
로그아웃/재부팅 시:
├── C:\Users\[사용자명]\AppData\Roaming\  ← ❌ 삭제됨
├── C:\Users\[사용자명]\AppData\Local\    ← ❌ 삭제됨
└── C:\Users\[사용자명]\Desktop\          ← ❌ 삭제됨

유지되는 경로:
├── 네트워크 드라이브 (H:\, Z:\ 등)      ← ✅ 유지됨
├── 공유 폴더                            ← ✅ 유지됨
└── 특정 허용된 로컬 경로                 ← ✅ 유지됨 (정책에 따라)
```

**2. 야간 정리 작업**
```powershell
# VDI 관리자가 설정한 스크립트 예시
Remove-Item -Path "$env:APPDATA\*" -Recurse -Force
Remove-Item -Path "$env:LOCALAPPDATA\*" -Recurse -Force
```

#### **왜 달력 표시는 남아있나?**

**달력 표시 데이터 저장 위치:**
- 달력의 날짜 표시는 **localStorage**에 저장됨
- localStorage는 브라우저 캐시 영역에 저장됨
- VDI 정책에 따라 브라우저 캐시는 유지될 수 있음

**실제 메모 내용 저장 위치:**
- 메모 내용은 **SQLite 데이터베이스**에 저장됨
- `%APPDATA%\com.memoji.app\memoji.db`
- VDI 정책에 의해 삭제됨

**결과:**
```
달력 표시 (localStorage) → ✅ 유지됨
메모 내용 (SQLite DB)    → ❌ 삭제됨
```

---

## 💡 해결 방안

### 방안 1: 데이터 저장 경로 변경 (권장)

#### **실행 파일과 같은 폴더에 데이터 저장 (Portable 모드)**

**장점:**
- ✅ VDI 정리 작업의 영향을 받지 않음
- ✅ USB나 네트워크 드라이브에서 실행 가능
- ✅ 백업이 간단함 (폴더 전체 복사)

**구현 방법:**

**1단계: `src-tauri/src/lib.rs` 수정**

현재 코드 (73-79줄):
```rust
let app_data_dir = app.path().app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;

std::fs::create_dir_all(&app_data_dir)
    .map_err(|e| format!("Failed to create app data dir: {}", e))?;

let db_path = app_data_dir.join("memoji.db");
```

수정 후:
```rust
// Portable 모드: 실행 파일과 같은 폴더에 data 디렉토리 생성
let exe_dir = std::env::current_exe()
    .map_err(|e| format!("Failed to get exe path: {}", e))?
    .parent()
    .ok_or("Failed to get exe directory")?
    .to_path_buf();

let data_dir = exe_dir.join("data");

std::fs::create_dir_all(&data_dir)
    .map_err(|e| format!("Failed to create data dir: {}", e))?;

let db_path = data_dir.join("memoji.db");
```

**결과 구조:**
```
Memoji.exe
└── data/
    └── memoji.db  ← 데이터베이스 파일
```

---

### 방안 2: 네트워크 드라이브 사용

#### **VDI에서 유지되는 네트워크 드라이브에 저장**

**장점:**
- ✅ 여러 VDI 세션에서 동일한 데이터 접근
- ✅ 자동 백업 (네트워크 스토리지 정책에 따라)
- ✅ VDI 정리 작업의 영향 없음

**구현 방법:**

**환경 변수 사용:**
```rust
use std::env;

// 환경 변수로 데이터 경로 지정 (예: H:\Memoji)
let data_dir = if let Ok(custom_path) = env::var("MEMOJI_DATA_PATH") {
    PathBuf::from(custom_path)
} else {
    // 기본값: 실행 파일 폴더
    std::env::current_exe()?
        .parent()
        .unwrap()
        .join("data")
};

std::fs::create_dir_all(&data_dir)?;
let db_path = data_dir.join("memoji.db");
```

**사용 방법:**
```powershell
# 환경 변수 설정
setx MEMOJI_DATA_PATH "H:\Memoji"

# Memoji 실행
.\Memoji.exe
```

---

### 방안 3: 설정 파일로 경로 지정

#### **config.json으로 데이터 경로 설정**

**장점:**
- ✅ 사용자가 GUI에서 경로 변경 가능
- ✅ 유연한 경로 관리
- ✅ 여러 프로필 지원 가능

**구현 방법:**

**1. config.json 생성 (실행 파일과 같은 폴더)**
```json
{
  "dataPath": "H:\\Memoji\\data",
  "autoBackup": true,
  "backupPath": "H:\\Memoji\\backup"
}
```

**2. Rust 코드에서 읽기**
```rust
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Deserialize, Serialize)]
struct Config {
    data_path: Option<String>,
    auto_backup: Option<bool>,
    backup_path: Option<String>,
}

fn get_data_dir(app: &tauri::App) -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Failed to get exe directory")?
        .to_path_buf();

    let config_path = exe_dir.join("config.json");

    // config.json이 있으면 읽기
    if config_path.exists() {
        let config_str = fs::read_to_string(&config_path)
            .map_err(|e| e.to_string())?;
        let config: Config = serde_json::from_str(&config_str)
            .map_err(|e| e.to_string())?;

        if let Some(data_path) = config.data_path {
            return Ok(PathBuf::from(data_path));
        }
    }

    // 기본값: 실행 파일 폴더의 data 디렉토리
    Ok(exe_dir.join("data"))
}
```

---

## 🛠️ 즉시 적용 가능한 임시 해결책

### VDI 사용자를 위한 가이드

**1. 네트워크 드라이브에 Memoji 설치**
```
H:\Memoji\
├── Memoji.exe
└── data\
    └── memoji.db
```

**2. 매일 백업 스크립트 작성**
```powershell
# backup.ps1
$source = "C:\Users\$env:USERNAME\AppData\Roaming\com.memoji.app\memoji.db"
$destination = "H:\Memoji\backup\memoji_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"

if (Test-Path $source) {
    Copy-Item -Path $source -Destination $destination
    Write-Host "✅ 백업 완료: $destination"
} else {
    Write-Host "❌ 데이터베이스 파일을 찾을 수 없습니다"
}
```

**3. 작업 스케줄러 등록**
```powershell
# 매일 오후 5시에 자동 백업
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-File H:\Memoji\backup.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 5PM
Register-ScheduledTask -TaskName "Memoji Backup" -Action $action -Trigger $trigger
```

---

## 📊 권장 솔루션 비교

| 방안 | 구현 난이도 | VDI 호환성 | 사용 편의성 | 백업 용이성 |
|------|------------|-----------|-----------|-----------|
| **Portable 모드** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **네트워크 드라이브** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **설정 파일** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

**최종 권장: Portable 모드 + 설정 파일 조합**

---

## 🚀 다음 단계

1. **즉시 적용 (임시)**: 백업 스크립트 사용
2. **단기 (1주)**: Portable 모드 구현
3. **중기 (1개월)**: 설정 파일 + GUI 경로 선택 기능
4. **장기 (3개월)**: 자동 백업 기능 내장

---

## 📝 추가 개선 사항

### 1. 데이터 손실 방지 기능

**자동 백업:**
```rust
// 앱 종료 시 자동 백업
fn backup_database(db_path: &Path) -> Result<(), String> {
    let backup_dir = db_path.parent()
        .ok_or("Failed to get parent dir")?
        .join("backups");
    
    std::fs::create_dir_all(&backup_dir)
        .map_err(|e| e.to_string())?;
    
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("memoji_{}.db", timestamp));
    
    std::fs::copy(db_path, &backup_path)
        .map_err(|e| e.to_string())?;
    
    // 오래된 백업 삭제 (최근 7개만 유지)
    cleanup_old_backups(&backup_dir, 7)?;
    
    Ok(())
}
```

### 2. 데이터 복구 기능

**GUI에서 백업 복원:**
```typescript
// src/components/SettingsModal.tsx
const restoreBackup = async (backupFile: string) => {
  try {
    await invoke('restore_backup', { backupFile });
    toast.success('백업이 복원되었습니다. 앱을 재시작해주세요.');
  } catch (error) {
    toast.error('백업 복원 실패: ' + error);
  }
};
```

### 3. 데이터 경로 표시

**설정 화면에 현재 데이터 경로 표시:**
```typescript
const [dataPath, setDataPath] = useState<string>('');

useEffect(() => {
  const loadDataPath = async () => {
    const path = await invoke<string>('get_data_path');
    setDataPath(path);
  };
  loadDataPath();
}, []);

// UI
<div className="space-y-2">
  <Label>데이터 저장 위치</Label>
  <Input value={dataPath} readOnly />
  <Button onClick={openDataFolder}>폴더 열기</Button>
</div>
```

---

## ✅ 결론

**문제의 핵심:**
- Memoji는 `%APPDATA%\com.memoji.app\memoji.db`에 데이터 저장
- VDI 환경에서 `%APPDATA%` 폴더가 야간 정리 작업으로 삭제됨
- localStorage는 유지되어 달력 표시만 남음

**해결책:**
1. **즉시**: 백업 스크립트 사용
2. **단기**: Portable 모드로 실행 파일 폴더에 데이터 저장
3. **장기**: 설정 파일 + 자동 백업 기능 추가

**구현 우선순위:**
1. ⭐⭐⭐⭐⭐ Portable 모드 구현
2. ⭐⭐⭐⭐ 자동 백업 기능
3. ⭐⭐⭐ 설정 파일 지원
4. ⭐⭐ GUI 경로 선택 기능

