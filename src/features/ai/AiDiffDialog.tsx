import { useEffect, useRef } from 'react';
import type { AiProposal } from './aiProposalReducer';

interface AiDiffDialogProps {
  proposal: AiProposal;
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  onReject: () => void;
  onOpenSource?: (source: AiProposal['sources'][number]) => void;
}

export function AiDiffDialog({
  proposal,
  open,
  onClose,
  onApply,
  onReject,
  onOpenSource = () => undefined,
}: AiDiffDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || proposal.patch.kind !== 'text') return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open, proposal.patch.kind]);

  if (!open || proposal.patch.kind !== 'text') return null;
  const { patch } = proposal;

  return (
    <div className="memoji-ai-diff-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialogRef} className="memoji-ai-diff-dialog" role="dialog" aria-modal="true" aria-labelledby={`ai-diff-title-${proposal.id}`}>
        <header>
          <div>
            <span>AI 제안 검토</span>
            <h3 id={`ai-diff-title-${proposal.id}`}>{proposal.title}</h3>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="비교 닫기">×</button>
        </header>
        <dl className="memoji-ai-diff-meta">
          <div><dt>기준 리비전</dt><dd>{proposal.baseRevision}</dd></div>
          <div><dt>대상 범위</dt><dd>{patch.anchor.start}–{patch.anchor.end}</dd></div>
        </dl>
        <div className="memoji-ai-diff-content">
          {patch.contextBefore && <p className="memoji-ai-diff-context">{patch.contextBefore}</p>}
          <del>{patch.before}</del>
          <ins>{patch.after}</ins>
          {patch.contextAfter && <p className="memoji-ai-diff-context">{patch.contextAfter}</p>}
        </div>
        {proposal.sources.length > 0 && (
          <div className="memoji-ai-diff-sources" aria-label="변경 근거">
            <strong>근거 {proposal.sources.length}개</strong>
            {proposal.sources.map((source, index) => (
              <button
                type="button"
                key={`${source.pageId}-${source.start ?? source.anchor ?? index}`}
                onClick={() => onOpenSource(source)}
              >
                [{index + 1}] {source.label || source.headingPath?.join(' › ') || source.pageId}
              </button>
            ))}
          </div>
        )}
        <footer>
          <button type="button" className="memoji-ai-diff-reject" onClick={onReject}>제안 거절</button>
          <button type="button" className="memoji-ai-diff-apply" onClick={onApply}>변경 적용</button>
        </footer>
      </section>
    </div>
  );
}
