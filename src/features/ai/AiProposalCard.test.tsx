import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '../../test/render';
import type { AiProposal } from './aiProposalReducer';
import { AiProposalCard } from './AiProposalCard';

const proposal: AiProposal = {
  id: 'proposal-1',
  requestId: 'request-1',
  pageId: 'page-1',
  baseRevision: 0,
  type: 'replace',
  title: '선택 영역 다듬기',
  summary: '한 문장을 더 명확하게 바꿉니다.',
  patch: {
    kind: 'text',
    before: '기존 문장',
    after: '개선 문장',
    anchor: { start: 4, end: 9, textHash: 'abc' },
    contextBefore: '앞 문맥',
    contextAfter: '뒤 문맥',
  },
  sources: [{ pageId: 'page-1', start: 4, end: 9, textHash: 'abc' }],
  status: 'pending',
};

describe('AiProposalCard', () => {
  it('requires diff review before applying a proposal', async () => {
    const onOpenDiff = vi.fn();
    renderWithProviders(<AiProposalCard proposal={proposal} onOpenDiff={onOpenDiff} />);

    expect(screen.getByText('검토 대기')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '변경 비교' }));
    expect(onOpenDiff).toHaveBeenCalledWith(proposal.id);
  });

  it('shows escaped text changes and exposes explicit apply and reject actions', async () => {
    const onApply = vi.fn();
    const onReject = vi.fn();
    renderWithProviders(
      <AiProposalCard
        proposal={{
          ...proposal,
          patch: proposal.patch.kind === 'text'
            ? { ...proposal.patch, after: '<script>안전한 텍스트</script>' }
            : proposal.patch,
        }}
        diffOpen
        onCloseDiff={vi.fn()}
        onApply={onApply}
        onReject={onReject}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'AI 변경 제안 비교' })).toHaveTextContent('<script>안전한 텍스트</script>');
    expect(screen.queryByRole('script')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '변경 적용' }));
    expect(onApply).toHaveBeenCalledWith(proposal.id);
    await userEvent.click(screen.getByRole('button', { name: '제안 거절' }));
    expect(onReject).toHaveBeenCalledWith(proposal.id);
  });

  it('opens a cited page source from both the card and review dialog', async () => {
    const onOpenSource = vi.fn();
    renderWithProviders(
      <AiProposalCard
        proposal={{
          ...proposal,
          sources: [{
            ...proposal.sources[0],
            label: '출시 근거',
            anchor: 'release-evidence',
            headingPath: ['계획', '출시 근거'],
          }],
        }}
        diffOpen
        onOpenSource={onOpenSource}
      />,
    );

    const citationButtons = screen.getAllByRole('button', { name: /출시 근거/ });
    await userEvent.click(citationButtons[0]);
    await userEvent.click(citationButtons[1]);
    expect(onOpenSource).toHaveBeenCalledTimes(2);
    expect(onOpenSource).toHaveBeenLastCalledWith(expect.objectContaining({
      pageId: 'page-1',
      anchor: 'release-evidence',
    }));
  });
});
