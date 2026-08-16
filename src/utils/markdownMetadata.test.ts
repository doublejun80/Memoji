import { describe, expect, it } from 'vitest';
import { extractDocumentMetadata, pageWithMarkdownMetadata, updateDocumentMetadata } from './markdownMetadata';
import type { Page } from '../types';

it('extracts status and due metadata from frontmatter and Dataview fields', () => {
  expect(extractDocumentMetadata('---\nstatus: active\ndue: 2026-09-01\n---\n# 계획')).toEqual({
    status: 'active', dueDate: '2026-09-01',
  });
  expect(extractDocumentMetadata('status:: blocked\ndue:: 2026-09-02')).toEqual({
    status: 'blocked', dueDate: '2026-09-02',
  });
});

describe('pageWithMarkdownMetadata', () => {
  it('keeps searchable tags and derived document metadata together', () => {
    const page = { id: 'p1', title: '계획', icon: '', parentId: null, content: '', createdAt: '', updatedAt: '', type: 'page', tags: [], order: 0 } as Page;
    expect(pageWithMarkdownMetadata(page, 'status:: review\ndue:: 2026-09-03\n#GA')).toMatchObject({
      status: 'review', dueDate: '2026-09-03', tags: ['GA'],
    });
  });
});

describe('updateDocumentMetadata', () => {
  it('upserts supported properties without destroying the document body', () => {
    const updated = updateDocumentMetadata('# 계획\n\n본문입니다.', {
      status: 'review',
      dueDate: '2026-09-03',
      tags: ['GA', '출시'],
    });

    expect(updated).toContain('status:: review');
    expect(updated).toContain('due:: 2026-09-03');
    expect(updated).toContain('tags:: #GA #출시');
    expect(updated).toContain('# 계획\n\n본문입니다.');
    expect(pageWithMarkdownMetadata({ id: 'p1', title: '계획', icon: '', parentId: null, content: '', createdAt: '', updatedAt: '', type: 'page', tags: [], order: 0 } as Page, updated)).toMatchObject({
      status: 'review', dueDate: '2026-09-03', tags: ['GA', '출시'],
    });
  });

  it('updates existing YAML fields and removes cleared values', () => {
    const updated = updateDocumentMetadata('---\nstatus: active\ndue: 2026-09-01\n---\n# 계획', {
      status: 'done',
      dueDate: '',
      tags: [],
    });

    expect(updated).toContain('status: done');
    expect(updated).not.toMatch(/^due\s*:/m);
    expect(updated).not.toContain('tags::');
    expect(updated).toContain('# 계획');
  });
});
