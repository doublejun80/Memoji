# 릴리스 빌드 가이드

## 🚀 자동 빌드 시스템

GitHub Actions를 사용하여 Windows, macOS, Linux 모든 플랫폼의 설치 파일을 자동으로 빌드합니다.

---

## 📋 릴리스 방법

### 방법 1: 태그로 릴리스 (권장)

1. **버전 태그 생성 및 푸시**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **자동 빌드 시작**
   - GitHub Actions가 자동으로 실행됩니다
   - 약 10-15분 소요

3. **GitHub Releases 확인**
   - https://github.com/[사용자명]/[저장소명]/releases
   - Draft 상태로 릴리스가 생성됩니다
   - 다음 파일들이 자동으로 업로드됩니다:
     - **Windows**: `Memoji_1.0.0_x64_en-US.msi`, `Memoji_1.0.0_x64-setup.exe`
     - **macOS**: `Memoji_1.0.0_universal.dmg` (Intel + Apple Silicon)
     - **Linux**: `memoji_1.0.0_amd64.deb`, `memoji_1.0.0_amd64.AppImage`

4. **릴리스 노트 작성 및 게시**
   - Draft 릴리스를 열어서 변경사항 작성
   - "Publish release" 클릭

### 방법 2: 수동 실행

1. **GitHub 저장소 > Actions 탭**
2. **"Release Build" 워크플로우 선택**
3. **"Run workflow" 클릭**
4. **브랜치 선택 후 실행**

---

## 🔧 버전 업데이트 방법

릴리스 전에 버전을 업데이트해야 합니다:

### 1. package.json
```json
{
  "version": "1.0.0"  // 여기 수정
}
```

### 2. src-tauri/Cargo.toml
```toml
[package]
version = "1.0.0"  # 여기 수정
```

### 3. src-tauri/tauri.conf.json
```json
{
  "version": "1.0.0"  // 여기 수정
}
```

**팁**: 세 파일의 버전을 동일하게 유지하세요!

---

## 📦 생성되는 파일

### Windows
- `Memoji_[버전]_x64_en-US.msi` - Windows Installer (권장)
- `Memoji_[버전]_x64-setup.exe` - NSIS Installer

### macOS
- `Memoji_[버전]_universal.dmg` - Universal Binary (Intel + Apple Silicon)
- `Memoji.app` - 애플리케이션 번들

### Linux
- `memoji_[버전]_amd64.deb` - Debian/Ubuntu 패키지
- `memoji_[버전]_amd64.AppImage` - Portable 실행 파일

---

## ⚠️ 주의사항

### 1. 태그 이름 규칙
- 반드시 `v`로 시작해야 합니다: `v1.0.0`, `v2.1.3`
- 잘못된 예: `1.0.0`, `version-1.0.0`

### 2. 빌드 실패 시
- GitHub Actions 탭에서 로그 확인
- 주로 발생하는 문제:
  - 버전 불일치
  - 의존성 설치 실패
  - Rust 컴파일 오류

### 3. macOS 서명 (선택사항)
- 현재는 서명 없이 빌드됩니다
- 사용자가 "확인되지 않은 개발자" 경고를 볼 수 있습니다
- Apple Developer 계정이 있다면 서명 추가 가능

---

## 🎯 빠른 릴리스 체크리스트

- [ ] 모든 변경사항 커밋
- [ ] 버전 업데이트 (package.json, Cargo.toml, tauri.conf.json)
- [ ] 태그 생성 및 푸시: `git tag v1.0.0 && git push origin v1.0.0`
- [ ] GitHub Actions 빌드 완료 대기 (10-15분)
- [ ] GitHub Releases에서 Draft 확인
- [ ] 릴리스 노트 작성
- [ ] "Publish release" 클릭

---

## 💡 팁

### 로컬에서 테스트 빌드
릴리스 전에 로컬에서 빌드 테스트:
```bash
npm run tauri:build
```

### 태그 삭제 (실수한 경우)
```bash
# 로컬 태그 삭제
git tag -d v1.0.0

# 원격 태그 삭제
git push origin :refs/tags/v1.0.0
```

### 버전 자동 업데이트 스크립트
추후 버전 업데이트를 자동화하는 스크립트를 추가할 수 있습니다.

---

## 📞 문제 해결

빌드 실패 시:
1. GitHub Actions 로그 확인
2. 로컬에서 `npm run tauri:build` 테스트
3. 버전 번호 일치 확인
4. 의존성 설치 확인: `npm install`

---

**이제 `git tag v1.0.0 && git push origin v1.0.0` 명령어만 실행하면 모든 플랫폼의 설치 파일이 자동으로 빌드됩니다!** 🚀

