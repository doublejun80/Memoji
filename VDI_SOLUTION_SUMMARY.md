# Memoji VDI 구현 현황

이 문서는 과거의 “VDI 데이터 손실 문제 해결 완료” 주장을 현재 코드 기준으로 바로잡은
현황 보고서입니다. Memoji는 저장 경로를 제어할 수 있지만, VDI 데이터 보존은 인프라
정책과 운영 절차까지 함께 구성해야 달성됩니다.

## 결론

- 구현됨: 환경 변수로 데이터 경로 지정, 실행 파일 옆 쓰기 가능 경로 사용, OS 로컬
  데이터 폴더 fallback, 설정에서 실제 DB 경로 확인, 수동 내보내기/가져오기.
- 구현되지 않음: `portable.txt`, VDI 자동 감지, 예약/종료 시 자동 백업, 자동 동기화,
  여러 VDI 인스턴스의 DB 동시 공유 보호.
- 기본 AI: 외부 클라우드가 아닌 VDI 내부 LiteRT-LM 루프백 서버. 검증된 bundle이 있으면
  앱이 managed child 시작을 시도하고, 없으면 운영자가 runtime/model을 준비해야 함.

따라서 “실행 파일만 복사하면 데이터가 절대 사라지지 않는다”거나 “VDI에서 완벽하게
안전하다”는 표현은 정확하지 않습니다.

## 현재 데이터 경로 로직

앱 시작 시 아래 순서로 한 경로를 결정하고, 실행 중에는 같은 경로를 사용합니다.

```text
MEMOJI_DATA_PATH
        ↓ 없으면
실행 파일 옆 data 폴더가 쓰기 가능한가?
        ↓ 아니면
OS 로컬 데이터 폴더/Memoji/data
```

Windows의 마지막 경로는 일반적으로 `%LOCALAPPDATA%\Memoji\data`입니다. 비영구
VDI가 `%LOCALAPPDATA%`를 초기화하면 이 fallback 경로의 DB도 사라질 수 있습니다.
앱은 폴더명이나 환경 변수 패턴으로 VDI를 판별하지 않습니다.

### 운영 권장안

```powershell
setx MEMOJI_DATA_PATH "H:\Memoji\data"
```

관리자가 보존하는 사용자 전용 경로를 지정하고, 새 세션에서 설정 → 데이터의 실제
`memoji.db` 경로를 확인합니다. 로그아웃/재접속과 야간 이미지 초기화 후 테스트 메모가
남는지 배포 승인 전에 검증해야 합니다.

## 백업과 이전 기능

현재 설정 화면은 다음 기능을 제공합니다.

- 전체 페이지 ZIP 내보내기: Markdown, manifest와 consistent DB snapshot을 `exports`에 생성.
  app/schema version, count, revision, SHA-256, byte size와 attachment manifest를 기록.
- 기존 DB 가져오기: 현재 DB를 `backups` 폴더에 먼저 백업한 뒤 페이지 병합.
  native path를 Rust가 직접 검증하므로 JS byte array와 과거 32 MB 제한이 없음.
- 데이터 폴더 열기: 현재 앱이 실제 사용하는 폴더를 표시/열기.

주기적 자동 백업과 자동 복원은 없습니다. 전체 DB를 직접 백업할 때는 앱을 완전히
종료한 후 복사하거나 SQLite를 이해하는 관리 도구를 사용해야 합니다.

## 공유 DB 위험

네트워크 드라이브가 영구적이라는 사실만으로 안전한 것은 아닙니다. 같은
`memoji.db`를 여러 VDI가 동시에 열면 SQLite 잠금 동작, 네트워크 지연, 동기화 충돌로
데이터 손상 또는 변경 유실이 발생할 수 있습니다.

- DB는 사용자별로 분리합니다.
- 한 DB에는 한 번에 하나의 Memoji 인스턴스만 접근합니다.
- 이동/복사는 모든 인스턴스를 종료한 상태에서 수행합니다.
- 열린 DB의 실시간 양방향 파일 동기화를 사용하지 않습니다.

## LiteRT-LM 현재 구조

