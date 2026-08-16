import type { AiProposal } from '../../features/ai/aiProposalReducer';
import type { PageBodyDto } from './pageApi';
import { invoke } from '@tauri-apps/api/core';
import { getEnvironment } from '../../utils/environment';
import { TAURI_COMMANDS } from './tauriCommands';

export interface ApplyProposalResult {
  proposal: AiProposal;
  body: PageBodyDto;
}

export interface ProposalApi {
  list(pageId: string): Promise<AiProposal[]>;
  create(proposal: AiProposal): Promise<AiProposal>;
  updateStatus(id: string, status: AiProposal['status']): Promise<void>;
  apply?(id: string): Promise<ApplyProposalResult>;
  reject?(id: string): Promise<AiProposal>;
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

export const tauriProposalApi: ProposalApi = {
  list: (pageId) => invoke(TAURI_COMMANDS.listAiProposals, { pageId }),
  create: (proposal) => invoke(TAURI_COMMANDS.createAiProposal, { proposal }),
  updateStatus: async (id, status) => {
    if (status === 'rejected') {
      await invoke(TAURI_COMMANDS.rejectAiProposal, { id });
    }
  },
  apply: (id) => invoke(TAURI_COMMANDS.applyAiProposal, { id }),
  reject: (id) => invoke(TAURI_COMMANDS.rejectAiProposal, { id }),
};

export const defaultProposalApi = getEnvironment().isTauri
  ? tauriProposalApi
  : memoryProposalApi;
