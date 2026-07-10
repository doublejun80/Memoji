# Memoji 전체 코드·UI/UX 리뷰 보고서

- 검토일: 2026-07-10
- 대상: React/Vite 프런트엔드, Tauri/Rust 백엔드, SQLite 저장, 로컬 AI, VDI 문서
- 작업 브랜치: `codex/review-settings-vdi-performance`

## 결론

기존 설정 화면은 좋은 UI/UX라고 보기 어려웠다. 설정용 Tailwind 클래스가 실제 빌드에
포함되지 않아 의도한 폭과 그리드가 적용되지 않았고, 512px 폭의 긴 단일 목록 안에서
즉시 저장·전역 저장·별도 런타임 저장이 섞여 있었다. 서버가 없는 기본 AI도 준비된
것처럼 보였으며, 구현에 연결되지 않은 플러그인 토글도 노출됐다.

현재 설정은 compact desktop UI를 기준으로 다음 구조로 개편했다.

- 좌측 분류: 일반, 편집기, 로컬 AI, 데이터
- 우측 상세: 한 번에 한 작업만 노출
- 고정 헤더·푸터와 본문 스크롤
- 일반 설정은 항목별 저장/즉시 적용, AI 런타임은 명시적 적용
- endpoint와 CPU 진단은 고급 정보로 접기
- 서버 설정 여부와 실제 서버·모델 준비 상태를 분리
- 데이터 경로, 가져오기, ZIP 내보내기를 별도 안전 작업으로 분리

시각 방향은 shadcn/UI의 compact monochrome 밀도와 Desktop.fm의 OS형 컨트롤을
기본으로 삼고, Tailscale식 기술 상태 표시를 의미가 있는 상태에만 사용했다. 기존의
밝은 회색 데스크톱 톤, 작은 시스템 글꼴, 얇은 경계선은 유지했다.

## 해결한 주요 위험

### 데이터 무결성

- 자동 저장을 직렬 queue로 바꿔 느린 저장이 최신 내용을 덮지 않게 했다.
- 저장 중 새 입력이 생기면 dirty 상태가 사라질 때까지 flush를 반복한다.
- 페이지 이동, 날짜 이동, 삭제, 내보내기, 설정 열기, 앱 닫기 전에 저장을 기다린다.
- 모든 창 닫기 요청을 먼저 막고, 마지막 저장이 성공한 뒤에만 창을 파기한다.
- 폴더 삭제와 사이드바 트리는 순환 parent 데이터에서 무한 재귀하지 않도록 보호했다.
- localStorage 마이그레이션은 일부 실패 후에도 기존 ID를 건너뛰며 재개한다.
- 시작 시 선택한 데이터 디렉터리를 AppState에 고정해 열린 DB와 백업 경로가 갈라지지
  않게 했다.
- JSON IPC 메모리 증폭이 있는 DB 가져오기는 임시로 32MB까지 제한했다.

### 보안·안정성

- Windows 원격 IPC 취약 범위의 Tauri 2.8.5를 2.11.5로 올렸다.
- Vite, DOMPurify를 포함한 npm 의존성을 갱신해 `npm audit` 0건을 확인했다.
- 앱 root에 ErrorBoundary를 연결했다.
- 로컬 AI endpoint는 기존처럼 loopback 주소만 허용한다.
- 한국어 문서 언어와 Dialog 접근성 이름, 입력 label, live status를 정리했다.
- 한국어 IME 조합 중 Enter가 AI 전송이나 앱 이름 저장으로 오인되지 않게 했다.

### 로컬 AI와 VDI 반응성

- LiteRT-LM 기본 endpoint를 공식 기본 포트인 `127.0.0.1:9379`로 통일했다.
- `/v1/models`를 1.5초 안에 확인하고 설정한 모델 ID가 실제 목록에 있어야 준비로
  표시한다.
- HTTP client와 연결 pool을 재사용하고 connect timeout, TCP_NODELAY, redirect 차단을
  적용했다.
- SSE를 byte buffer로 처리해 분할된 한국어 UTF-8과 마지막 줄을 안전하게 복원한다.
- 완료 marker 없이 끊긴 stream은 부분 성공으로 처리하지 않는다.
- 첫 조각부터 즉시 Tauri event로 보내고, React 갱신만 animation frame 단위로 합쳐
  표시 지연 없이 렌더 부하를 제한했다.
- 기본 답변 상한을 256으로 낮추고 64/256/512 preset을 제공한다.
- 동시 내장 모델 load를 거부해 VDI에서 같은 대형 모델을 중복 할당하지 않게 했다.

## 남은 제한과 후속 권장

- DB 가져오기는 아직 byte 배열을 JSON IPC로 전달한다. 대형 DB 지원이 필요하면 Tauri
  파일 dialog가 선택한 경로를 Rust가 직접 읽는 방식으로 바꿔야 한다.
- 내장 Candle 실모델 테스트 2개는 대형 GGUF/토크나이저가 저장소에 없어 ignored다.
- LiteRT-LM과 모델은 앱에 번들되지 않는다. golden image 준비 단계에서 모델을 import하고
  로그인 시 서버를 먼저 실행해야 한다.
- 하나의 SQLite 파일을 여러 VDI/장치에서 동시에 열어 쓰는 방식은 지원하지 않는다.
- Windows non-persistent VDI의 프로필·EDR·GPU 노출은 실제 pool에서 별도 검증해야 한다.
- Milkdown을 포함한 주 JS chunk가 약 1.96MB다. 초기 실행 속도가 중요하면 편집기를
  route/component 단위로 lazy-load하는 후속 작업이 필요하다.

## 검증 기준

- TypeScript type-check
- 프런트 단위 테스트 3개
- production build
- Rust 전체 테스트 41개 중 39개 통과, 실모델 2개 ignored, rustfmt/clippy 통과
- npm 취약점 감사
- 1280×720 밝은·어두운 테마에서 설정 일반/로컬 AI/데이터 화면 캡처 확인
- 최소 창 크기와 설정 본문 스크롤 CSS 확인
- `git diff --check`

Windows VDI에서는 다음을 추가로 확인해야 한다.

1. 영구 `MEMOJI_DATA_PATH`에서 재로그인 후 데이터 유지
2. LiteRT-LM 사전 실행과 `/v1/models`의 `gemma4-e2b` 노출
3. 64/256/512 토큰별 TTFT와 전체 응답 시간
4. 앱 종료 직전 입력, 페이지 삭제, DB 가져오기/ZIP 내보내기 복구 시나리오
