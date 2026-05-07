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
- 🤖 **로컬 AI 어시스턴트**: Rust Candle 기반 Gemma 4 E2B GGUF 로컬 추론과 토큰 스트리밍
- 🔒 **Portable 모드**: VDI 환경에서도 데이터 손실 없음

## 🖥️ VDI 환경 지원

Memoji는 VDI (Virtual Desktop Infrastructure) 환경을 완벽하게 지원합니다.

### 문제 해결
- ✅ 야간 정리 작업으로 인한 데이터 손실 방지
- ✅ Portable 모드로 실행 파일과 함께 데이터 저장
- ✅ 네트워크 드라이브 지원
- ✅ 자동 백업 기능

### 빠른 시작 (VDI 사용자)

1. **Memoji.exe를 네트워크 드라이브에 복사**
   ```
   H:\Memoji\Memoji.exe
   ```

2. **portable.txt 파일 생성**
   ```
   H:\Memoji\portable.txt
   ```

3. **Memoji 실행**
   - 데이터가 `H:\Memoji\data\memoji.db`에 안전하게 저장됩니다

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
- **메모리**: 최소 4GB RAM
- **디스크**: 앱 100MB 이상, 로컬 GGUF 모델 사용 시 4GB 이상 추가 권장
- **네트워크**: 불필요 (완전 오프라인 작동)

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

Memoji의 AI 도우미는 외부 추론 서비스 없이 로컬 리소스의 Gemma 4 E2B GGUF 모델만 사용하도록 설계되었습니다.

### 모델 준비

1. GGUF 모델 파일과 `tokenizer.json`을 `src-tauri/resources/models/`에 둡니다.
2. 기본 모델 파일명은 `gemma-4-e2b-it-q4.gguf`입니다.
3. 다른 위치를 쓰려면 `MEMOJI_GEMMA_GGUF`, `MEMOJI_GEMMA_TOKENIZER` 환경 변수를 설정합니다.
4. 설정 → 로컬 Gemma AI에서 모델 상태와 CPU 가속 상태를 확인합니다.

대형 `.gguf` 파일은 git에 커밋하지 않습니다. 체크섬과 후보 모델 정보는 `src-tauri/resources/models/`의 manifest를 참고하세요.

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
- **Local AI**: Hugging Face Candle + GGUF resources
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
