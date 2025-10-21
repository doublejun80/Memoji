# Memoji VDI 환경 배포 가이드

## 📦 빌드 완료!

Memoji v1.0.0이 성공적으로 빌드되었습니다.

### 생성된 설치 파일

```
src-tauri/target/release/bundle/
├── msi/Memoji_1.0.0_x64_en-US.msi          (Windows Installer)
└── nsis/Memoji_1.0.0_x64-setup.exe         (NSIS Installer)
```

---

## 🎯 VDI 환경 배포 방법

### **방법 1: 실행 파일만 복사 (권장)**

VDI 환경에서 가장 간단하고 안전한 방법입니다.

#### 1단계: 실행 파일 추출

설치 프로그램을 로컬 PC에서 실행하여 설치한 후, 설치 폴더에서 `Memoji.exe` 파일을 찾습니다.

**기본 설치 경로:**
```
C:\Program Files\Memoji\Memoji.exe
```

#### 2단계: VDI로 복사

`Memoji.exe` 파일을 VDI 환경의 원하는 폴더로 복사합니다.

**예시:**
```
H:\Apps\Memoji\Memoji.exe
```

#### 3단계: 실행

VDI에서 `Memoji.exe`를 더블클릭하여 실행합니다.

**자동으로 생성되는 폴더:**
```
H:\Apps\Memoji\
├── Memoji.exe
└── data\              ← 자동 생성됨
    └── memoji.db      ← 모든 메모 데이터
```

---

### **방법 2: 설치 프로그램 사용**

VDI에서 관리자 권한이 있는 경우 설치 프로그램을 사용할 수 있습니다.

#### MSI 설치 (권장)
```
Memoji_1.0.0_x64_en-US.msi
```
- Windows 표준 설치 프로그램
- 제어판에서 제거 가능
- 자동 업데이트 지원

#### NSIS 설치
```
Memoji_1.0.0_x64-setup.exe
```
- 가벼운 설치 프로그램
- 사용자 정의 설치 경로 선택 가능

---

## ✅ VDI 환경 데이터 안전성

### **Portable 모드 (기본 설정)**

Memoji는 기본적으로 **Portable 모드**로 작동합니다:

```
실행 파일 위치: H:\Apps\Memoji\Memoji.exe
데이터 저장 위치: H:\Apps\Memoji\data\memoji.db
```

### **VDI 야간 정리 작업으로부터 안전**

- ✅ `%APPDATA%` 폴더를 사용하지 않음
- ✅ `%LOCALAPPDATA%` 폴더를 사용하지 않음
- ✅ 임시 폴더를 사용하지 않음
- ✅ 실행 파일과 같은 폴더에 데이터 저장
- ✅ VDI 정리 작업의 영향을 받지 않음

### **데이터 백업 방법**

VDI 환경에서 안전하게 데이터를 백업하려면:

```
H:\Apps\Memoji\data\memoji.db 파일을 복사
```

복원 시:
```
백업한 memoji.db 파일을 H:\Apps\Memoji\data\ 폴더에 붙여넣기
```

---

## 🔧 설정 및 사용법

### **1. 앱 제목 변경**

설정 → 앱 제목에서 원하는 이름으로 변경 가능

### **2. AI 도우미 설정**

설정 → LLM Provider에서 API 키 입력:

**지원하는 Provider:**
- ✅ **OpenAI** (gpt-4o-mini)
- ✅ **Anthropic Claude** (claude-3-5-sonnet)
- ✅ **Google Gemini** (gemini-2.0-flash-exp)
- ✅ **Ollama** (로컬 - API 키 불필요)
- ✅ **LM Studio** (로컬 - API 키 불필요)

**주의:** VDI 환경에서는 네트워크 제한으로 인해 외부 API (OpenAI, Anthropic, Gemini)를 사용하지 못할 수 있습니다.

### **3. 데이터 저장 위치 확인**

설정 → 데이터 저장 위치에서 현재 데이터베이스 경로 확인 가능

---

## 📊 시스템 요구사항

### **최소 사양**
- OS: Windows 10 (64-bit) 이상
- RAM: 4GB
- 디스크: 100MB 여유 공간

### **권장 사양**
- OS: Windows 11 (64-bit)
- RAM: 8GB
- 디스크: 500MB 여유 공간

---

## 🚀 VDI 환경 테스트 체크리스트

### **배포 전 테스트**

- [ ] VDI에 `Memoji.exe` 복사
- [ ] 첫 실행 시 `data` 폴더 자동 생성 확인
- [ ] 메모 작성 및 저장
- [ ] 앱 종료 후 재실행
- [ ] 이전에 작성한 메모가 남아있는지 확인
- [ ] 달력에 메모 작성 날짜 표시 확인
- [ ] 메모 내용이 정상적으로 표시되는지 확인

### **야간 정리 후 테스트**

- [ ] VDI 야간 정리 작업 후 다음날 확인
- [ ] `data` 폴더가 삭제되지 않았는지 확인
- [ ] 메모 데이터가 유지되는지 확인
- [ ] 정상적으로 앱이 실행되는지 확인

---

## ⚠️ 주의사항

### **1. 네트워크 제한**

VDI 환경에서는 외부 네트워크 접근이 제한될 수 있습니다:
- ❌ OpenAI API 사용 불가
- ❌ Anthropic Claude API 사용 불가
- ❌ Google Gemini API 사용 불가
- ✅ 로컬 메모 작성/저장은 정상 작동

### **2. 데이터 백업**

중요한 메모는 정기적으로 백업하세요:
```
H:\Apps\Memoji\data\memoji.db → 안전한 위치로 복사
```

### **3. 실행 파일 위치**

실행 파일을 이동하면 데이터 폴더도 함께 이동해야 합니다:
```
이전: H:\Apps\Memoji\Memoji.exe
      H:\Apps\Memoji\data\memoji.db

이동: H:\NewFolder\Memoji.exe
      H:\NewFolder\data\memoji.db  ← 함께 이동 필요
```

---

## 📞 문제 해결

### **Q: 메모가 사라졌어요**

**A:** 다음을 확인하세요:
1. `data` 폴더가 실행 파일과 같은 위치에 있는지 확인
2. `memoji.db` 파일이 존재하는지 확인
3. 백업 파일이 있다면 복원

### **Q: 앱이 실행되지 않아요**

**A:** 다음을 시도하세요:
1. Windows 10/11 64-bit인지 확인
2. 실행 파일을 다시 복사
3. 관리자 권한으로 실행

### **Q: AI 도우미가 작동하지 않아요**

**A:** VDI 환경에서는 네트워크 제한으로 외부 API 사용이 불가능할 수 있습니다.

---

## 🎉 배포 완료!

Memoji가 VDI 환경에서 안전하게 작동하도록 설정되었습니다.

**핵심 기능:**
- ✅ Portable 모드 (기본)
- ✅ VDI 야간 정리 작업으로부터 안전
- ✅ 간단한 배포 (exe 파일만 복사)
- ✅ 데이터 손실 방지
- ✅ 로컬 메모 작성/저장

**즐거운 메모 작성 되세요! 📝**

