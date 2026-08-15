import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { resolveLayoutMode } from '../app/panelLayout';

interface WorkspaceLayoutProps {
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  focusMode?: boolean;
  viewportWidth?: number;
  onLeftOpenChange: (open: boolean) => void;
  onRightOpenChange: (open: boolean) => void;
  onLeftWidthChange: (width: number) => void;
  onRightWidthChange: (width: number) => void;
}

function percent(pixels: number, viewportWidth: number): number {
  return Math.max(1, Math.min(99, (pixels / Math.max(1, viewportWidth)) * 100));
}

export function WorkspaceLayout({
  left,
  center,
  right,
  leftOpen,
  rightOpen,
  leftWidth,
  rightWidth,
  focusMode = false,
  viewportWidth,
  onLeftOpenChange,
  onRightOpenChange,
  onLeftWidthChange,
  onRightWidthChange,
}: WorkspaceLayoutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(
    viewportWidth ?? (typeof window === 'undefined' ? 1200 : window.innerWidth),
  );

  useEffect(() => {
    if (viewportWidth !== undefined) {
      setMeasuredWidth(viewportWidth);
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    const updateWidth = (width: number) => {
      if (width > 0) setMeasuredWidth(Math.round(width));
    };
    updateWidth(root.getBoundingClientRect().width || window.innerWidth);

    const observer = new ResizeObserver(([entry]) => {
      updateWidth(entry.contentRect.width);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [viewportWidth]);

  const mode = focusMode ? 'three-pane' : resolveLayoutMode(measuredWidth);
  const leftOverlay = !focusMode && mode === 'dual-overlay' && leftOpen;
  const rightOverlay = !focusMode && mode !== 'three-pane' && rightOpen;
  const hasOverlay = leftOverlay || rightOverlay;

  const dismissOverlays = useCallback(() => {
    if (leftOverlay) onLeftOpenChange(false);
    if (rightOverlay) onRightOpenChange(false);
    const toggle = rightOverlay ? 'right' : 'left';
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-panel-toggle="${toggle}"]`)?.focus();
    });
  }, [leftOverlay, onLeftOpenChange, onRightOpenChange, rightOverlay]);

  useEffect(() => {
    if (!hasOverlay) return;
    const closeOverlays = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dismissOverlays();
    };
    document.addEventListener('keydown', closeOverlays);
    return () => document.removeEventListener('keydown', closeOverlays);
  }, [dismissOverlays, hasOverlay]);

  const leftPanelSizing = useMemo(() => ({
    defaultSize: percent(leftWidth, measuredWidth),
    minSize: percent(220, measuredWidth),
    maxSize: percent(360, measuredWidth),
  }), [leftWidth, measuredWidth]);
  const rightPanelSizing = useMemo(() => ({
    defaultSize: percent(rightWidth, measuredWidth),
    minSize: percent(288, measuredWidth),
    maxSize: percent(440, measuredWidth),
  }), [rightWidth, measuredWidth]);

  const overlayWidth = (width: number): CSSProperties => ({
    width: Math.min(width, Math.max(260, measuredWidth - 48)),
  });

  return (
    <div
      ref={rootRef}
      className="memoji-workspace-layout"
      data-layout-mode={focusMode ? 'focus' : mode}
    >
      <PanelGroup
        key={`${mode}-${focusMode}-${leftOpen}-${rightOpen}`}
        id="memoji-workspace-panels"
        direction="horizontal"
        className="memoji-inline-panels"
      >
        {!focusMode && mode !== 'dual-overlay' && leftOpen && (
          <>
            <Panel
              id="memoji-left-panel"
              {...leftPanelSizing}
              order={1}
              onResize={(size) => onLeftWidthChange((size / 100) * measuredWidth)}
              className="memoji-panel"
            >
              <nav
                aria-label="Workspace navigation"
                className="memoji-pane memoji-pane-left"
                data-pane-mode="inline"
              >
                {left}
              </nav>
            </Panel>
            <PanelResizeHandle
              id="memoji-left-resize-handle"
              className="memoji-resize-handle"
              aria-label="Resize workspace navigation"
            />
          </>
        )}

        <Panel
          id="memoji-center-panel"
          order={2}
          minSize={percent(320, measuredWidth)}
          className="memoji-panel"
        >
          <main className="memoji-pane memoji-pane-center">{center}</main>
        </Panel>

        {!focusMode && mode === 'three-pane' && rightOpen && (
          <>
            <PanelResizeHandle
              id="memoji-right-resize-handle"
              className="memoji-resize-handle"
              aria-label="Resize context hub"
            />
            <Panel
              id="memoji-right-panel"
              {...rightPanelSizing}
              order={3}
              onResize={(size) => onRightWidthChange((size / 100) * measuredWidth)}
              className="memoji-panel"
            >
              <aside
                aria-label="Context hub"
                className="memoji-pane memoji-pane-right"
                data-pane-mode="inline"
              >
                {right}
              </aside>
            </Panel>
          </>
        )}
      </PanelGroup>

      {hasOverlay && (
        <button
          type="button"
          className="memoji-overlay-backdrop"
          aria-label="Close workspace panels"
          onClick={dismissOverlays}
        />
      )}

      {leftOverlay && (
        <nav
          aria-label="Workspace navigation"
          className="memoji-pane memoji-overlay-pane memoji-overlay-left"
          data-pane-mode="overlay"
          style={overlayWidth(leftWidth)}
        >
          {left}
        </nav>
      )}

      {rightOverlay && (
        <aside
          aria-label="Context hub"
          className="memoji-pane memoji-overlay-pane memoji-overlay-right"
          data-pane-mode="overlay"
          style={overlayWidth(rightWidth)}
        >
          {right}
        </aside>
      )}
    </div>
  );
}
