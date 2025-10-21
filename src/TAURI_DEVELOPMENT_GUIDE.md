# 🚀 BlockNote Tauri 개발 가이드

> **완전한 Tauri 데스크톱 앱 개발 가이드**  
> CSS 의존성, UI/UX 일관성, 빌드 최적화를 위한 종합 가이드

---

## 📋 목차

1. [개발 환경 설정](#-개발-환경-설정)
2. [프로젝트 구조](#-프로젝트-구조)
3. [CSS 의존성 관리](#-css-의존성-관리)
4. [UI/UX 일관성 보장](#-uiux-일관성-보장)
5. [Tauri 설정](#-tauri-설정)
6. [빌드 및 배포](#-빌드-및-배포)
7. [성능 최적화](#-성능-최적화)
8. [트러블슈팅](#-트러블슈팅)

---

## 🛠️ 개발 환경 설정

### 1. 필수 도구 설치

```bash
# Rust 설치 (Tauri 필수)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Node.js 18+ 설치 (권장: 20 LTS)
node --version  # v20.x.x 확인

# Tauri CLI 설치
cargo install tauri-cli

# 또는 npm으로 설치
npm install -g @tauri-apps/cli
```

### 2. 시스템별 의존성

**Windows:**
```powershell
# Windows 10/11 + Visual Studio Build Tools
# Microsoft C++ Build Tools 설치 필요
# WebView2 runtime (보통 자동 설치됨)
```

**macOS:**
```bash
# Xcode Command Line Tools
xcode-select --install

# macOS 10.15+ 권장
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

### 3. 프로젝트 클론 및 설정

```bash
# 프로젝트 클론
git clone [repository-url]
cd blocknote

# 의존성 설치
npm install

# Rust 의존성 설치
cd src-tauri
cargo build
cd ..

# 개발 서버 실행
npm run tauri:dev
```

---

## 📁 프로젝트 구조

### 디렉토리 구조
```
blocknote/
├── 🎨 styles/
│   └── globals.css              # Tailwind v4 + 커스텀 스타일
├── 📦 components/
│   ├── ui/                      # shadcn/ui 컴포넌트
│   ├── editor/                  # 에디터 관련 컴포넌트
│   ├── sidebar/                 # 사이드바 컴포넌트
│   └── calendar/                # 달력 컴포넌트
├── 🔧 utils/
│   ├── tauriStorage.ts          # Tauri 파일 시스템 API
│   ├── storage.ts               # 웹 fallback 스토리지
│   └── environment.ts           # 환경 감지
├── 🏗️ src-tauri/
│   ├── src/main.rs             # Rust 백엔드 진입점
│   ├── Cargo.toml              # Rust 의존성
│   └── tauri.conf.json         # Tauri 설정
└── 📋 types/
    └── index.ts                 # TypeScript 타입 정의
```

### 핵심 파일 역할

| 파일 | 역할 | 중요도 |
|------|------|--------|
| `App.tsx` | 메인 애플리케이션 컴포넌트 | 🔥 |
| `globals.css` | 전역 스타일 및 Tailwind 설정 | 🔥 |
| `tauriStorage.ts` | 데이터 저장 로직 | 🔥 |
| `tauri.conf.json` | Tauri 앱 설정 | 🔥 |
| `main.rs` | Rust 백엔드 로직 | 🔥 |

---

## 🎨 CSS 의존성 관리

### 1. Tailwind v4 설정

**중요:** Tailwind v4는 설정 파일 없이 CSS에서 직접 설정합니다.

```css
/* styles/globals.css */

/* 1. Tailwind v4 커스텀 변형 정의 */
@custom-variant dark (&:is(.dark *));

/* 2. CSS 변수로 테마 정의 */
:root {
  --font-size: 16px;
  --background: #ffffff;
  --foreground: oklch(0.145 0 0);
  /* ... 더 많은 변수들 */
}

/* 3. 다크 모드 변수 */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  /* ... 다크 모드 오버라이드 */
}

/* 4. Tailwind 테마 인라인 정의 */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... 모든 색상 매핑 */
}
```

### 2. 중요한 CSS 규칙

**절대 건드리지 말 것:**
```css
/* 기본 타이포그래피 - 수정 금지 */
:where(:not(:has([class*=" text-"]), :not(:has([class^="text-"])))) {
  h1 { font-size: var(--text-2xl); font-weight: var(--font-weight-medium); }
  h2 { font-size: var(--text-xl); font-weight: var(--font-weight-medium); }
  p { font-size: var(--text-base); font-weight: var(--font-weight-normal); }
  /* ... */
}
```

**항상 유지해야 할 스타일:**
```css
/* 전역 스크롤바 - 세련된 디자인 필수 */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 163, 175, 0.1) transparent;
}

*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.1);
  border-radius: 3px;
  transition: background-color 0.2s ease;
}
```

### 3. 컴포넌트별 스타일 가이드

**DO ✅:**
```tsx
// 의미적 Tailwind 클래스 사용
<div className="bg-background text-foreground border-border rounded-lg p-4">
  <h2 className="mb-2">제목</h2>  {/* 타이포그래피는 기본값 사용 */}
  <p>내용</p>
</div>
```

**DON'T ❌:**
```tsx
// 직접적인 폰트 크기/굵기 지정 금지
<div className="text-2xl font-bold">  {/* 이렇게 하지 마세요 */}
  <h2>제목</h2>
</div>
```

---

## 🖼️ UI/UX 일관성 보장

### 1. 컴포넌트 계층 구조

```tsx
// 올바른 컴포넌트 구조
<ThemeProvider>          // 1. 테마 제공자
  <div className="h-screen flex flex-col">
    <TopBar />           // 2. 최상단 바
    <div className="flex flex-1">
      <Sidebar />        // 3. 사이드바
      <MarkdownEditor /> // 4. 메인 콘텐츠
    </div>
    <Toaster />          // 5. 토스트 알림
  </div>
</ThemeProvider>
```

### 2. 반응형 디자인 원칙

**브레이크포인트:**
```css
/* Mobile First 접근 */
.container {
  @apply w-full px-4;           /* 기본: 모바일 */
  @apply sm:px-6;               /* 640px+ */
  @apply md:px-8;               /* 768px+ */
  @apply lg:max-w-6xl lg:mx-auto; /* 1024px+ */
}
```

**사이드바 반응형:**
```tsx
// 화면 크기에 따른 동적 조절
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

<div className={`
  flex-shrink-0 transition-all duration-300
  ${isSidebarCollapsed ? 'w-0 overflow-hidden' : 'w-52'}
  ${isMobile ? 'absolute z-50' : 'relative'}
`}>
```

### 3. 다크 모드 일관성

**테마 컨텍스트:**
```tsx
// ThemeProvider.tsx
const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);
  
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
```

### 4. 키보드 네비게이션

**접근성 최우선:**
```tsx
// 키보드 단축키 구현
useEffect(() => {
  const handleKeyDown = (event: KeyboardEvent) => {
    // Ctrl+N: 새 메모
    if (event.ctrlKey && event.key === 'n') {
      event.preventDefault();
      handlePageCreate(`메모 ${new Date().getHours()}:${new Date().getMinutes()}`);
    }
    
    // Ctrl+F: 검색 포커스
    if (event.ctrlKey && event.key === 'f') {
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    
    // Escape: 검색 초기화
    if (event.key === 'Escape') {
      setSearchQuery('');
    }
  };
  
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, []);
```

---

## ⚙️ Tauri 설정

### 1. tauri.conf.json 완전 설정

```json
{
  "productName": "BlockNote",
  "version": "0.1.0",
  "identifier": "com.blocknote.app",
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:1420",
    "frontendDist": "../dist"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "category": "Productivity",
    "copyright": "© 2024 BlockNote",
    "shortDescription": "Notion-style block-based note app",
    "longDescription": "A powerful offline-first note-taking app with markdown support and tag system",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": ""
    },
    "macOS": {
      "entitlements": null,
      "exceptionDomain": "",
      "frameworks": [],
      "providerShortName": null,
      "signingIdentity": null
    }
  },
  "app": {
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "BlockNote",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "center": true,
        "decorations": true,
        "transparent": false,
        "alwaysOnTop": false
      }
    ],
    "security": {
      "csp": null,
      "devCsp": null,
      "freezePrototype": false,
      "dangerousDisableAssetCspModification": false
    }
  },
  "plugins": {
    "fs": {
      "scope": [
        "$APPDATA/blocknote",
        "$APPDATA/blocknote/**"
      ]
    },
    "dialog": {
      "all": true,
      "ask": true,
      "confirm": true,
      "message": true,
      "open": true,
      "save": true
    },
    "shell": {
      "all": false,
      "execute": false,
      "sidecar": false,
      "open": true
    }
  }
}
```

### 2. Rust 백엔드 설정 (main.rs)

```rust
// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    match app.path().app_data_dir() {
        Ok(path) => Ok(path.to_string_lossy().to_string()),
        Err(e) => Err(format!("Failed to get app data directory: {}", e)),
    }
}

