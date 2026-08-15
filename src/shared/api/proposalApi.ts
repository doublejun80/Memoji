import type { AiProposal } from '../../features/ai/aiProposalReducer';

export interface ProposalApi {
  list(pageId: string): Promise<AiProposal[]>;
  create(proposal: AiProposal): Promise<AiProposal>;
  updateStatus(id: string, status: AiProposal['status']): Promise<void>;
}

export function createMemoryProposalApi(): ProposalApi {
  const proposals = new Map<string, AiProposal>();
  return {
    list: async (pageId) => [...proposals.values()].filter((proposal) => proposal.pageId === pageId),
    create: async (proposal) => {
      proposals.set(proposal.id, proposal);
      return proposal;
    },
    updateStatus: async (id, status) => {
      const proposal = proposals.get(id);
      if (proposal) proposals.set(id, { ...proposal, status });
    },
  };
}

export const memoryProposalApi = createMemoryProposalApi();
