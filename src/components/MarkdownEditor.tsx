import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { Page } from '../types';
import {
  DocumentWorkspace,
  type DocumentWorkspaceHandle,
} from '../editor/DocumentWorkspace';

interface MarkdownEditorProps {
  currentPage: Page | null;
  onPageUpdate: (page: Page) => void | Promise<void>;
  pages?: Page[];
  onPageSelect?: (page: Page) => void;
  onPageCreate?: (title: string) => void;
  onOpenProperties?: () => void;
}

export interface MarkdownEditorHandle {
  flushUnsaved: () => Promise<void>;
}

/** Compatibility adapter retained while App callers migrate to DocumentWorkspace. */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(({
  currentPage,
  onPageUpdate,
  onOpenProperties,
}, ref) => {
  const workspaceRef = useRef<DocumentWorkspaceHandle>(null);
  useImperativeHandle(ref, () => ({
    flushUnsaved: async () => workspaceRef.current?.flushUnsaved(),
  }), []);

  return (
    <DocumentWorkspace
      ref={workspaceRef}
      currentPage={currentPage}
      onPageUpdate={onPageUpdate}
      onOpenProperties={onOpenProperties}
    />
  );
});

MarkdownEditor.displayName = 'MarkdownEditor';
