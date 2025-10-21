# 📋 BlockNote (Memoji) 프로젝트 진행 상황

## 🎯 프로젝트 개요

**BlockNote**는 Notion 스타일의 블록 기반 메모 앱으로, Tauri v2를 사용하여 React 프론트엔드를 단일 실행 파일로 빌드하는 데스크톱 메모 애플리케이션입니다.

### 핵심 목표
- ✅ 오프라인 우선 (모든 데이터 로컬 저장)
- ✅ VDI 호환 (단일 실행 파일)
- ✅ 키보드 중심 UI
- ✅ 계층적 페이지 관리
- ✅ 태그 시스템

---

## 📊 현재 프로젝트 상태

### ✅ 완료된 핵심 기능 (Phase 1)

#### 1. 기본 아키텍처 구축
- **Frontend**: React 18 + TypeScript + Tailwind CSS v4
- **Desktop**: Tauri v2 (Rust 기반)
- **Database**: SQLite (로컬 저장)
- **UI Library**: shadcn/ui + Radix UI
- **Build Tool**: Vite

#### 2. 날짜별 메모 관리 시스템
- ✅ 달력 기반 네비게이션 (`CalendarWidget.tsx`)
- ✅ 날짜별 필터링 기능
- ✅ 시각적 표시 (메모가 있는 날짜 표시)
- ✅ 자동 날짜 할당

**관련 파일:**
- `src/components/CalendarWidget.tsx`
- `src/components/calendar/CalendarGrid.tsx`
- `src/components/calendar/CalendarHeader.tsx`
- `src/utils/dateUtils.ts`