#[tauri::command]
fn log_environment_info() {
    println!("Tauri environment initialized");
    println!("Platform: {}", std::env::consts::OS);
    println!("Architecture: {}", std::env::consts::ARCH);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            log_environment_info
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. Cargo.toml 설정

```toml
[package]
name = "blocknote"
version = "0.1.0"
description = "Notion-style block-based note app"
authors = ["BlockNote Team"]
license = "MIT"
repository = "https://github.com/your-username/blocknote"
edition = "2021"
rust-version = "1.70"

[build-dependencies]
tauri-build = { version = "2.0", features = [] }

[dependencies]
serde_json = "1.0"
serde = { version = "1.0", features = ["derive"] }
tauri = { version = "2.0", features = ["macos-private-api"] }
tauri-plugin-fs = "2.0"
tauri-plugin-dialog = "2.0"
tauri-plugin-shell = "2.0"

[features]
custom-protocol = ["tauri/custom-protocol"]
```

---

## 🚀 빌드 및 배포

### 1. 개발 빌드

```bash
# 웹 개발 모드 (빠른 개발)
npm run dev:web

# Tauri 개발 모드 (실제 데스크톱 앱)
npm run tauri:dev

# 타입 체크
npm run type-check
```

### 2. 프로덕션 빌드

```bash
# 모든 플랫폼용 빌드
npm run tauri:build

# 특정 플랫폼용 빌드
npm run tauri:build -- --target x86_64-pc-windows-msvc  # Windows
npm run tauri:build -- --target x86_64-apple-darwin    # macOS Intel
npm run tauri:build -- --target aarch64-apple-darwin   # macOS Apple Silicon
npm run tauri:build -- --target x86_64-unknown-linux-gnu # Linux
```

### 3. 빌드 최적화

**Vite 설정 (vite.config.ts):**
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async () => ({
  plugins: [react()],
  
  // Tauri 환경 감지
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  
  // 빌드 최적화
  build: {
    target: process.env.TAURI_ENV_PLATFORM == 'windows' 
      ? 'chrome105' 
      : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    rollupOptions: {
      external: ['@tauri-apps/api'],
    },
  },
  
  // 환경 변수
  envPrefix: ['VITE_', 'TAURI_ENV_'],
}));
```

### 4. 아이콘 준비

```bash
# 아이콘 디렉토리 구조
src-tauri/icons/
├── 32x32.png
├── 128x128.png
├── 128x128@2x.png
├── icon.icns      # macOS
├── icon.ico       # Windows
└── Square*.png    # Windows Store (옵션)
```

**아이콘 생성 스크립트:**
```bash
# ImageMagick으로 자동 생성
convert original-icon.png -resize 32x32 src-tauri/icons/32x32.png
convert original-icon.png -resize 128x128 src-tauri/icons/128x128.png
convert original-icon.png -resize 256x256 src-tauri/icons/128x128@2x.png

