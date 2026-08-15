# 11. 수용 테스트

형식:

```text
Given
When
Then
```

## 1. Layout

### AT-UI-001 기본 3단 화면

Given 1200×800  
When 앱을 실행  
Then Left 220px 이상, Right 288px 이상, Center 560px 이상이며 세 영역이 동시에 보인다.

### AT-UI-002 Right Overlay

Given 1024×768  
When Right Panel을 연다  
Then Right가 Center 폭을 강제로 줄이지 않고 Overlay로 열린다.

### AT-UI-003 Dual Overlay

Given 800×600  
When Left와 Right를 연다  
Then 각 Panel이 Overlay로 열리고 Escape로 닫힌다.

### AT-UI-004 Panel Restore

Given Left 280px, Right 340px로 조절  
When 앱 재실행  
Then 같은 Device에서 폭이 복원된다.

### AT-UI-005 Focus

Given Editor Open  
When F11  
Then Top/Left/Right가 숨고 Selection AI를 사용할 수 있다.

## 2. Command

### AT-CMD-001 Ctrl+K

Given 어느 View  
When Ctrl+K  
Then Command Palette가 열리고 Input에 Focus된다.

### AT-CMD-002 Search

Given 10,000 Page Index  
When `구매AX` 입력  
Then p95 150ms 이내에 결과가 보인다.

### AT-CMD-003 Command

Given Palette  
When `현재 문서 요약` 선택  
Then Right AI Tab이 열리고 Summary Action이 시작된다.

### AT-CMD-004 Keyboard

Given Palette 결과  
When ArrowDown/Up, Enter, Escape  
Then 선택·실행·닫기가 Mouse 없이 된다.

## 3. Save

### AT-SAVE-001 Autosave

Given Page에 문장 입력  
When Debounce 경과  
Then `저장됨` 표시와 새 Revision이 생성된다.

### AT-SAVE-002 Page Navigation Flush

Given 저장되지 않은 입력  
When 다른 Page 선택  
Then 입력이 먼저 저장되고 대상 Page가 열린다.

### AT-SAVE-003 Failed Flush

Given DB가 Read-only로 변경  
When 다른 Page 선택  
Then 이동하지 않고 저장 실패를 표시한다.

### AT-SAVE-004 Close

Given 마지막 입력 직후 Window Close  
When App 재실행  
Then 마지막 입력이 남아 있다.

### AT-SAVE-005 Conflict

Given Revision 10을 편집 중이고 다른 변경으로 Revision 11  
When Revision 10 기반 저장  
Then 덮어쓰지 않고 Conflict를 반환한다.

## 4. Search/Index

### AT-SEARCH-001 FTS

Given Title, Body, Tag에 같은 단어  
When Search  
Then Field, Snippet, Score가 구분된다.

### AT-SEARCH-002 Code Block

Given Code Block 안에 `#not-a-tag`  
When Tag Index  
Then Tag로 등록되지 않는다.

### AT-SEARCH-003 Wiki Link

Given `[[Deal Support Agent]]`  
When Index  
Then Outgoing Link와 Target Incoming Link가 생성된다.

### AT-SEARCH-004 Unresolved

Given 없는 Page Link  
When Index  
Then Unresolved Link에 보인다.

### AT-SEARCH-005 Reindex

Given Derived Index 삭제  
When Workspace Reindex  
Then Page 원문에서 Tag, Link, Task, FTS가 복구된다.

## 5. Task

### AT-TASK-001 Parse

Given `- [ ] 자료 준비`  
When Index  
Then Pending Task가 생성된다.

### AT-TASK-002 Complete in Task View

Given Pending Task  
When Task View에서 완료  
Then Markdown이 `[x]`로 바뀌고 Revision이 생성된다.

### AT-TASK-003 Duplicate Text

Given 같은 Task 문장 2개  
When 두 번째 Task 완료  
Then Stable Marker 기준으로 두 번째만 변경된다.

### AT-TASK-004 Due

Given `@due(2026-08-20)`  
When Task Index  
Then Upcoming과 Calendar에 표시된다.

### AT-TASK-005 Source

Given Task View  
When Source Click  
Then Page와 Task Anchor로 이동한다.

## 6. Calendar

### AT-CAL-001 Views

Given Event와 Due Task  
When Month/Week/Day 전환  
Then 같은 Data가 각 Layout에 표시된다.

### AT-CAL-002 Page Link

Given Meeting Event가 Page에 연결  
When Event Open  
Then 연결 Page를 열 수 있다.

### AT-CAL-003 Offline ICS

Given ICS File  
When Import  
Then 외부 Network 없이 Event가 생성된다.

