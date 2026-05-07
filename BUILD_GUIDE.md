# Memoji 빌드 가이드

## 📋 빌드 전 체크리스트

### 1. 개발 데이터 정리

**자동 정리 (권장):**
```powershell
.\clean-build.ps1
```

**수동 정리:**

1. **브라우저 localStorage 정리**
   - 개발자 도구 (F12) → Console
   - 실행: `localStorage.clear()`

2. **Tauri 개발 데이터베이스 삭제**
   - 위치: `%APPDATA%\com.memoji.app`
   - 폴더 전체 삭제

3. **빌드 폴더 정리**
   ```powershell
   Remove-Item -Path dist -Recurse -Force
   Remove-Item -Path src-tauri\target\release -Recurse -Force
   ```

---

## 🔨 빌드 방법

### 1. 의존성 설치 (처음 한 번만)
```powershell
npm install
```

### 2. 프로덕션 빌드
```powershell
npm run tauri build
```

### 2-1. 일반 x64 / AVX-512 빌드 분리

일반 PC용 빌드:
```powershell
.\scripts\build-windows-x64.ps1
```

VDI Intel Xeon Gold 6248R 전용 AVX-512 빌드:
```powershell
.\scripts\build-windows-avx512.ps1
```

AVX-512 빌드는 `RUSTFLAGS="-C target-cpu=cascadelake"`를 사용합니다. 일반 x64 산출물과 AVX-512 산출물은 각각 `release/windows-x64`, `release/windows-avx512` 아래에 구분해서 복사됩니다.

### 3. 빌드 결과 확인
빌드가 완료되면 다음 위치에 파일이 생성됩니다:

**Windows:**
- **설치 파일 (MSI)**: `src-tauri\target\release\bundle\msi\Memoji_2.0.0_x64_en-US.msi`
- **실행 파일 (EXE)**: `src-tauri\target\release\Memoji.exe`
- **NSIS 설치 파일**: `src-tauri\target\release\bundle\nsis\Memoji_2.0.0_x64-setup.exe`

---

## 📦 배포 파일

### 권장 배포 방법

**Option 1: MSI 설치 파일 (권장)**
- 파일: `Memoji_2.0.0_x64_en-US.msi`
- 장점: Windows 표준 설치 프로그램
- 설치 위치: `C:\Program Files\Memoji`

**Option 2: NSIS 설치 파일**
- 파일: `Memoji_2.0.0_x64-setup.exe`
- 장점: 더 작은 파일 크기
- 설치 위치: 사용자 선택 가능

**Option 3: Portable EXE**
- 파일: `Memoji.exe`
- 장점: 설치 불필요, USB에서 실행 가능
- 단점: 데이터베이스 경로가 실행 위치에 따라 달라짐

---

## 🔍 빌드 확인 사항

### 1. 버전 정보
- `package.json`: `"version": "2.0.0"`
- `src-tauri/tauri.conf.json`: `"version": "2.0.0"`

### 2. 앱 정보
- 제품명: Memoji
- 식별자: com.memoji.app
- 카테고리: Productivity

### 3. 아이콘
- 위치: `src-tauri/icons/`
- 필요한 파일:
  - `32x32.png`
  - `128x128.png`
  - `128x128@2x.png`
  - `icon.icns` (macOS)
  - `icon.ico` (Windows)

---

## 🚀 배포 후 테스트

### 1. 설치 테스트
1. MSI 파일 실행
2. 설치 진행
3. 시작 메뉴에서 Memoji 실행

### 2. 기능 테스트
- [ ] 앱 실행
- [ ] 새 페이지 생성
- [ ] Milkdown 즉시 편집에서 heading/list/task/code/table 작성
- [ ] 페이지 저장
- [ ] Markdown 원문 모드 전환 후 내용 손실 없음
- [ ] 검색 기능
- [ ] 로컬 AI 상태 조회와 모델 누락 상태 표시
- [ ] 다크/라이트 모드 전환
- [ ] 단축키 작동
- [ ] 앱 재시작 후 데이터 유지

### 3. 데이터 저장 위치 확인
- Windows: `%APPDATA%\com.memoji.app\memoji.db`

---

## ⚠️ 주의사항

### 1. 로컬 AI 리소스 확인
배포 전에 다음 항목을 확인:
- `src-tauri/resources/models/`에 필요한 manifest와 체크섬 문서가 있는지 확인
- 실제 `.gguf` 파일은 git에 커밋하지 않음
- 배포 패키지에 포함할 모델 파일은 체크섬 검증 후 별도 준비

### 2. 개발 데이터 제거
- 테스트용 페이지
- 개발 중 작성한 메모
- 로컬 모델 테스트 로그

### 3. 빌드 환경
- Node.js 18 이상
- Rust 최신 버전
- Windows: Visual Studio Build Tools

---

## 🐛 문제 해결

### 빌드 실패 시

**1. Rust 컴파일 에러**
```powershell
rustup update
cargo clean
```

**2. Node 모듈 에러**
```powershell
Remove-Item -Path node_modules -Recurse -Force
npm install
```

**3. Tauri CLI 에러**
```powershell
npm install -g @tauri-apps/cli
```

### 실행 파일이 바이러스로 감지될 때
- 정상적인 현상 (서명되지 않은 실행 파일)
- 해결: 코드 서명 인증서 구매 및 적용

---

## 📝 릴리스 노트 작성

### v2.0.0 (2026-05-06)

**주요 기능:**
- ✨ Milkdown 기반 Typora식 즉시 렌더링 Markdown 편집
- 📊 GFM table 편집/저장/복원
- 🧩 내장 플러그인 레지스트리: tables, wiki links, tags, tasks, local AI, calendar notes, search index
- 📁 페이지 및 폴더 계층 구조
- 🗓️ 날짜별 메모 관리
- 🔍 제목/본문/태그 검색 인덱싱
- ⌨️ 커스터마이징 가능한 단축키
- 🎨 다크/라이트 모드
- 💾 로컬 SQLite 데이터베이스
- 🤖 로컬 Gemma AI 어시스턴트 (Candle GGUF 경로, 토큰 스트리밍 UX)
- 🔒 Portable 모드 (VDI 환경 지원)

**시스템 요구사항:**
- Windows 10/11 (64-bit)
- 최소 4GB RAM
- 100MB 디스크 공간

---

## 📧 지원

문제가 발생하면 GitHub Issues에 보고해주세요.