# macOS .icns 생성
iconutil -c icns src-tauri/icons/icon.iconset

# Windows .ico 생성
convert original-icon.png -define icon:auto-resize=256,128,96,64,48,32,16 src-tauri/icons/icon.ico
```

---

## ⚡ 성능 최적화

### 1. 번들 크기 최적화

**의존성 분석:**
```bash
# 번들 크기 분석
npm run build
npx vite-bundle-analyzer dist

# 불필요한 의존성 제거
npm-check-updates
npm audit
```

**Code Splitting:**
```tsx
// 컴포넌트 레이지 로딩
const MarkdownEditor = lazy(() => import('./components/MarkdownEditor'));
const Sidebar = lazy(() => import('./components/Sidebar'));

// 조건부 로딩
const DevTools = process.env.NODE_ENV === 'development' 
  ? lazy(() => import('./components/DevTools'))
  : null;
```

### 2. 런타임 최적화

**메모이제이션:**
```tsx
// 무거운 계산 메모이제이션
const filteredPages = useMemo(() => {
  return pages.filter(page => {
    const pageDate = new Date(page.createdAt);
    return formatDateKey(pageDate) === formatDateKey(selectedDate);
  });
}, [pages, selectedDate]);

// 콜백 메모이제이션
const handlePageCreate = useCallback(async (title: string) => {
  const newPage = { /* ... */ };
  await tauriStorage.savePage(newPage);
  setPages(prev => [...prev, newPage]);
}, []);
```

**디바운싱:**
```tsx
// 검색 성능 최적화
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedSearchQuery(searchQuery);
  }, 300);
  
  return () => clearTimeout(timer);
}, [searchQuery]);
```

### 3. Tauri 최적화

**Rust 컴파일 최적화 (Cargo.toml):**
```toml
[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

**메모리 사용량 최적화:**
```tsx
// 대용량 데이터 스트리밍
const loadPagesInBatches = async () => {
  const batchSize = 50;
  for (let i = 0; i < totalPages; i += batchSize) {
    const batch = await tauriStorage.getPages(i, batchSize);
    setPages(prev => [...prev, ...batch]);
    
    // UI 블로킹 방지
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};
```

---

## 🐛 트러블슈팅

### 1. 일반적인 문제

**문제: Tauri 명령이 작동하지 않음**
```bash
# 해결: 러스트 환경 재설정
rustup update
cargo clean
cd src-tauri && cargo build
```

**문제: 웹뷰에서 스타일이 깨짐**
```tsx
// 해결: CSP 헤더 확인
// tauri.conf.json에서 csp 설정
{
  "app": {
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

**문제: 파일 시스템 접근 거부**
```json
// 해결: 플러그인 권한 확인
{
  "plugins": {
    "fs": {
      "scope": [
        "$APPDATA/blocknote",
        "$APPDATA/blocknote/**"
      ]
    }
  }
}
```

### 2. 플랫폼별 문제

**Windows:**
```bash
# Visual Studio Build Tools 설치 확인
where cl.exe

# WebView2 설치 확인
Get-AppxPackage Microsoft.WebView2
```

**macOS:**
```bash
# Xcode CLI 도구 확인
xcode-select -p

# 서명 문제 해결
codesign --force --deep --sign - src-tauri/target/release/bundle/macos/BlockNote.app
```

**Linux:**
```bash
# 필수 라이브러리 설치 확인
ldd src-tauri/target/release/blocknote

# 권한 문제 해결
chmod +x src-tauri/target/release/blocknote
```

### 3. 성능 문제

**메모리 누수 감지:**
```tsx
// React DevTools Profiler 사용
// 컴포넌트 언마운트 시 정리
useEffect(() => {
  return () => {
    // 이벤트 리스너 정리
    document.removeEventListener('keydown', handleKeyDown);
    
    // 타이머 정리
    clearTimeout(debounceTimer);
    
    // 구독 해제
    unsubscribe?.();
  };
}, []);
```

**디스크 I/O 최적화:**
```tsx
// 배치 저장으로 성능 향상
const savePagesBatch = useCallback(async (pages: Page[]) => {
  const operations = pages.map(page => 
    tauriStorage.savePage(page)
  );
  
  await Promise.all(operations);
}, []);
```

---

## 🎯 체크리스트

### 개발 시작 전 ✅
- [ ] Rust 및 Node.js 환경 설정 완료
- [ ] Tauri CLI 설치 및 테스트
- [ ] 모든 시스템 의존성 설치
- [ ] `npm run tauri:dev` 정상 실행 확인

### 스타일링 작업 시 ✅
- [ ] `globals.css` 기본 설정 유지
- [ ] 폰트 크기/굵기 직접 지정 금지
- [ ] 다크모드 테스트 완료
- [ ] 스크롤바 스타일 확인

### 컴포넌트 개발 시 ✅
- [ ] TypeScript 타입 정의
- [ ] 키보드 접근성 구현
- [ ] 에러 바운더리 적용
- [ ] 메모이제이션 적용

### 빌드 전 ✅
- [ ] 타입 오류 해결
- [ ] 린트 오류 해결
- [ ] 테스트 통과
- [ ] 아이콘 파일 준비
- [ ] 인증서 설정 (배포용)

### 배포 전 ✅
- [ ] 모든 플랫폼 빌드 테스트
- [ ] 성능 벤치마크 확인
- [ ] 보안 감사 완료
- [ ] 문서 업데이트

---

## 📚 추가 리소스

### 공식 문서
- [Tauri 공식 가이드](https://tauri.app/guides/)
- [Tailwind CSS v4 문서](https://tailwindcss.com/blog/tailwindcss-v4-alpha)
- [shadcn/ui 컴포넌트](https://ui.shadcn.com/)

### 커뮤니티
- [Tauri Discord](https://discord.gg/tauri)
- [GitHub 이슈 트래커](https://github.com/tauri-apps/tauri/issues)

### 도구
- [Tauri Icon 생성기](https://tauri.app/guides/features/icons/)
- [Bundle 분석기](https://bundlephobia.com/)

---

*이 가이드는 BlockNote 프로젝트의 성공적인 Tauri 개발을 위한 완전한 레퍼런스입니다. 문제가 발생하면 이 가이드를 참조하여 해결하세요.*