기본 런타임은 `Gemma 4 E2B · LiteRT-LM`이며 다음 루프백 엔드포인트를 사용합니다.

```text
http://127.0.0.1:9379/v1/chat/completions
model: gemma4-e2b
```

Memoji는 `localhost`, `127.0.0.0/8`, `::1`만 허용하고 공용/LAN 주소를 거부합니다.
검증된 `ai` bundle 또는 사용자 registry/runtime을 발견하면 managed child를 시작할 수
있지만, 코어 app 자체가 모델을 포함한다고 가정하지 않습니다.

이미지 준비 단계:

```powershell
uv tool install litert-lm
litert-lm import --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm `
  gemma-4-E2B-it.litertlm gemma4-e2b
```

bundle을 사용하지 않는 사용자 세션 시작 예:

```powershell
litert-lm serve --host 127.0.0.1 --port 9379
```

앱은 `/v1/models`를 짧게 확인해 실제 서버가 응답할 때만 준비 상태로 표시합니다.
모델 레지스트리가 이미지/사용자 환경에 배포된 뒤에는 런타임을 오프라인으로 운영할 수
있습니다.

### VDI 반응 속도 개선 원칙

- 로그인 시 LiteRT-LM을 미리 시작해 첫 사용자 요청 전에 서버를 준비합니다.
- Gemma 4 E2B, 256 토큰으로 시작하고 느린 CPU 세션은 64 토큰을 사용합니다.
- 실제 호스트 풀에서 첫 토큰 지연과 생성 시간을 측정합니다.
- GPU 사용 가능 여부와 드라이버/백엔드는 골든 이미지에서 별도 검증합니다.
- vCPU 과할당, 전원 절약, 느린 네트워크 모델 저장소를 피합니다.
- MTP/speculative decoding은 지원되는 LiteRT-LM 서버 옵션과 모델 조합에서 서버
  측으로 활성화합니다. UI의 draft 메타데이터만으로 가속되지 않습니다.

## 남은 운영 위험

| 위험 | 현재 방어 | 운영자 조치 |
|---|---|---|
| 비영구 `%LOCALAPPDATA%` fallback | 설정에 실제 경로 표시 | `MEMOJI_DATA_PATH` 지정 및 야간 보존 시험 |
| 자동 백업 없음 | 수동 ZIP/DB 가져오기 전 백업 | 조직 백업 일정과 복원 리허설 |
| 공유 DB 동시 접근 | 앱 프로세스 단일 인스턴스 플러그인 | VDI 간 공유 금지, 사용자별 DB |
| LiteRT-LM 서버 미실행 | `/v1/models` 준비 상태 확인 | 로그인 시작 작업과 상태 모니터링 |
| 모델/레지스트리 누락 | 연결 실패 표시 | 이미지에 모델과 사용자 접근 권한 포함 |
| CPU-only VDI 지연 | 응답 길이 선택, 내장 벤치마크 | 64/256 토큰 제한 및 실제 풀 성능 측정 |
| Runtime 인증 부재 | loopback, random session port, capability 표시 | 인증 강제 runtime/격리 구조 없이는 GA 금지 |
| Signed artifact 부재 | CI와 provenance script | certificate 연결 후 EXE/MSI/NSIS/runtime 검증 |

## 배포 완료 기준

- [ ] 설정에 표시된 DB가 사용자 전용 영구 경로임
- [ ] 재실행, 재로그인, 야간 초기화 후 데이터가 유지됨
- [ ] 동일 DB를 여러 VDI가 동시에 열지 않음
- [ ] 백업 파일이 생성되고 실제 복원이 검증됨
- [ ] 사용자 세션에서 LiteRT-LM 모델 레지스트리가 보임
- [ ] `127.0.0.1:9379/v1/models`가 응답하고 앱 상태가 준비됨
- [ ] 대표 VDI 사양에서 허용 가능한 응답 시간이 확인됨
- [ ] runtime 인증, installer/runtime 서명, EDR와 rollback matrix가 통과함

위 조건을 통과한 배포에 한해 해당 조직의 VDI에서 안전하게 운영된다고 판단할 수
있습니다.
