import { describe, expect, it } from 'vitest';
import {
  aiProposalReducer,
  applyProposalToDocument,
  hashTextAnchor,
  initialAiProposalState,
  type AiProposal,
} from './aiProposalReducer';

const proposal: AiProposal = {
  id: 'proposal-1',
  requestId: 'request-current',
  pageId: 'page-1',
  baseRevision: 3,
  type: 'replace',
  title: '선택 영역 다듬기',
  summary: '표현을 간결하게 변경',
  patch: {
    kind: 'text',
    before: '긴 문장',
    after: '짧은 문장',
    anchor: { start: 3, end: 7, textHash: 'expected-hash' },
    contextBefore: '앞: ',
    contextAfter: ' :뒤',
  },
  sources: [{ pageId: 'page-1', start: 3, end: 7, textHash: 'expected-hash' }],
  status: 'pending',
};

describe('aiProposalReducer', () => {
  it('queues a pending proposal', () => {
    const state = aiProposalReducer(initialAiProposalState, { type: 'queue', proposal });
    expect(state.items).toEqual([proposal]);
    expect(state.items[0].status).toBe('pending');
  });

  it('opens the diff for review', () => {
    const state = aiProposalReducer(
      { items: [proposal], openDiffId: null },
      { type: 'open-diff', id: proposal.id },
    );
    expect(state.openDiffId).toBe(proposal.id);
  });

  it.each([
    ['applied', 'mark-applied'],
    ['rejected', 'reject'],
    ['conflicted', 'mark-conflict'],
  ] as const)('marks a proposal %s', (status, type) => {
    const state = aiProposalReducer(
      { items: [proposal], openDiffId: proposal.id },
      { type, id: proposal.id },
    );
    expect(state.items[0].status).toBe(status);
    expect(state.openDiffId).toBeNull();
  });

  it('ignores a stale stream update from an older request', () => {
    const state = aiProposalReducer(
      { items: [proposal], openDiffId: null },
      { type: 'stream-update', id: proposal.id, requestId: 'request-stale', summary: '오래된 결과' },
    );
    expect(state.items[0].summary).toBe(proposal.summary);
  });

  it('applies only the selected range and preserves surrounding content', () => {
    const content = '앞: 긴 문장 :뒤';
    if (proposal.patch.kind !== 'text') throw new Error('text patch expected');
    const anchoredProposal: AiProposal = {
      ...proposal,
      patch: {
        ...proposal.patch,
        anchor: {
          ...proposal.patch.anchor,
          textHash: hashTextAnchor('긴 문장'),
        },
      },
    };
    expect(applyProposalToDocument(content, 3, anchoredProposal)).toEqual({
      ok: true,
      content: '앞: 짧은 문장 :뒤',
    });
  });

  it('reports a conflict when the base revision changed', () => {
    expect(applyProposalToDocument('앞: 긴 문장 :뒤', 4, proposal)).toEqual({
      ok: false,
      reason: 'revision',
    });
  });
});
