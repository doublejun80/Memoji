import React, { useState } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Save, Check, HelpCircle, Sun, Moon, Maximize2, Keyboard, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose, Settings, Minus, Square, X as CloseIcon, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../contexts/ThemeContext';
import { useFocusMode } from '../contexts/FocusModeContext';
import { getCurrentWindow } from '@tauri-apps/api/window';


interface TopBarProps {
  onSave: () => void;
  onShortcutsOpen?: () => void;
  onSettingsOpen?: () => void;
  onRightPanelToggle?: () => void;
  isRightPanelOpen?: boolean;
  onLeftPanelToggle?: () => void;
  isLeftPanelOpen?: boolean;
  appTitle?: string;
  onExport?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSave,
  onShortcutsOpen,
  onSettingsOpen,
  onRightPanelToggle,
  isRightPanelOpen = true,
  onLeftPanelToggle,
  isLeftPanelOpen = true,
  appTitle = 'BlockNote',
  onExport
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [helpTab, setHelpTab] = useState<'guide' | 'markdown'>('guide');
  const { setTheme, actualTheme } = useTheme();
  const { toggleFocusMode } = useFocusMode();

  const handleSave = async () => {
    setIsSaving(true);
    try {
      onSave();
      toast.success('저장되었습니다!');
    } catch (error) {
      toast.error('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      console.log('Minimizing window...');
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      console.log('Maximizing window...');
      await appWindow.toggleMaximize();
    } catch (error) {
      console.error('Failed to maximize:', error);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      console.log('Closing window...');
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close:', error);
    }
  };

  return (
    <div className="h-12 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4 select-none" data-tauri-drag-region>
      <div className="flex items-center gap-4">
        {onLeftPanelToggle && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onLeftPanelToggle}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            title={isLeftPanelOpen ? '사이드바 닫기' : '사이드바 열기'}
          >
            {isLeftPanelOpen ? (
              <PanelLeftClose className="h-3 w-3" />
            ) : (
              <PanelLeftOpen className="h-3 w-3" />
            )}
          </Button>
        )}
        <h1 className="font-semibold">{appTitle}</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={toggleFocusMode}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          title="집중 모드 (F11)"
        >
          <Maximize2 className="h-3 w-3" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          title={actualTheme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {actualTheme === 'dark' ? (
            <Sun className="h-3 w-3" />
          ) : (
            <Moon className="h-3 w-3" />
          )}
        </Button>

        {onShortcutsOpen && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onShortcutsOpen}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            title="단축키 설정 (Ctrl+Shift+K)"
          >
            <Keyboard className="h-3 w-3" />
          </Button>
        )}

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
              title="사용 가이드"
            >
              <HelpCircle className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Memoji 사용 가이드</DialogTitle>
            </DialogHeader>

            {/* 탭 버튼 */}
            <div className="flex gap-2 border-b">
              <button
                onClick={() => setHelpTab('guide')}
                className={`px-4 py-2 font-medium transition-colors ${
                  helpTab === 'guide'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📖 전체 설명
              </button>
              <button
                onClick={() => setHelpTab('markdown')}
                className={`px-4 py-2 font-medium transition-colors ${
                  helpTab === 'markdown'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ✍️ 마크다운 작성법
              </button>
            </div>

            {/* 전체 설명 탭 */}
            {helpTab === 'guide' && (
              <div className="space-y-6 text-sm pt-4">
                <div>
                  <h3 className="font-medium mb-2 text-lg">🎯 Memoji란?</h3>
                  <p className="text-muted-foreground">
                    Memoji는 마크다운 기반의 노트 작성 앱입니다.
                    페이지와 폴더를 자유롭게 구성하고, 날짜별로 메모를 관리할 수 있습니다.
                  </p>
                </div>

                <div>
                  <h3 className="font-medium mb-2">📝 기본 사용법</h3>
                  <div className="space-y-2 text-muted-foreground">
                    <p><strong>• 새 페이지 만들기:</strong> 좌측 사이드바 상단의 + 버튼 또는 Ctrl+N</p>
                    <p><strong>• 폴더 만들기:</strong> 페이지 우클릭 → "하위 폴더 추가"</p>
                    <p><strong>• 페이지 이동:</strong> 드래그 앤 드롭으로 페이지 순서 변경 및 폴더 이동</p>
                    <p><strong>• 검색:</strong> Ctrl+K로 전체 검색 열기</p>
                    <p><strong>• 저장:</strong> Ctrl+S 또는 자동 저장 (페이지 전환 시)</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">🗓️ 달력 기능</h3>
                  <div className="space-y-2 text-muted-foreground">
                    <p><strong>• 날짜 선택:</strong> 우측 달력에서 날짜 클릭</p>
                    <p><strong>• 메모 표시:</strong> 메모가 있는 날짜는 파란색 점으로 표시</p>
                    <p><strong>• 빠른 이동:</strong> 오늘 날짜로 빠르게 이동 가능</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">✏️ 편집 모드</h3>
                  <div className="space-y-2 text-muted-foreground">
                    <p><strong>• 편집/미리보기:</strong> 제목 옆 버튼으로 전환</p>
                    <p><strong>• 마크다운:</strong> 마크다운 문법으로 서식 적용</p>
                    <p><strong>• 할일 목록:</strong> - [ ] 또는 - [x]로 체크박스 생성</p>
                    <p><strong>• 링크:</strong> [[페이지이름]]으로 다른 페이지 연결</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">🎨 테마 및 설정</h3>
                  <div className="space-y-2 text-muted-foreground">
                    <p><strong>• 다크/라이트 모드:</strong> 상단 바의 태양/달 아이콘</p>
                    <p><strong>• 집중 모드:</strong> F11 또는 상단 바의 전체화면 아이콘</p>
                    <p><strong>• 패널 토글:</strong> 좌측/우측 패널 열기/닫기</p>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">⌨️ 주요 단축키</h3>
                  <div className="bg-muted p-3 rounded space-y-2">
                    <div className="flex justify-between">
                      <span>새 페이지</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + N</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>검색</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + K</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>저장</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + S</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>편집/미리보기 전환</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + E</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>굵게</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + B</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>기울임</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + I</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>집중 모드</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">F11</kbd>
                    </div>
                    <div className="flex justify-between">
                      <span>단축키 설정</span>
                      <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + Shift + K</kbd>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">💡 팁</h3>
                  <div className="space-y-2 text-muted-foreground">
                    <p>• 페이지 아이콘을 클릭하여 이모지 변경 가능</p>
                    <p>• 폴더를 활용하여 프로젝트별로 메모 정리</p>
                    <p>• 할일 목록의 체크박스는 미리보기 모드에서 클릭 가능</p>
                    <p>• 마크다운 작성법 탭에서 더 많은 서식 확인</p>
                  </div>
                </div>
              </div>
            )}

            {/* 마크다운 작성법 탭 */}
            {helpTab === 'markdown' && (
              <div className="space-y-6 text-sm pt-4">
              <div>
                <h3 className="font-medium mb-2">📝 제목 (Headings)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  # 제목 1<br/>
                  ## 제목 2<br/>
                  ### 제목 3<br/>
                  #### 제목 4<br/>
                  ##### 제목 5<br/>
                  ###### 제목 6
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  # 개수로 제목 크기 조절 (최대 6단계)
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">✨ 강조 (Emphasis)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  **굵게** 또는 __굵게__ → <strong>굵게</strong><br/>
                  *기울임* 또는 _기울임_ → <em>기울임</em><br/>
                  ***굵게 기울임*** 또는 ___굵게 기울임___ → <strong><em>굵게 기울임</em></strong><br/>
                  ~~취소선~~ → <del>취소선</del><br/>
                  ==하이라이트== → <mark className="bg-yellow-200 px-1 rounded">하이라이트</mark><br/>
                  `인라인 코드` → <code className="bg-muted px-1 py-0.5 rounded">인라인 코드</code>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">📋 목록 (Lists)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  <strong>순서 없는 목록:</strong><br/>
                  - 항목 1 (또는 * 또는 +)<br/>
                  &nbsp;&nbsp;- 하위 항목 (스페이스 2칸)<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;+ 더 깊은 하위 항목<br/><br/>

                  <strong>순서 있는 목록:</strong><br/>
                  1. 첫 번째 항목<br/>
                  2. 두 번째 항목<br/>
                  &nbsp;&nbsp;1. 하위 항목<br/>
                  &nbsp;&nbsp;2. 하위 항목
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">✅ 할일 목록 (Task List)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  - [ ] 미완료 작업<br/>
                  - [x] 완료된 작업<br/>
                  &nbsp;&nbsp;- [ ] 하위 작업
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  💡 미리보기 모드에서 체크박스 클릭 시 자동으로 완료/미완료 변경
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">🔗 링크 (Links)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  <strong>웹 링크:</strong><br/>
                  [네이버](https://www.naver.com "네이버 홈페이지")<br/>
                  &lt;https://www.naver.com&gt;<br/><br/>
                  <strong>페이지 링크:</strong><br/>
                  [[페이지이름]] → 다른 페이지로 이동
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  웹 링크: [] 안에 텍스트, () 안에 URL<br/>
                  페이지 링크: [[페이지이름]]으로 내부 페이지 연결
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">🖼️ 이미지 (Images)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  ![대체 텍스트](이미지URL "설명")
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  링크와 비슷하지만 앞에 ! 추가
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">💬 인용문 (Blockquotes)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  &gt; 인용문입니다<br/>
                  &gt; 여러 줄 가능<br/>
                  &gt;&gt; 중첩된 인용문
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">💻 코드 (Code)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  <strong>인라인 코드:</strong> `코드`<br/><br/>
                  <strong>코드 블록:</strong><br/>
                  ```python<br/>
                  def hello():<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;print("Hello!")<br/>
                  ```
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  언어 이름 지정 시 문법 강조 적용
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">➖ 구분선 (Horizontal Rules)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  --- 또는 *** 또는 ___
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  세 개 이상의 -, *, _ 사용
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">📊 표 (Tables)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  | 헤더 1 | 헤더 2 | 헤더 3 |<br/>
                  | :--- | :---: | ---: |<br/>
                  | 왼쪽 | 중앙 | 오른쪽 |<br/>
                  | 셀 1 | 셀 2 | 셀 3 |
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  :--- (왼쪽), :---: (중앙), ---: (오른쪽) 정렬
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">🎨 아이콘 및 이모지</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  <strong>숫자:</strong><br/>
                  :one: → 1️⃣ :two: → 2️⃣ :three: → 3️⃣ :four: → 4️⃣ :five: → 5️⃣<br/>
                  :six: → 6️⃣ :seven: → 7️⃣ :eight: → 8️⃣ :nine: → 9️⃣ :ten: → 🔟<br/><br/>
                  <strong>기호:</strong><br/>
                  :check: → ✅ &nbsp; :x: → ❌ &nbsp; :heart: → ❤️<br/>
                  :star: → ⭐ &nbsp; :fire: → 🔥 &nbsp; :thumbsup: → 👍<br/>
                  :smile: → 😊 &nbsp; :bulb: → 💡 &nbsp; :warning: → ⚠️<br/>
                  :note: → 📝 &nbsp; :calendar: → 📅 &nbsp; :clock: → 🕐<br/>
                  :arrow_right: → → &nbsp; :arrow_left: → ← &nbsp; :home: → 🏠<br/>
                  :work: → 💼 &nbsp; :book: → 📖 &nbsp; :computer: → 💻
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  다른 아이콘: :phone: :email: :link: :lock: :key: :search: :plus: :minus: 등
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">⌨️ 단축키</h3>
                <div className="bg-muted p-3 rounded space-y-2">
                  <div className="flex justify-between">
                    <span>새 메모 생성</span>
                    <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + N</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>검색창 포커스</span>
                    <kbd className="px-2 py-1 bg-background rounded text-xs">Ctrl + F</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>검색 초기화</span>
                    <kbd className="px-2 py-1 bg-background rounded text-xs">ESC</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>사이드바 토글</span>
                    <span className="text-xs">상단 메뉴 버튼</span>
                  </div>
                  <div className="flex justify-between">
                    <span>들여쓰기</span>
                    <kbd className="px-2 py-1 bg-background rounded text-xs">Tab</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>편집/미리보기 전환</span>
                    <span className="text-xs">제목 옆 버튼 클릭</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">📝 각주 (Footnotes)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  본문에 각주[^1]를 추가합니다.<br/><br/>
                  [^1]: 각주 내용입니다.
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  [^번호]로 표시, 하단에 [^번호]: 내용 작성
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">⚠️ 경고/알림 박스 (Alerts)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  &gt; [!NOTE]<br/>
                  &gt; 유용한 정보입니다.<br/><br/>
                  &gt; [!TIP] / [!WARNING] / [!IMPORTANT] / [!CAUTION]
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  중요 정보 강조에 유용
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-2">↩️ 줄바꿈 (Line Break)</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  첫 번째 줄&nbsp;&nbsp;(스페이스 2개)<br/>
                  두 번째 줄<br/><br/>
                  또는 &lt;br&gt; 태그 사용
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">📂 접기/펼치기</h3>
                <div className="bg-muted p-3 rounded font-mono text-xs">
                  &lt;details&gt;<br/>
                  &lt;summary&gt;클릭하여 펼치기&lt;/summary&gt;<br/>
                  숨겨진 내용<br/>
                  &lt;/details&gt;
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  긴 내용을 접어서 정리
                </p>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  💡 <strong>팁:</strong><br/>
                  • 스페이스 2칸 또는 탭으로 들여쓰기하여 계층 구조 표현<br/>
                  • 모든 마크다운 요소는 자동 저장되며 미리보기에서 실시간 확인<br/>
                  • 편집 모드와 미리보기 모드를 전환하며 작성하세요
                </p>
              </div>
            </div>
            )}
          </DialogContent>
        </Dialog>

        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
          disabled={isSaving}
          className="h-8 w-8 p-0"
          title={isSaving ? '저장 중...' : '저장'}
        >
          {isSaving ? (
            <Check className="h-3 w-3 animate-pulse" />
          ) : (
            <Save className="h-3 w-3" />
          )}
        </Button>

        {onExport && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              onExport();
              toast.success('파일이 다운로드되었습니다!');
            }}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            title="Markdown으로 내보내기"
          >
            <Download className="h-3 w-3" />
          </Button>
        )}

        {onSettingsOpen && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onSettingsOpen}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            title="설정"
          >
            <Settings className="h-3 w-3" />
          </Button>
        )}

        {onRightPanelToggle && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onRightPanelToggle}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
            title={isRightPanelOpen ? '검색 패널 닫기' : '검색 패널 열기'}
          >
            {isRightPanelOpen ? (
              <PanelRightClose className="h-3 w-3" />
            ) : (
              <PanelRightOpen className="h-3 w-3" />
            )}
          </Button>
        )}

        {/* 윈도우 컨트롤 버튼 */}
        <div className="flex items-center gap-1 ml-4">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMinimize();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="h-8 w-10 flex items-center justify-center hover:bg-gray-700 transition-colors rounded cursor-pointer"
            title="최소화"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleMaximize();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="h-8 w-10 flex items-center justify-center hover:bg-gray-700 transition-colors rounded cursor-pointer"
            title="최대화"
          >
            <Square className="h-3.1 w-3.1" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClose();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="h-8 w-10 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors rounded cursor-pointer"
            title="닫기"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};