#### 3. 마크다운 에디터
- ✅ 실시간 미리보기 (`MarkdownEditor.tsx`)
- ✅ 마크다운 문법 완전 지원
- ✅ 편집/미리보기 모드 토글
- ✅ 태그 렌더링 (#태그 → 파란색 배지)

**관련 파일:**
- `src/components/MarkdownEditor.tsx`
- `src/components/editor/EditorTextArea.tsx`
- `src/components/editor/EditorToolbar.tsx`
- `src/components/editor/MarkdownPreview.tsx`

#### 4. 태그 시스템
- ✅ 한글 태그 완전 지원 (#할일, #아이디어)
- ✅ 실시간 렌더링 (배지 형태)
- ✅ 클릭 검색 기능
- ✅ 태그 기반 필터링

**관련 파일:**
- `src/components/TagRenderer.tsx`
- `src/components/TagInput.tsx`
- `src/components/TagFilter.tsx`
- `src/components/TagHighlightOverlay.tsx`

#### 5. 고급 검색 기능
- ✅ 전체 텍스트 검색 (제목 + 내용)
- ✅ 태그 검색 (#태그명)
- ✅ 접두사 검색 (title:, content:)
- ✅ 실시간 검색 (300ms 디바운스)

**관련 파일:**
- `src/components/SearchModal.tsx`
- `src/utils/searchHighlight.ts`

#### 6. 사이드바 관리
- ✅ 접을 수 있는 사이드바
- ✅ 페이지 목록 표시
- ✅ 상태 저장 (localStorage)
- ✅ 검색 결과 필터링

**관련 파일:**
- `src/components/Sidebar.tsx`
- `src/components/sidebar/PageItem.tsx`
- `src/components/sidebar/PageMenu.tsx`

#### 7. 데이터 관리
- ✅ 로컬 SQLite 저장
- ✅ 자동 저장 기능
- ✅ 빈 페이지 자동 정리
- ✅ Tauri 파일 시스템 통합

**관련 파일:**
- `src/utils/tauriStorage.ts`
- `src/utils/storage.ts`
- `src-tauri/src/main.rs`

#### 8. UI/UX 컴포넌트
- ✅ 키보드 단축키 시스템
  - `Ctrl+N`: 새 메모
  - `Ctrl+K`: 검색
  - `Ctrl+S`: 저장
  - `Ctrl+Shift+K`: 단축키 도움말
- ✅ 다크/라이트 테마
- ✅ 포커스 모드
- ✅ 에러 바운더리

**관련 파일:**
- `src/components/KeyboardShortcutsModal.tsx`
- `src/components/ThemeProvider.tsx`
- `src/contexts/ThemeContext.tsx`
- `src/contexts/FocusModeContext.tsx`
- `src/components/ErrorBoundary.tsx`

---

## 🚧 진행 중인 작업 (Phase 2)

### UX 향상
- ✅ 키보드 단축키 구현 완료
- ✅ 자동 저장 구현 완료
- ✅ 빈 페이지 정리 구현 완료
- ✅ **우측 검색 패널 추가 (2025-09-30)**
  - 옵시디언 스타일 검색 UI
  - 전체/제목/내용/태그 필터
  - 실시간 검색 결과 표시
  - 토글 가능한 우측 패널
- ⏳ 성능 최적화 (진행 필요)
- ⏳ 오류 처리 강화 (진행 필요)

### 최근 추가된 기능 (2025-09-30)
**우측 검색 패널 구현**
- `RightPanel.tsx` 컴포넌트 신규 생성
- 3단 레이아웃 구조 (좌측 사이드바 - 중앙 에디터 - 우측 검색 패널)
- 옵시디언 스타일 검색 필터 버튼 (아이콘 + 텍스트)
- TopBar에 패널 토글 버튼 추가
- 검색 결과 실시간 표시 및 하이라이트

### 최근 UI/UX 개선 사항 (2025-10-02)

#### 1. 마크다운 에디터 스크롤 개선
**문제**: 미리보기 모드에서 스크롤이 작동하지 않음
**해결**:
- Flexbox 레이아웃에서 Absolute Positioning으로 변경
- `absolute inset-0 overflow-y-auto` 구조 적용
- 편집/미리보기 모드 간 스크롤 위치 동기화 구현
- Textarea 자동 높이 조절 기능 추가

**관련 파일**: `src/components/MarkdownEditor.tsx`

#### 2. 페이지 메뉴 가로형 아이콘 네비게이션
**변경 전**: 세로형 드롭다운 메뉴 (텍스트 + 아이콘)
**변경 후**: 가로형 아이콘 네비게이션
- 6개 버튼: 수정 / 페이지 추가 / 폴더 추가 / 위로 이동 / 아래로 이동 / 삭제
- 아이콘 크기: 12px (h-3 w-3)
- 선 두께: strokeWidth 1.2~1.5
- 클릭 영역: 28px × 28px (h-7 w-7)
- 호버 효과 및 툴팁 추가
- 구분선으로 그룹 분리

**관련 파일**: `src/components/Sidebar.tsx`

#### 3. 페이지 이동 기능 개선
**문제**: 하위 항목이 있는 페이지/폴더를 이동할 수 없음
**해결**:
- 같은 부모를 가진 형제 페이지들 사이에서만 순서 변경
- 하위 항목이 있어도 이동 가능하도록 로직 수정
- 계층 구조 유지하면서 순서 변경

**관련 파일**: `src/App.tsx` (handlePageMove 함수)

#### 4. 사이드바 헤더 레이아웃 개선
**변경 사항**:
- 좌우 패딩 축소: `px-6` → `px-3`
- 날짜 텍스트: `truncate` → `whitespace-nowrap` (전체 표시)
- 버튼 크기 축소: `h-8 w-8` → `h-7 w-7`
- 날짜와 버튼 사이 간격 추가: `gap-2`

**결과**: 날짜와 요일이 완전히 보이고 버튼이 오른쪽에 배치

**관련 파일**: `src/components/Sidebar.tsx`

#### 5. 검색 패널 UI 개선
**변경 사항**:
- 검색창 높이 축소: `h-7` → `h-6` (28px → 24px)
- 글씨 크기 축소: `text-xs` → `text-[11px]` (12px → 11px)
- 필터 버튼 높이 축소: `h-6` → `h-5` (24px → 20px)
- 검색창과 필터 버튼 간격 조정: `space-y-2`
- 중앙 패널과 오른쪽 패널 사이 구분선 추가: `border-r border-border`

**관련 파일**:
- `src/components/RightPanel.tsx`
- `src/App.tsx`

#### 6. 아이콘 최적화
**변경 사항**:
- 위/아래 이동 아이콘: `ChevronUp/Down` → `ArrowUp/Down` (더 두툼한 화살표)
- 모든 아이콘 크기 통일: `h-3 w-3` (12px)
- 선 두께 조정: `strokeWidth={1.2}` (일반), `strokeWidth={1.5}` (화살표)

**관련 파일**: `src/components/Sidebar.tsx`

### 현재 개선 필요 사항
1. **성능 최적화**
   - 대량 페이지 렌더링 최적화
   - 검색 성능 개선
   - 메모리 사용량 최적화

2. **오류 처리**
   - 파일 시스템 오류 처리
   - 네트워크 오류 핸들링
   - 사용자 피드백 개선

---

## 📝 주요 파일 구조

```
Memoji/
├── 📁 src/                          # Frontend 소스
│   ├── App.tsx                      # 메인 애플리케이션 (3단 레이아웃)
│   ├── main.tsx                     # React 진입점
│   ├── index.css                    # 글로벌 스타일
│   │
│   ├── 📁 components/               # React 컴포넌트
│   │   ├── MarkdownEditor.tsx       # 마크다운 에디터
│   │   ├── Sidebar.tsx              # 좌측 사이드바
│   │   ├── RightPanel.tsx           # 우측 검색 패널 ⭐ NEW
│   │   ├── CalendarWidget.tsx       # 달력 위젯
│   │   ├── SearchModal.tsx          # 검색 모달 (기존)
│   │   ├── TopBar.tsx               # 상단 바 (패널 토글 추가)
│   │   ├── TagRenderer.tsx          # 태그 렌더러
│   │   ├── ErrorBoundary.tsx        # 에러 처리
│   │   │
│   │   ├── 📁 calendar/             # 달력 관련
│   │   │   ├── CalendarGrid.tsx
│   │   │   └── CalendarHeader.tsx
│   │   │
│   │   ├── 📁 editor/               # 에디터 관련
│   │   │   ├── EditorTextArea.tsx
│   │   │   ├── EditorToolbar.tsx
│   │   │   └── MarkdownPreview.tsx
│   │   │
│   │   ├── 📁 sidebar/              # 사이드바 관련
│   │   │   ├── PageItem.tsx
│   │   │   └── PageMenu.tsx
│   │   │
│   │   └── 📁 ui/                   # shadcn/ui 컴포넌트
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── calendar.tsx
│   │       └── ... (50+ 컴포넌트)
│   │
│   ├── 📁 contexts/                 # React Context
│   │   ├── ThemeContext.tsx         # 테마 관리
│   │   └── FocusModeContext.tsx     # 포커스 모드
│   │
│   ├── 📁 utils/                    # 유틸리티
│   │   ├── tauriStorage.ts          # Tauri 저장소
│   │   ├── storage.ts               # 브라우저 저장소
│   │   ├── dateUtils.ts             # 날짜 유틸
│   │   ├── searchHighlight.ts       # 검색 하이라이트
│   │   └── environment.ts           # 환경 감지
│   │
│   ├── 📁 types/                    # TypeScript 타입
│   │   └── index.ts
│   │
│   └── 📁 styles/                   # 스타일
│       └── globals.css
│
├── 📁 src-tauri/                    # Tauri Backend (Rust)
│   ├── src/
│   │   ├── main.rs                  # Rust 진입점
│   │   └── lib.rs
│   ├── Cargo.toml                   # Rust 의존성
│   ├── tauri.conf.json              # Tauri 설정
│   └── icons/                       # 앱 아이콘
│
├── 📁 node_modules/                 # Node 의존성
├── package.json                     # Node 설정
├── vite.config.ts                   # Vite 설정
├── tsconfig.json                    # TypeScript 설정
│
└── 📁 문서/
    ├── README.md                    # 프로젝트 소개
    ├── PRD.md                       # 제품 요구사항
    ├── TAURI_DEVELOPMENT_GUIDE.md   # Tauri 개발 가이드
    ├── Attributions.md              # 라이선스 정보
    └── plan.md                      # 이 파일
```

---

## 🔧 기술 스택 상세

### Frontend
| 기술 | 버전 | 용도 |
|------|------|------|
| React | 18.3.1 | UI 프레임워크 |
| TypeScript | 5.0+ | 타입 안전성 |
| Tailwind CSS | v4 | 스타일링 |
| Vite | 6.3.5 | 빌드 도구 |
| shadcn/ui | latest | UI 컴포넌트 |
| Radix UI | latest | 접근성 컴포넌트 |
| Lucide React | 0.487.0 | 아이콘 |

### Desktop
| 기술 | 버전 | 용도 |
|------|------|------|
| Tauri | 2.8.4 | 데스크톱 프레임워크 |
| Rust | 1.70+ | 백엔드 언어 |
| SQLite | - | 로컬 데이터베이스 |

---

## 🎯 다음 단계 (Phase 3)

### 고급 기능 개발 계획

1. **내보내기/가져오기**
   - [ ] Markdown 파일 내보내기
   - [ ] JSON 형식 내보내기
   - [ ] 파일 가져오기 기능
   - [ ] 일괄 내보내기

2. **백업/복원**
   - [ ] 자동 백업 시스템
   - [ ] 수동 백업 기능
   - [ ] 백업 복원 기능
   - [ ] 백업 파일 관리

3. **플러그인 시스템**
   - [ ] 플러그인 아키텍처 설계
   - [ ] 플러그인 API 개발
   - [ ] 샘플 플러그인 제작
   - [ ] 플러그인 마켓플레이스

4. **테마 커스터마이징**
   - [ ] 커스텀 색상 팔레트
   - [ ] 폰트 설정
   - [ ] 레이아웃 커스터마이징
   - [ ] 테마 공유 기능

---

## 📈 성능 목표

### 현재 상태
- ⏱️ 앱 시작 시간: 측정 필요
- 🔍 검색 응답 시간: ~300ms (디바운스)
- 💾 메모리 사용량: 측정 필요
- 📦 실행 파일 크기: 측정 필요

### 목표 지표
- ⏱️ 앱 시작 시간: < 2초
- 🔍 검색 응답 시간: < 100ms
- 💾 메모리 사용량: < 100MB
- 📦 실행 파일 크기: < 50MB

---

## 🐛 알려진 이슈

### 해결 필요
1. Git 저장소 초기화 필요 (현재 `.git` 없음)
2. 성능 측정 및 최적화 필요
3. 에러 처리 강화 필요
4. 테스트 코드 작성 필요

---

## 🚀 배포 준비사항

### 완료 필요 항목
- [ ] Git 저장소 초기화
- [ ] 라이선스 파일 추가
- [ ] CI/CD 파이프라인 구축
- [ ] 릴리스 노트 작성
- [ ] 사용자 문서 완성
- [ ] 테스트 커버리지 확보

### 플랫폼별 빌드
- [ ] Windows (x86_64-pc-windows-msvc)
- [ ] macOS Intel (x86_64-apple-darwin)
- [ ] macOS Apple Silicon (aarch64-apple-darwin)
- [ ] Linux (x86_64-unknown-linux-gnu)

---

## 📚 참고 문서

- **PRD.md**: 제품 요구사항 문서
- **README.md**: 프로젝트 소개 및 사용법
- **TAURI_DEVELOPMENT_GUIDE.md**: Tauri 개발 가이드
- **Attributions.md**: 오픈소스 라이선스 정보

---

## 💡 개발 팁

### 개발 서버 실행
```bash
# 웹 모드 (브라우저)
npm run dev

# 데스크톱 모드 (Tauri)
npm run tauri:dev
```

### 빌드
```bash
# 웹 빌드
npm run build

# 데스크톱 빌드
npm run tauri:build
```

### 주요 키보드 단축키
- `Ctrl+N`: 새 메모
- `Ctrl+K`: 검색
- `Ctrl+S`: 저장
- `Ctrl+Shift+K`: 단축키 도움말

---

*최종 업데이트: 2025-10-02*
*프로젝트 상태: Phase 2 진행 중 - UI/UX 개선 완료*

