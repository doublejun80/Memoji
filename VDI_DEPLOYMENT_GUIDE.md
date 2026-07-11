# Memoji VDI 배포 가이드

이 문서는 현재 Memoji 2.0 구현을 기준으로 한 운영자용 가이드입니다. Memoji가 VDI를
자동 감지하거나 데이터 보존을 보장하지는 않습니다. 배포 전에 VDI의 프로필 초기화,
드라이브 보존, 파일 잠금, 실행 정책을 관리자가 확인해야 합니다.

## 1. 앱 배포

Gemma까지 포함한 VDI 오프라인 폴더는 Windows 이미지 준비 PC에서 만듭니다.

```powershell
npm ci
.\scripts\build-windows-vdi.ps1
```

`release\memoji-vdi` 전체를 골든 이미지의 쓰기 가능한 로컬 경로에 복사합니다. 모델이
2GB를 넘으므로 일반 MSI/NSIS 안에 넣지 않고 portable 폴더로 배포합니다. `Memoji.exe`
한 파일만 복사하면 AI 런타임과 Gemma가 누락됩니다. WebView2와 실행 정책도 대상
이미지에서 확인하세요.

Gemma 4는 Apache 2.0 라이선스 모델입니다. 배포 폴더의 `ai\NOTICE.txt`를 모델과 함께
유지하고 조직의 오픈소스 고지 절차에도 반영하세요.

## 2. 영구 저장소 지정

Memoji는 시작할 때 데이터 폴더를 한 번 결정하고 해당 위치의 `memoji.db`를 사용합니다.

1. `MEMOJI_DATA_PATH` 환경 변수
2. 실행 파일 옆의 쓰기 가능한 `data` 폴더
3. OS 로컬 데이터 폴더(Windows에서는 보통 `%LOCALAPPDATA%\Memoji\data`)

`portable.txt`와 VDI 자동 감지는 현재 구현에 없습니다. `Program Files` 같은 설치 위치는
일반 사용자가 쓸 수 없으므로 3번 경로로 전환될 수 있습니다. 비영구 VDI에서는 배포
정책으로 사용자 전용 영구 경로를 명시하세요.

```powershell
setx MEMOJI_DATA_PATH "H:\Memoji\data"
```

`setx`의 값은 새 프로세스/로그인 세션부터 적용됩니다. 실제 배포에서는 GPO, 프로필
관리 도구, 애플리케이션 런처 등 조직 표준 방식으로 설정해도 됩니다.

배포 후 설정 → 데이터에서 표시되는 `memoji.db` 경로가 기대한 경로인지 확인합니다.
테스트 메모를 저장하고 앱을 다시 연 다음, 로그아웃/재접속 및 야간 이미지 초기화 후에도
메모가 남는지 검증해야 합니다.

### 공유 저장소 주의사항

- 하나의 DB를 여러 VDI 또는 여러 Memoji 프로세스에서 동시에 열지 마세요.
- 네트워크 드라이브를 쓸 때는 SQLite 파일 잠금과 지연 특성이 지원되는지 검증하세요.
- 여러 장치 간 공유가 필요하면 앱을 모두 종료한 뒤 관리자 절차로 DB를 복사하거나,
  설정의 전체 페이지 ZIP 내보내기와 DB 가져오기를 사용하세요.
- 동기화 클라이언트가 열린 DB를 실시간으로 양방향 동기화하도록 구성하지 마세요.

## 3. LiteRT-LM 준비

기본 로컬 AI는 앱과 같은 VDI 안에서 별도 프로세스로 실행되는 LiteRT-LM 서버입니다.
오프라인 배포본에는 플랫폼별 Python/LiteRT 런타임과 Gemma 모델이 모두 포함되며,
Memoji가 실행 시 서버를 자동으로 시작하고 종료 시 함께 정리합니다.

빌드 PC에서만 모델을 LiteRT-LM 레지스트리에 한 번 가져옵니다.

```powershell
uv tool install litert-lm
litert-lm import --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm `
  gemma-4-E2B-it.litertlm gemma4-e2b
