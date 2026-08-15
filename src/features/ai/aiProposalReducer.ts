export interface TextAnchor {
  start: number;
  end: number;
  textHash: string;
}

export interface TextPatch {
  kind: 'text';
  before: string;
  after: string;
  anchor: TextAnchor;
  contextBefore: string;
  contextAfter: string;
}

export interface StructuredPatch {
  kind: 'structured';
  value: Record<string, unknown>;
}

export interface AiSource {
  pageId: string;
  start?: number;
  end?: number;
  textHash?: string;
  label?: string;
}

export interface AiProposal {
  id: string;
  requestId: string;
  pageId: string;
  baseRevision: number;
  type: 'insert' | 'replace' | 'tasks' | 'decisions' | 'properties';
  title: string;
  summary: string;
  patch: TextPatch | StructuredPatch;
  sources: AiSource[];
  status: 'pending' | 'applied' | 'rejected' | 'conflicted';
}

export interface AiProposalState {
  items: AiProposal[];
  openDiffId: string | null;
}

export const initialAiProposalState: AiProposalState = {
  items: [],
  openDiffId: null,
};

export type AiProposalAction =
  | { type: 'queue'; proposal: AiProposal }
  | { type: 'open-diff'; id: string }
  | { type: 'close-diff' }
  | { type: 'mark-applied'; id: string }
  | { type: 'reject'; id: string }
  | { type: 'mark-conflict'; id: string }
  | { type: 'stream-update'; id: string; requestId: string; summary: string };

export function aiProposalReducer(
  state: AiProposalState,
  action: AiProposalAction,
): AiProposalState {
  if (action.type === 'queue') {
    return { ...state, items: [...state.items, { ...action.proposal, status: 'pending' }] };
  }
  if (action.type === 'open-diff') return { ...state, openDiffId: action.id };
  if (action.type === 'close-diff') return { ...state, openDiffId: null };

  const status = action.type === 'mark-applied'
    ? 'applied'
    : action.type === 'reject'
      ? 'rejected'
      : action.type === 'mark-conflict'
        ? 'conflicted'
        : null;

  if (status) {
    return {
      items: state.items.map((proposal) => proposal.id === action.id
        ? { ...proposal, status }
        : proposal),
      openDiffId: state.openDiffId === action.id ? null : state.openDiffId,
    };
  }

  if (action.type === 'stream-update') {
    return {
      ...state,
      items: state.items.map((proposal) => (
        proposal.id === action.id && proposal.requestId === action.requestId
          ? { ...proposal, summary: action.summary }
          : proposal
      )),
    };
  }

  return state;
}

export function hashTextAnchor(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function applyProposalToDocument(
  content: string,
  currentRevision: number,
  proposal: AiProposal,
): { ok: true; content: string } | { ok: false; reason: 'revision' | 'anchor' | 'unsupported' } {
  if (proposal.baseRevision !== currentRevision) return { ok: false, reason: 'revision' };
  if (proposal.patch.kind !== 'text') return { ok: false, reason: 'unsupported' };

  const { anchor, before, after } = proposal.patch;
  const selected = content.slice(anchor.start, anchor.end);
  if (
    anchor.start < 0 ||
    anchor.end < anchor.start ||
    selected !== before ||
    hashTextAnchor(selected) !== anchor.textHash
  ) {
    return { ok: false, reason: 'anchor' };
  }

  return {
    ok: true,
    content: `${content.slice(0, anchor.start)}${after}${content.slice(anchor.end)}`,
  };
}

