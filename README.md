# 📝 Memoji 2.0 - 로컬 AI Markdown 노트 앱

**Typora식 즉시 렌더링 Markdown + Obsidian식 링크/태그 구조 + Windows VDI 우선 로컬 AI 노트앱**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/yourusername/memoji)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tauri](https://img.shields.io/badge/Tauri-2.0-orange.svg)](https://tauri.app/)

## ✨ 주요 기능

- 📝 **Milkdown 즉시 편집**: Typora처럼 Markdown을 쓰는 즉시 서식으로 렌더링
- 📊 **GFM 표 지원**: Markdown table 저장/복원과 Milkdown table 편집 UI
- 📁 **계층적 구조**: 페이지와 폴더로 체계적인 메모 관리
- 🏷️ **태그/위키링크**: `#tag`, `[[page]]` 기반 지식 구조
- 🗓️ **날짜별 관리**: 달력으로 날짜별 메모 확인
- 🔍 **전체 검색**: 제목/본문/태그 인덱싱 기반 검색
- ⌨️ **키보드 단축키**: 커스터마이징 가능한 단축키
- 🎨 **테마**: 다크/라이트 모드 지원
- 💾 **로컬 저장**: SQLite로 안전한 데이터 저장
- 🤖 **로컬 AI 어시스턴트**: LiteRT-LM 루프백 서버 기반 Gemma 4 E2B 스트리밍(기본)과 선택적 GGUF 런타임
- 💾 **VDI 저장 경로 제어**: `MEMOJI_DATA_PATH`로 영구 저장소를 명시하고 설정에서 실제 경로 확인

## 🖥️ VDI 환경 지원

Memoji는 VDI에서 사용할 수 있지만, 데이터 보존은 VDI 관리 정책과 실제 저장 경로에
달려 있습니다. 앱이 VDI를 자동 감지하거나 데이터를 자동 백업하지는 않습니다.

### 저장 경로 결정 순서

1. `MEMOJI_DATA_PATH` 환경 변수
2. 실행 파일 옆의 쓰기 가능한 `data` 폴더
3. OS 로컬 데이터 폴더(Windows에서는 보통 `%LOCALAPPDATA%\Memoji\data`)

비영구 VDI에서는 1번을 사용해 관리자가 보존하는 사용자 전용 경로를 명시하는 것을
권장합니다. 실행 파일이 `Program Files`처럼 쓰기 불가능한 위치에 있으면 3번으로
물러나므로, 설정 → 데이터에서 실제 `memoji.db` 경로를 반드시 확인하세요.

### 빠른 시작 (VDI 사용자)

1. **관리자가 보존하는 사용자 전용 경로를 정합니다.**
   ```powershell
   setx MEMOJI_DATA_PATH "H:\Memoji\data"
   ```
2. **새 로그인 세션에서 Memoji를 실행합니다.**
3. **설정 → 데이터에서 표시된 DB 경로와 쓰기 권한을 확인합니다.**
4. **테스트 메모를 저장한 뒤 로그아웃/재접속 및 야간 초기화 후 보존 여부를 검증합니다.**

`portable.txt`는 현재 구현에서 사용하지 않습니다. 하나의 `memoji.db`를 여러 VDI
인스턴스가 동시에 열도록 구성하지 마세요. 공유가 필요하면 앱을 종료한 상태에서
관리자가 백업/복원하거나, 설정의 ZIP 내보내기와 DB 가져오기를 사용하세요.

📖 **자세한 가이드**: [VDI_SETUP_GUIDE.md](VDI_SETUP_GUIDE.md)

## 🚀 시작하기

### 개발 환경 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# Tauri 개발 모드
npm run tauri:dev
```

### 프로덕션 빌드

```bash
# 빌드
npm run tauri build

# 결과물
src-tauri/target/release/bundle/msi/Memoji_2.0.0_x64_en-US.msi
```

📖 **자세한 빌드 가이드**: [BUILD_GUIDE.md](BUILD_GUIDE.md)

## 📊 시스템 요구사항

- **OS**: Windows 10/11 (64-bit)
- **메모리**: 앱만 4GB 이상, Gemma 사용 시 8GB 이상 권장
- **디스크**: VDI 오프라인 번들 약 3GB + 첫 실행 최적화 캐시 여유 공간 1GB 이상
- **네트워크**: VDI 오프라인 번들은 실행 시 인터넷 불필요

## 🎯 주요 단축키

| 단축키 | 기능 |
|--------|------|
| `Ctrl+N` | 새 페이지 생성 |
| `Ctrl+K` | 전체 검색 |
| `Ctrl+S` | 저장 |
| `Ctrl+E` | 즉시 편집/Markdown 원문 전환 |
| `Ctrl+B` | 굵게 |
| `Ctrl+I` | 기울임 |
| `F11` | 집중 모드 |
| `Ctrl+Shift+K` | 단축키 설정 |

## 🤖 로컬 AI 기능

기본 AI 런타임은 같은 VDI 안에서 실행하는 LiteRT-LM OpenAI 호환 서버입니다.
Memoji는 공용/LAN 호스트를 거부하고 `localhost`, `127.0.0.0/8`, `::1` 루프백
엔드포인트만 허용합니다. VDI 오프라인 배포본은 LiteRT-LM 실행 환경과 Gemma 4 E2B
모델을 `ai` 폴더에 함께 담고, 앱 시작 시 서버를 자동으로 실행합니다.

### 모델 준비

이미지 준비 PC의 LiteRT 레지스트리에 `gemma4-e2b`가 준비된 상태에서 실행합니다.

```powershell
.\scripts\build-windows-vdi.ps1
```

생성된 `release\memoji-vdi` 폴더 전체를 VDI의 쓰기 가능한 로컬 디스크에 복사합니다.
`Memoji.exe`만 따로 복사하면 AI가 동작하지 않습니다. 빌드 PC에서만 인터넷과 `uv`가
필요하며, 완성된 폴더는 오프라인에서 실행됩니다.

Memoji의 기본 엔드포인트는
`http://127.0.0.1:9379/v1/chat/completions`, 기본 모델 ID는 `gemma4-e2b`입니다.
설정 → 로컬 AI에서 `VDI 오프라인 AI 번들 감지됨`과 서버 연결 성공을 확인할 수 있습니다.
서버가 종료되면 앱이 다시 시작하며, 설정에서도 수동 재시작할 수 있습니다.

선택적 내장 Candle/llama.cpp 경로를 사용할 때만 GGUF 모델과 `tokenizer.json`을
`src-tauri/resources/models/`에 두거나 `MEMOJI_GEMMA_GGUF`,
`MEMOJI_GEMMA_TOKENIZER`를 설정합니다. 대형 모델 파일은 git에 커밋하지 않습니다.

VDI 응답성을 위해 기본 응답 길이(256 토큰)를 먼저 사용하고, 느린 CPU 세션에서는
64 토큰으로 낮추세요. 첫 실행에서는 LiteRT-LM이 CPU 최적화 캐시를 만들 수 있으므로
첫 답변만 이후 답변보다 오래 걸릴 수 있습니다.

## 📁 프로젝트 구조

```
Memoji/
├── src/                    # React 프론트엔드
│   ├── components/         # UI 컴포넌트
│   ├── utils/              # 유틸리티 함수
│   └── types/              # TypeScript 타입
├── src-tauri/              # Tauri 백엔드
│   ├── src/
│   │   ├── main.rs         # 메인 엔트리
│   │   ├── lib.rs          # 앱 로직
│   │   └── database.rs     # SQLite 데이터베이스
│   └── Cargo.toml          # Rust 의존성
└── BUILD_GUIDE.md          # 빌드 가이드
```

## 🔧 기술 스택

- **Frontend**: React 18 + TypeScript + Tailwind CSS v4
- **Editor**: Milkdown Crepe + ProseMirror/Remark + GFM tables
- **Desktop**: Tauri v2 (Rust)
- **Database**: SQLite
- **Local AI**: LiteRT-LM loopback server (default) + optional Candle/GGUF resources
- **UI Library**: shadcn/ui + Radix UI
- **Build Tool**: Vite

## 📝 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

## 🤝 기여

기여는 언제나 환영합니다!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📧 지원

문제가 발생하면 [GitHub Issues](https://github.com/yourusername/memoji/issues)에 보고해주세요.

## 🙏 감사의 말

- [Tauri](https://tauri.app/) - 크로스 플랫폼 데스크톱 앱 프레임워크
- [shadcn/ui](https://ui.shadcn.com/) - 아름다운 UI 컴포넌트
- [Lucide](https://lucide.dev/) - 아이콘 라이브러리

---

**Made with ❤️ for VDI users**