## 7. Context Hub

### AT-HUB-001 Full AI

Given AI Tab  
When Search를 사용하지 않음  
Then AI가 Right Panel 전체 Content 높이를 사용한다.

### AT-HUB-002 Outline

Given H1/H2/H3 Page  
When Outline Open  
Then 계층과 현재 Heading이 표시된다.

### AT-HUB-003 Links

Given Incoming/Outgoing/Unresolved Link  
When Links Open  
Then 세 Group으로 표시된다.

### AT-HUB-004 Properties

Given Meeting Object  
When Properties Open  
Then Type, Project, Date, Attendee, Tag, Revision을 편집한다.

## 8. AI

### AT-AI-001 Local Only

Given 기본 설정  
When AI 요청  
Then Loopback 외 Network 연결이 없다.

### AT-AI-002 Cancel

Given 생성 중  
When Cancel  
Then UI가 종료되고 Late Token이 추가되지 않는다.

### AT-AI-003 Proposal

Given Selection Rewrite  
When 생성 완료  
Then 원문은 그대로이고 Proposal이 보인다.

### AT-AI-004 Diff Apply

Given Proposal Base Revision과 현재 Revision이 같음  
When Apply  
Then Diff 내용만 새 Revision으로 반영된다.

### AT-AI-005 Proposal Conflict

Given Proposal 생성 후 원문 변경  
When Apply  
Then 자동 적용하지 않고 Conflict 안내가 보인다.

### AT-AI-006 Citation

Given FTS Source 3개 사용  
When Answer 완료  
Then Source 3개가 Page/Heading과 함께 표시된다.

### AT-AI-007 Source Navigation

Given Citation  
When Source Click  
Then 해당 Anchor가 Highlight된다.

### AT-AI-008 Runtime Label

Given 단순 Local OpenAI-compatible Server  
When Status 표시  
Then `로컬 서버`로 표시하고 `MTP`로 표시하지 않는다.

### AT-AI-009 Verified MTP

Given Runtime이 Target, Assistant, Acceptance를 보고  
When Status 표시  
Then MTP Model과 Acceptance를 보여준다.

### AT-AI-010 UTF-8

Given Korean Token이 Byte Chunk 경계에서 분리  
When SSE Stream  
Then 글자가 깨지지 않는다.

## 9. Migration

### AT-MIG-001 Backup

Given V2 DB  
When V3 Migration  
Then 시작 전에 Backup과 SHA256이 생긴다.

### AT-MIG-002 Content Hash

Given V2 Pages  
When Migration 완료  
Then 모든 Markdown Hash가 동일하다.

### AT-MIG-003 Failure

Given 의도적으로 깨진 Migration  
When 실행  
Then 원본 DB가 유지되고 App이 실패를 보고한다.

### AT-MIG-004 Cycle

Given Parent Cycle  
When Migration  
Then 무한 재귀가 없고 Report에 Cycle이 기록된다.

### AT-MIG-005 Import Size

Given 256MB에 가까운 DB  
When Import  
Then JS Byte Array를 만들지 않고 Rust가 Path를 읽는다.

## 10. 접근성

### AT-A11Y-001 Focus

Given Keyboard Navigation  
When Tab 이동  
Then Focus가 시각적으로 보인다.

### AT-A11Y-002 Icon Button

Given Icon-only Button  
When Screen Reader  
Then 의미 있는 Label이 읽힌다.

### AT-A11Y-003 Zoom

Given 125% Text/Display Scale  
When 800×600  
Then Action이 화면 밖으로 잘리지 않는다.

### AT-A11Y-004 Contrast

Given Light/Dark  
When Automated Contrast 검사  
Then Persistent Text와 Controls가 AA를 만족한다.

## 11. VDI

### AT-VDI-001 Non-persistent Profile

Given 비영구 Profile  
When 시작  
Then Data Path가 영구 경로인지 확인하고 위험을 알린다.

### AT-VDI-002 Runtime Port

Given 기본 Port가 다른 Process에 점유  
When Runtime 시작  
Then 임의 Process를 신뢰하지 않고 다른 Port 또는 오류를 선택한다.

### AT-VDI-003 Runtime Crash

Given 생성 중 Runtime 종료  
When Health Monitor 감지  
Then 제한된 재시작과 명확한 오류를 제공한다.

### AT-VDI-004 Session Reconnect

Given Session Disconnect/Reconnect  
When 앱 복귀  
Then DB와 Runtime 상태를 재확인한다.

### AT-VDI-005 Model Missing

Given Model File 삭제  
When AI Open  
Then App은 Crash하지 않고 Model Missing 상태를 표시한다.
