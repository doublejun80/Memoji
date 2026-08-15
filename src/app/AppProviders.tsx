import type { ReactNode } from 'react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { FocusModeProvider } from '../contexts/FocusModeContext';
import { WorkspaceControllerProvider } from './useWorkspaceController';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <FocusModeProvider>
        <WorkspaceControllerProvider>
          {children}
        </WorkspaceControllerProvider>
      </FocusModeProvider>
    </ThemeProvider>
  );
}
