interface WorkspaceStatusBarProps {
  content: string;
  mode: 'wysiwyg' | 'source';
  updatedAt?: string;
}

export function WorkspaceStatusBar({ content, mode, updatedAt }: WorkspaceStatusBarProps) {
  const characters = [...content].length;
  const words = content.trim() ? content.trim().split(/\s+/u).length : 0;
  return (
    <footer className="workspace-status-bar" role="status" aria-label="문서 상태">
      <span>{mode === 'source' ? 'Markdown 원문' : '즉시 편집'}</span>
      <span>{words.toLocaleString('ko-KR')} 단어</span>
      <span>{characters.toLocaleString('ko-KR')} 문자</span>
      <span className="workspace-status-spacer" />
      <span>로컬 전용</span>
      {updatedAt ? <span>수정 {new Date(updatedAt).toLocaleDateString('ko-KR')}</span> : null}
    </footer>
  );
}
