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

### 3. 빌드 결과 확인
빌드가 완료되면 다음 위치에 파일이 생성됩니다:

**Windows:**
- **설치 파일 (MSI)**: `src-tauri\target\release\bundle\msi\Memoji_1.0.0_x64_en-US.msi`
- **실행 파일 (EXE)**: `src-tauri\target\release\Memoji.exe`
- **NSIS 설치 파일**: `src-tauri\target\release\bundle\nsis\Memoji_1.0.0_x64-setup.exe`

---

## 📦 배포 파일

### 권장 배포 방법

**Option 1: MSI 설치 파일 (권장)**
- 파일: `Memoji_1.0.0_x64_en-US.msi`
- 장점: Windows 표준 설치 프로그램
- 설치 위치: `C:\Program Files\Memoji`

**Option 2: NSIS 설치 파일**
- 파일: `Memoji_1.0.0_x64-setup.exe`
- 장점: 더 작은 파일 크기
- 설치 위치: 사용자 선택 가능

**Option 3: Portable EXE**
- 파일: `Memoji.exe`
- 장점: 설치 불필요, USB에서 실행 가능
- 단점: 데이터베이스 경로가 실행 위치에 따라 달라짐

---

## 🔍 빌드 확인 사항

### 1. 버전 정보
- `package.json`: `"version": "1.0.0"`
- `src-tauri/tauri.conf.json`: `"version": "1.0.0"`

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
- [ ] 마크다운 작성
- [ ] 페이지 저장
- [ ] 검색 기능
- [ ] 다크/라이트 모드 전환
- [ ] 단축키 작동
- [ ] 앱 재시작 후 데이터 유지

### 3. 데이터 저장 위치 확인
- Windows: `%APPDATA%\com.memoji.app\memoji.db`

---

## ⚠️ 주의사항

### 1. API 키 제거 확인
배포 전에 다음 항목에 API 키가 없는지 확인:
- localStorage (브라우저)
- 소스 코드 내 하드코딩된 키
- 환경 변수 파일 (.env)

### 2. 개발 데이터 제거
- 테스트용 페이지
- 개발 중 작성한 메모
- API 설정 정보

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

### v1.0.0 (2025-01-XX)

**주요 기능:**
- ✨ 마크다운 기반 메모 작성
- 📁 페이지 및 폴더 계층 구조
- 🗓️ 날짜별 메모 관리
- 🔍 전체 검색 기능
- ⌨️ 커스터마이징 가능한 단축키
- 🎨 다크/라이트 모드
- 💾 로컬 SQLite 데이터베이스
- 🤖 AI 채팅 어시스턴트 (8개 LLM 지원)
- 🔒 Portable 모드 (VDI 환경 지원)

**시스템 요구사항:**
- Windows 10/11 (64-bit)
- 최소 4GB RAM
- 100MB 디스크 공간

---

## 📧 지원

문제가 발생하면 GitHub Issues에 보고해주세요.

