import { describe, expect, it, vi } from 'vitest';
import { fireEvent, renderWithProviders, screen } from '../test/render';
import { WorkspaceLayout } from './WorkspaceLayout';

const content = {
  left: <div>Left navigation</div>,
  center: <div>Document editor</div>,
  right: <div>Context hub</div>,
};

function renderLayout(viewportWidth: number, options?: {
  focusMode?: boolean;
  leftOpen?: boolean;
  rightOpen?: boolean;
  onLeftOpenChange?: (open: boolean) => void;
  onRightOpenChange?: (open: boolean) => void;
}) {
  return renderWithProviders(
    <WorkspaceLayout
      {...content}
      viewportWidth={viewportWidth}
      focusMode={options?.focusMode}
      leftOpen={options?.leftOpen ?? true}
      rightOpen={options?.rightOpen ?? true}
      leftWidth={240}
      rightWidth={304}
      onLeftOpenChange={options?.onLeftOpenChange ?? vi.fn()}
      onRightOpenChange={options?.onRightOpenChange ?? vi.fn()}
      onLeftWidthChange={vi.fn()}
      onRightWidthChange={vi.fn()}
    />,
  );
}

describe('WorkspaceLayout', () => {
  it('shows three inline panes at 1200px', () => {
    renderLayout(1200);

    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toHaveAttribute('data-pane-mode', 'inline');
    expect(screen.getByRole('main')).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Context hub' })).toHaveAttribute('data-pane-mode', 'inline');
  });

  it('moves only the context hub to a non-modal overlay at 1024px', () => {
    renderLayout(1024);

    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toHaveAttribute('data-pane-mode', 'inline');
    const right = screen.getByRole('complementary', { name: 'Context hub' });
    expect(right).toHaveAttribute('data-pane-mode', 'overlay');
    expect(right).not.toHaveAttribute('aria-modal');
  });

  it('uses two non-modal overlays at 800px', () => {
    renderLayout(800);

    expect(screen.getByRole('navigation', { name: 'Workspace navigation' })).toHaveAttribute('data-pane-mode', 'overlay');
    expect(screen.getByRole('complementary', { name: 'Context hub' })).toHaveAttribute('data-pane-mode', 'overlay');
    expect(screen.getByRole('main')).toBeVisible();
  });

  it('keeps only the editor mounted in focus mode', () => {
    renderLayout(1440, { focusMode: true });

    expect(screen.queryByRole('navigation', { name: 'Workspace navigation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Context hub' })).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toBeVisible();
  });

  it('closes visible responsive overlays with Escape', () => {
    const closeLeft = vi.fn();
    const closeRight = vi.fn();
    renderLayout(800, {
      onLeftOpenChange: closeLeft,
      onRightOpenChange: closeRight,
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(closeLeft).toHaveBeenCalledWith(false);
    expect(closeRight).toHaveBeenCalledWith(false);
  });

  it('reconciles the resizable panel registry when crossing a responsive breakpoint', () => {
    const sharedProps = {
      ...content,
      focusMode: false,
      leftOpen: true,
      rightOpen: true,
      leftWidth: 240,
      rightWidth: 304,
      onLeftOpenChange: vi.fn(),
      onRightOpenChange: vi.fn(),
      onLeftWidthChange: vi.fn(),
      onRightWidthChange: vi.fn(),
    };
    const { rerender } = renderWithProviders(
      <WorkspaceLayout {...sharedProps} viewportWidth={1200} />,
    );

    expect(() => {
      rerender(<WorkspaceLayout {...sharedProps} viewportWidth={1024} />);
    }).not.toThrow();
    expect(screen.getByRole('complementary', { name: 'Context hub' })).toHaveAttribute('data-pane-mode', 'overlay');
  });
});
