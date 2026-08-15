import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '../test/render';
import { WorkspaceCanvas } from './WorkspaceCanvas';

describe('WorkspaceCanvas', () => {
  it.each([
    ['tasks', '작업 공간'],
    ['calendar', '캘린더 공간'],
    ['knowledge', '지식 공간'],
    ['search', '검색 공간'],
  ] as const)('renders a production empty state for %s', (view, label) => {
    renderWithProviders(<WorkspaceCanvas view={view} editor={<div>editor</div>} />);
    expect(screen.getByRole('region', { name: label })).toBeVisible();
  });

  it('renders the editor view unchanged', () => {
    renderWithProviders(<WorkspaceCanvas view="editor" editor={<button onClick={vi.fn()}>편집기</button>} />);
    expect(screen.getByRole('button', { name: '편집기' })).toBeVisible();
  });
});