```

그다음 `.\scripts\build-windows-vdi.ps1`을 실행하면 등록된 모델이 배포 폴더의
`ai\registry\models\gemma4-e2b\model.litertlm`으로 복사됩니다. 대상 VDI에서는 uv,
Python, Hugging Face 연결이 필요하지 않습니다.

기본 연결 값은 다음과 같습니다.

```text
Endpoint: http://127.0.0.1:9379/v1/chat/completions
Model: gemma4-e2b
```

Memoji는 보안상 `localhost`, `127.0.0.0/8`, `::1`만 허용합니다. 설정 → 로컬 AI에서
오프라인 번들 감지와 `GET /v1/models` 성공을 확인합니다. 서버가 비정상 종료되면 다음
상태 확인 시 자동 재시작하며, 설정의 `내장 Gemma 서버 시작` 버튼으로도 복구할 수 있습니다.

### VDI 응답성 권장값

- 세션 로그인 시 Memoji를 미리 실행해 LiteRT-LM 준비 시간을 사용자 작업 전에 소진합니다.
- 먼저 Gemma 4 E2B와 256 토큰 기본값을 사용하고, CPU가 느린 풀에서는 64 토큰으로 낮춥니다.
- 가능한 경우 VDI가 제공하는 GPU 가속을 사용하되, 실제 호스트 풀에서 TTFT와 생성 속도를 측정합니다.
- CPU-only 풀에서는 vCPU 과할당과 전원 절약 정책을 줄이고 추론 프로세스에 안정적인 CPU를 확보합니다.
- `memoji-vdi` 폴더는 느린 네트워크 홈이 아닌 VDI 로컬 디스크에 배치합니다.
- 최초 CPU 캐시 생성을 위해 `ai\registry`에 쓰기 권한과 약 1GB의 여유 공간을 둡니다.
- speculative decoding/MTP는 LiteRT-LM 서버가 지원하는 모델·백엔드에서 서버 측으로 켭니다.
  설정의 draft 문자열만 입력해도 MTP가 활성화되는 것은 아닙니다.

## 4. 백업과 복원

Memoji에는 주기적 자동 백업이 없습니다.

- 전체 DB 백업: Memoji를 완전히 종료한 뒤 `memoji.db`를 복사합니다.
- 콘텐츠 백업: 설정 → 데이터 → 전체 페이지 ZIP 내보내기를 사용합니다. ZIP은 페이지
  콘텐츠용이며 앱 설정을 포함한 전체 DB 복제본이 아닙니다.
- DB 가져오기: 현재 DB를 `backups` 폴더에 먼저 백업한 뒤 페이지를 병합합니다.
  가져오기 UI는 메모리 사용을 제한하기 위해 32MB 이하 DB만 허용합니다.
- 더 큰 DB는 앱을 종료한 상태에서 관리자가 검증된 SQLite 백업/복원 절차를 사용하세요.

복원 전 원본 DB를 별도 보관하고, 복원 후 페이지 수와 최근 변경 내용을 점검합니다.

## 5. 배포 검증 체크리스트

- [ ] MSI/NSIS 및 WebView2 요구사항을 골든 이미지에서 확인
- [ ] `MEMOJI_DATA_PATH`가 사용자 전용 영구 경로를 가리키는지 확인
- [ ] 설정 화면에 표시된 실제 DB 경로 확인
- [ ] 저장 → 앱 종료 → 재실행 후 메모 유지 확인
- [ ] 로그아웃/재접속 및 야간 초기화 후 데이터 유지 확인
- [ ] 동일 DB를 여러 세션이 동시에 열지 않는지 확인
- [ ] LiteRT-LM 모델 레지스트리가 실제 사용자 세션에 보이는지 확인
- [ ] `127.0.0.1:9379/v1/models`와 설정의 서버 연결 확인 성공
- [ ] 대표 VDI 사양에서 첫 토큰 지연과 64/256 토큰 응답 시간 측정
- [ ] 조직 백업 정책과 복원 리허설 완료

## 문제 해결

### 메모가 다음 로그인에서 보이지 않음

설정 → 데이터의 경로를 기록하고 해당 폴더가 VDI 프로필 보존 대상인지 확인합니다.
`%LOCALAPPDATA%\Memoji\data`로 전환되었다면 실행 파일 옆 폴더가 쓰기 불가능했던
것입니다. `MEMOJI_DATA_PATH`를 영구 경로로 지정한 뒤, 기존 DB는 앱을 종료한 상태에서
관리자 절차로 옮깁니다.

### AI 서버 연결 실패

같은 사용자 세션에서 LiteRT-LM 프로세스가 실행 중인지, 모델이 등록되어 있는지,
`http://127.0.0.1:9379/v1/models`가 성공하는지 확인합니다. 방화벽/EDR이 루프백을
차단하지 않는지도 확인하세요. 외부 서버 URL로 우회하는 방식은 지원되지 않습니다.
