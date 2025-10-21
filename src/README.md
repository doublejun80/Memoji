# 📝 BlockNote

<div align="center">

**Notion 스타일의 블록 기반 메모 앱**

_오프라인 우선, VDI 호환, 키보드 중심의 데스크톱 메모 애플리케이션_

[![Tauri](https://img.shields.io/badge/Tauri-2.0-blue.svg)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.70+-orange.svg)](https://www.rust-lang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

</div>

## ✨ 핵심 특징

BlockNote는 Tauri를 사용한 크로스 플랫폼 데스크톱 메모 애플리케이션입니다. 모든 데이터를 로컬에 저장하여 완전한 오프라인 작업이 가능하며, VDI 환경에서도 안전하게 사용할 수 있습니다.

### 🎯 주요 기능

- **📄 마크다운 에디터**: 실시간 미리보기가 포함된 강력한 마크다운 편집기
- **📅 날짜별 메모 관리**: 달력 기반 직관적인 날짜별 메모 시스템
- **🏷️ 태그 시스템**: #태그를 통한 빠른 분류 및 검색 (한글 완벽 지원)
- **🔍 고급 검색**: 전체 텍스트, 태그, 접두사 검색 지원
- **⌨️ 키보드 중심**: 마우스 없이도 모든 기능 사용 가능
- **🌙 다크/라이트 테마**: 시스템 테마 자동 적용
- **💾 로컬 저장**: SQLite 기반 안전한 로컬 데이터 저장
- **🔒 오프라인 우선**: 네트워크 연결 없이도 완전한 기능 제공

## 🛠️ 기술 스택

<table>
<tr>
<td><strong>Frontend</strong></td>
<td>React 18 + TypeScript + Tailwind CSS v4</td>
</tr>
<tr>
<td><strong>Desktop</strong></td>
<td>Tauri v2 (Rust 기반)</td>
</tr>
<tr>
<td><strong>Database</strong></td>
<td>SQLite (로컬 파일 시스템)</td>
</tr>
<tr>
<td><strong>UI Library</strong></td>
<td>shadcn/ui + Radix UI</td>
</tr>
<tr>
<td><strong>Build Tool</strong></td>
<td>Vite + TypeScript + PostCSS</td>
</tr>
<tr>
<td><strong>Icons</strong></td>
<td>Lucide React</td>
</tr>
<tr>
<td><strong>Styling</strong></td>
<td>Tailwind CSS v4 + CSS Custom Properties</td>
</tr>
</table>

## 🚀 빠른 시작

### 📋 필수 요구사항

시작하기 전에 다음 도구들이 설치되어 있는지 확인하세요:

- **Node.js** 18.0+ (권장: 20 LTS)
- **Rust** 1.70+
- **Tauri CLI** 2.0+

#### 🔧 시스템별 의존성

<details>
<summary><strong>Windows</strong></summary>

```powershell
# Microsoft C++ Build Tools 설치 필요
# WebView2 runtime (보통 자동 설치됨)
```

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
# Xcode Command Line Tools
xcode-select --install
```

</details>

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

</details>

### 📦 설치 및 실행

### 1️⃣ 프로젝트 클론

```bash
git clone https://github.com/your-username/blocknote.git
cd blocknote
```

### 2️⃣ 환경 설정

```bash
# 환경 변수 설정 (선택사항)
cp .env.example .env

# Rust 설치 (필요한 경우)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Tauri CLI 설치
cargo install tauri-cli
```

### 3️⃣ 의존성 설치

```bash
# Node.js 의존성 설치
npm install

# Rust 의존성 설치 및 확인
cd src-tauri && cargo check && cd ..
```

### 4️⃣ 개발 서버 실행

<table>
<tr>
<th>모드</th>
<th>명령어</th>
<th>설명</th>
</tr>
<tr>
<td><strong>웹 모드</strong></td>
<td><code>npm run dev:web</code></td>
<td>브라우저에서 테스트 (localStorage 사용)</td>
</tr>
<tr>
<td><strong>데스크톱 모드</strong></td>
<td><code>npm run tauri:dev</code></td>
<td>실제 데스크톱 앱 (SQLite 사용)</td>
</tr>
</table>

웹 모드에서는 `http://localhost:1420`으로 접속하여 테스트할 수 있습니다.

### 5️⃣ 프로덕션 빌드

```bash
# 모든 플랫폼용 빌드
npm run tauri:build

# 특정 플랫폼용 빌드 (예시)
npm run tauri:build -- --target x86_64-pc-windows-msvc  # Windows
npm run tauri:build -- --target x86_64-apple-darwin     # macOS Intel
npm run tauri:build -- --target aarch64-apple-darwin    # macOS Apple Silicon
```

빌드 결과물은 `src-tauri/target/release/bundle/` 디렉토리에 생성됩니다.

## 📁 프로젝트 구조

```
blocknote/
├── 🎨 Frontend
│   ├── App.tsx                    # 메인 애플리케이션 컴포넌트
│   ├── components/                # React 컴포넌트들
│   │   ├── ui/                   # shadcn/ui 컴포넌트 라이브러리
│   │   ├── editor/               # 마크다운 에디터 관련
│   │   ├── sidebar/              # 사이드바 및 네비게이션
│   │   ├── calendar/             # 달력 위젯
│   │   └── common/               # 공통 재사용 컴포넌트
│   ├── utils/                    # 유틸리티 함수들
│   │   ├── tauriStorage.ts       # Tauri 파일 시스템 API
│   │   ├── storage.ts            # 웹 브라우저 fallback
│   │   └── environment.ts        # 환경 감지 및 설정
│   ├── types/                    # TypeScript 타입 정의
│   ├── styles/                   # 글로벌 CSS 및 Tailwind
│   └── public/                   # 정적 리소스 (아이콘 등)
│
├── 🦀 Backend (Rust)
│   └── src-tauri/
│       ├── src/main.rs           # Tauri 백엔드 진입점
│       ├── Cargo.toml            # Rust 의존성 관리
│       ├── tauri.conf.json       # Tauri 앱 설정
│       └── icons/                # 앱 아이콘들
│
├── 📋 Configuration
│   ├── package.json              # Node.js 의존성 및 스크립트
│   ├── vite.config.ts            # Vite 빌드 설정
│   ├── postcss.config.js         # PostCSS 설정
│   ├── tsconfig.json             # TypeScript 설정
│   └── .env.example              # 환경 변수 템플릿
│
└── 📚 Documentation
    ├── README.md                 # 이 파일
    ├── PRD.md                    # 제품 요구 사항 문서
    └── TAURI_DEVELOPMENT_GUIDE.md # 완전한 Tauri 개발 가이드
```

## ⌨️ 키보드 단축키

BlockNote는 키보드 중심의 워크플로우를 제공합니다:

| 단축키   | 기능                       |
| -------- | -------------------------- |
| `Ctrl+N` | 새 메모 생성               |
| `Ctrl+F` | 검색 포커스                |
| `Escape` | 검색 초기화                |
| `Ctrl+S` | 수동 저장 (자동 저장 기본) |
| `Ctrl+E` | 편집/미리보기 모드 토글    |

## 🏷️ 태그 시스템

BlockNote의 강력한 태그 시스템을 활용하세요:

- **태그 생성**: `#태그명`으로 자동 인식
- **한글 지원**: `#할일`, `#아이디어`, `#프로젝트` 등
- **클릭 검색**: 태그를 클릭하면 자동으로 검색
- **다중 태그**: 여러 태그를 조합하여 정확한 검색

### 검색 문법

| 검색 방법 | 예시               | 설명                    |
| --------- | ------------------ | ----------------------- |
| 일반 검색 | `리액트`           | 제목과 내용에서 검색    |
| 태그 검색 | `#프로젝트`        | 특정 태그가 포함된 메모 |
| 제목 검색 | `title:회의`       | 제목에서만 검색         |
| 내용 검색 | `content:코드`     | 내용에서만 검색         |
| 복합 검색 | `#프로젝트 리액트` | 태그와 키워드 조합      |

## 🔧 개발 가이드

자세한 개발 가이드는 다음 문서들을 참조하세요:

- **[📋 PRD.md](./PRD.md)**: 제품 요구 사항 문서 및 로드맵
- **[🚀 TAURI_DEVELOPMENT_GUIDE.md](./TAURI_DEVELOPMENT_GUIDE.md)**: 완전한 Tauri 개발 가이드

### 주요 스크립트

```bash
# 개발
npm run dev:web          # 웹 모드 개발 서버
npm run tauri:dev        # 데스크톱 앱 개발 모드

# 빌드
npm run build           # 웹 빌드
npm run tauri:build     # 데스크톱 앱 빌드
npm run tauri:bundle    # 모든 형식으로 번들링

# 유틸리티
npm run type-check      # TypeScript 타입 검사
npm run lint           # ESLint 검사
npm run clean          # 빌드 파일 정리
```

### 환경 구성

```bash
# 환경 변수 설정
cp .env.example .env

# 중요한 환경 변수들
VITE_DEBUG_ENABLED=true           # 디버그 모드
VITE_AUTO_SAVE_INTERVAL=5000     # 자동 저장 간격 (ms)
VITE_SEARCH_DEBOUNCE=300         # 검색 디바운스 (ms)
```

## 🚀 배포

### 플랫폼별 빌드

```bash
# Windows
npm run tauri:build -- --target x86_64-pc-windows-msvc

# macOS (Intel)
npm run tauri:build -- --target x86_64-apple-darwin

# macOS (Apple Silicon)
npm run tauri:build -- --target aarch64-apple-darwin

# Linux
npm run tauri:build -- --target x86_64-unknown-linux-gnu
```

### 배포 파일 위치

빌드된 설치 파일들은 다음 위치에 생성됩니다:

```
src-tauri/target/release/bundle/
├── deb/          # Linux .deb 패키지
├── dmg/          # macOS .dmg 이미지
├── msi/          # Windows .msi 설치 파일
├── appimage/     # Linux AppImage
└── macos/        # macOS .app 번들
```

## 🛡️ 보안 및 프라이버시

- **🔒 완전한 오프라인**: 모든 데이터가 로컬에 저장
- **🚫 데이터 수집 없음**: 사용자 데이터를 외부로 전송하지 않음
- **💾 로컬 저장**: SQLite 데이터베이스로 안전한 로컬 저장
- **🔐 VDI 호환**: 제한된 네트워크 환경에서도 안전하게 사용

## 🐛 트러블슈팅

### 일반적인 문제들

<details>
<summary><strong>Tauri 개발 서버가 시작되지 않음</strong></summary>

```bash
# Rust 환경 재설정
rustup update
cargo clean
cd src-tauri && cargo build
```

</details>

<details>
<summary><strong>빌드 에러 발생</strong></summary>

```bash
# 의존성 재설치
npm run clean:deps
npm install

# Rust 컴포넌트 재빌드
cd src-tauri
cargo clean
cargo build
```

</details>

<details>
<summary><strong>스타일이 깨짐</strong></summary>

- `styles/globals.css`의 기본 설정이 유지되는지 확인
- Tailwind 클래스 충돌 확인
- 다크 모드 테스트
</details>

## 📚 추가 리소스

- **[Tauri 공식 문서](https://tauri.app/guides/)**
- **[React 18 문서](https://reactjs.org/docs/getting-started.html)**
- **[Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4-alpha)**
- **[shadcn/ui 컴포넌트](https://ui.shadcn.com/)**

## 📝 라이선스

이 프로젝트는 [MIT 라이선스](LICENSE) 하에 배포됩니다.

## 🤝 기여하기

BlockNote는 오픈소스 프로젝트입니다. 기여를 환영합니다!

### 기여 프로세스

1. **Fork** 이 저장소를 포크합니다
2. **Branch** 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`)
3. **Commit** 변경사항을 커밋합니다 (`git commit -m 'Add amazing feature'`)
4. **Push** 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. **PR** Pull Request를 생성합니다

### 기여 가이드라인

- 코드 스타일: ESLint 및 Prettier 설정을 따라주세요
- 타입 안전성: TypeScript를 적극 활용해주세요
- 테스트: 새로운 기능에는 테스트를 포함해주세요
- 문서화: README나 코드 주석을 업데이트해주세요

## 💬 커뮤니티

- **Issues**: 버그 리포트나 기능 요청
- **Discussions**: 일반적인 질문이나 아이디어 공유
- **Discord**: [커뮤니티 Discord 서버](#) (준비 중)

## 📧 문의

프로젝트 관련 문의사항이 있으시면 다음 방법으로 연락해 주세요:

- **GitHub Issues**: 버그 리포트나 기능 요청
- **GitHub Discussions**: 일반적인 질문이나 피드백
- **Email**: [your-email@example.com](mailto:your-email@example.com)

---

<div align="center">

**BlockNote로 더 나은 메모 경험을 만들어보세요! 🚀**

⭐ 이 프로젝트가 도움이 되었다면 별표를 눌러주세요!

</div>