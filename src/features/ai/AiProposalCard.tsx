import { GitCompareArrows, TriangleAlert } from 'lucide-react';
import { AiDiffDialog } from './AiDiffDialog';
import type { AiProposal } from './aiProposalReducer';

interface AiProposalCardProps {
  proposal: AiProposal;
  diffOpen?: boolean;
  onOpenDiff?: (id: string) => void;
  onCloseDiff?: () => void;
  onApply?: (id: string) => void;
  onReject?: (id: string) => void;
  onOpenSource?: (source: AiProposal['sources'][number]) => void;
}

const STATUS_LABEL: Record<AiProposal['status'], string> = {
  pending: '검토 대기',
  applied: '적용됨',
  rejected: '거절됨',
  conflicted: '충돌',
};

export function AiProposalCard({
  proposal,
  diffOpen = false,
  onOpenDiff,
  onCloseDiff = () => undefined,
  onApply = () => undefined,
  onReject = () => undefined,
  onOpenSource = () => undefined,
}: AiProposalCardProps) {
  return (
    <article className="memoji-ai-proposal" data-status={proposal.status}>
      <header>
        <GitCompareArrows aria-hidden="true" />
        <div><strong>{proposal.title}</strong><span>{STATUS_LABEL[proposal.status]}</span></div>
      </header>
      <p>{proposal.summary}</p>
      {proposal.sources.length > 0 && (
        <div className="memoji-ai-proposal-sources" aria-label="AI 제안 근거">
          {proposal.sources.map((source, index) => (
            <button
              type="button"
              key={`${source.pageId}-${source.start ?? source.anchor ?? index}`}
              onClick={() => onOpenSource(source)}
            >
              [{index + 1}] {source.label || source.headingPath?.at(-1) || source.pageId}
            </button>
          ))}
        </div>
      )}
      {proposal.status === 'conflicted' && (
        <div className="memoji-ai-proposal-conflict" role="alert">
          <TriangleAlert aria-hidden="true" /> 문서가 변경되어 자동 적용하지 않았습니다.
        </div>
      )}
      {proposal.status === 'pending' && (
        <button type="button" onClick={() => onOpenDiff?.(proposal.id)}>변경 비교</button>
      )}
      <AiDiffDialog
        proposal={proposal}
        open={diffOpen}
        onClose={onCloseDiff}
        onApply={() => onApply(proposal.id)}
        onReject={() => onReject(proposal.id)}
        onOpenSource={onOpenSource}
      />
    </article>
  );
}
