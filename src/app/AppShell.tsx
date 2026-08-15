import type { ReactNode } from 'react';

interface AppShellProps {
  topBar?: ReactNode;
  notice?: ReactNode;
  workspace: ReactNode;
  children?: ReactNode;
  focusMode?: boolean;
}

export function AppShell({
  topBar,
  notice,
  workspace,
  children,
  focusMode = false,
}: AppShellProps) {
  return (
    <div
      className={`memoji-app-shell${focusMode ? ' focus-mode' : ''}`}
      data-focus-mode={focusMode ? 'true' : 'false'}
    >
      {topBar}
      {notice}
      <div className="memoji-workspace-frame">{workspace}</div>
      {children ? <div className="memoji-overlay-host">{children}</div> : null}
    </div>
  );
}
