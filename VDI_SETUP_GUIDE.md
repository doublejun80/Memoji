# Memoji VDI 사용 가이드

Memoji는 VDI에서 로컬 SQLite DB와 로컬 AI 서버를 사용할 수 있습니다. 다만 VDI의
야간 초기화로부터 데이터를 자동 보호하거나 자동 백업하지는 않습니다. 첫 사용 전에
실제 저장 경로가 조직의 영구 저장 영역인지 확인하세요.

## 빠른 시작

### 1. 데이터 경로 지정

관리자가 안내한 사용자 전용 영구 폴더를 `MEMOJI_DATA_PATH`로 지정합니다.

```powershell
setx MEMOJI_DATA_PATH "H:\Memoji\data"
```

새 로그인 세션에서 적용됩니다. `H:`는 예시이며 조직이 보존을 보장하는 경로로
바꿔야 합니다. `portable.txt`를 만드는 방법은 현재 버전에서 동작하지 않습니다.

### 2. Memoji 실행과 경로 확인

Memoji를 실행한 뒤 설정 → 데이터에서 다음을 확인합니다.

- 표시된 경로가 예상한 `...\memoji.db`인지
- 해당 폴더에 쓰기 권한이 있는지
- 테스트 메모 저장 후 앱을 다시 열어도 내용이 남는지
- 로그아웃/재접속과 야간 초기화 뒤에도 내용이 남는지

환경 변수가 없으면 앱은 실행 파일 옆의 쓰기 가능한 `data` 폴더를 사용합니다. 그곳에
쓸 수 없으면 Windows에서는 보통 `%LOCALAPPDATA%\Memoji\data`로 전환됩니다. 이
폴더가 비영구 프로필이면 다음 로그인에서 삭제될 수 있습니다.

## 로컬 AI 사용

기본 AI는 같은 VDI 세션의 LiteRT-LM 서버에 연결합니다. 앱이 서버를 자동 설치하거나
시작하지 않으므로, 관리자가 이미지 준비 단계에서 모델을 가져와야 합니다.

```powershell
# 이미지 준비 단계에서 한 번 수행
uv tool install litert-lm
litert-lm import --from-huggingface-repo=litert-community/gemma-4-E2B-it-litert-lm `
  gemma-4-E2B-it.litertlm gemma4-e2b

# 각 사용자 세션에서 Memoji보다 먼저 실행
litert-lm serve --host 127.0.0.1 --port 9379
```

기본 엔드포인트는 `http://127.0.0.1:9379/v1/chat/completions`, 모델 ID는
`gemma4-e2b`입니다. 설정 → 로컬 AI의 연결 상태가 성공해야 사용할 수 있습니다.
가져온 모델과 레지스트리가 사용자 세션에 함께 배포되어 있다면 실행 중 인터넷은
필요하지 않습니다.

### 느린 VDI에서

1. 로그인할 때 LiteRT-LM을 미리 시작합니다.
2. 먼저 256 토큰으로 사용하고, 긴 대화가 느리면 64 토큰을 선택합니다.
3. 불필요하게 긴 페이지 전체를 프롬프트로 보내지 않습니다.
4. 실제 VDI에서 첫 응답 지연과 생성 시간을 측정합니다.
5. GPU가 제공되는 풀은 LiteRT-LM의 지원 백엔드로 별도 검증합니다.

MTP/speculative decoding은 서버 프로세스가 지원하는 모델과 옵션에서 서버 측으로
활성화해야 합니다. Memoji 설정의 draft 문자열만으로 가속이 켜지지는 않습니다.

## 백업

Memoji에는 예약 또는 종료 시 자동 백업 기능이 없습니다.

### 페이지 콘텐츠 내보내기

설정 → 데이터 → 전체 페이지 ZIP 내보내기를 사용합니다. ZIP은 Markdown 페이지와
manifest를 담으며, 앱 설정을 포함한 완전한 DB 백업은 아닙니다.

### 전체 DB 백업

1. Memoji를 완전히 종료합니다.
2. 설정에서 확인한 데이터 폴더의 `memoji.db`를 백업 위치에 복사합니다.
3. 날짜가 포함된 이름으로 보관하고 주기적으로 복원 테스트를 합니다.

```powershell
$source = "H:\Memoji\data\memoji.db"
$backupDir = "H:\Memoji\backup"

if (Get-Process Memoji -ErrorAction SilentlyContinue) {
  throw "Memoji를 종료한 뒤 백업하세요."
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $source (Join-Path $backupDir "memoji-$stamp.db")
```

복원할 때도 앱을 종료하고 현재 DB를 별도 보관한 뒤 교체합니다. 설정의 기존 DB
가져오기는 페이지를 병합하고 가져오기 전 백업을 만들지만, 32MB 이하 DB만 지원합니다.

## 여러 VDI에서 같은 데이터 사용

하나의 `memoji.db`를 여러 세션이 동시에 열도록 구성하지 마세요. SQLite 네트워크 파일
잠금과 동기화 충돌로 손상되거나 변경이 유실될 수 있습니다.

안전한 운영 방식은 다음 중 하나입니다.

- 사용자마다 별도의 DB를 사용합니다.
- 한 번에 한 인스턴스만 사용하고, 모두 종료한 상태에서 관리자 절차로 DB를 이동합니다.
- 페이지 ZIP 내보내기와 DB 가져오기로 명시적으로 이전합니다.

열린 DB를 OneDrive류 동기화 도구나 자체 복사 스크립트로 양방향 동기화하지 마세요.

## 문제 해결

### 다음 날 메모가 사라짐

1. 설정 → 데이터의 실제 경로를 확인합니다.
2. 해당 경로가 VDI 보존 대상인지 관리자에게 확인합니다.
3. `%LOCALAPPDATA%`라면 실행 파일 옆 폴더가 쓰기 불가능해 fallback된 것입니다.
4. `MEMOJI_DATA_PATH`를 영구 경로로 지정하고 기존 DB는 앱 종료 후 옮깁니다.

### AI가 준비되지 않음

1. 같은 세션에서 `litert-lm serve --host 127.0.0.1 --port 9379`가 실행 중인지 확인합니다.
2. 브라우저나 운영 도구로 `http://127.0.0.1:9379/v1/models` 응답을 확인합니다.
3. 모델 레지스트리에 `gemma4-e2b`가 등록되어 있는지 확인합니다.
4. 방화벽/EDR의 루프백 차단 여부를 확인합니다.

### 네트워크 저장소에서 느림

DB를 열린 채로 로컬과 네트워크 간 복제하지 마세요. 관리자가 제공하는 영구 로컬
프로필/컨테이너를 우선 사용하고, 네트워크 저장소를 써야 한다면 단일 인스턴스와 SQLite
파일 잠금 지원을 먼저 검증합니다.

## 사용자 체크리스트

- [ ] 설정에 표시된 DB 경로가 영구 저장 대상임
- [ ] 앱 재실행 후 테스트 메모가 유지됨
- [ ] 야간 초기화 후 테스트 메모가 유지됨
- [ ] 동일 DB를 다른 VDI에서 동시에 열지 않음
- [ ] 별도 백업 일정과 복원 절차가 있음
- [ ] LiteRT-LM 서버 연결 상태가 성공임
- [ ] 느린 VDI에서는 응답 길이를 64/256 토큰으로 제한함
