# Memoji 2.0 GA UI Prototype

## 파일

1. `current-layout.html`  
   현재 `main` 코드의 화면 구조를 기준으로 재구성한 정적 화면이다.

2. `memoji-ga-shell.html`  
   기존 3단 레이아웃을 유지한 목표 화면이다.

3. `screenshots/`  
   1200×800, 1440×900 기준 렌더링 결과가 들어간다.

## 실행

브라우저에서 HTML 파일을 직접 연다. 외부 CDN, 웹폰트, 네트워크 호출을 사용하지 않는다.

```powershell
start .\prototype\memoji-ga-shell.html
```

목표 프로토타입에서 사용할 수 있는 기능:

- 좌측·우측 패널 접기
- Context Hub 탭 전환
- 좌측 업무 보기 전환
- `Ctrl+K` 통합 검색·명령창
- 라이트·다크 테마 전환

이 파일은 시각적 기준이며 프로덕션 코드는 아니다. 실제 구현은 `docs/memoji-ga/02_UIUX_TARGET_SPEC.md`와 구현계획을 따른다.
