import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, screen, userEvent } from '../test/render';
import type { Page } from '../types';
import { OutlinePanel, parseOutline } from './OutlinePanel';

const page = {
  id: 'p1', title: '개요', icon: '', parentId: null, content: '# 목표\n## 범위\n## 범위',
  createdAt: '', updatedAt: '', type: 'page', tags: [], order: 0,
} as Page;

describe('OutlinePanel', () => {
  it('creates stable duplicate slugs', () => {
    expect(parseOutline(page.content).map((heading) => heading.id)).toEqual(['목표', '범위', '범위-2']);
  });

  it('marks a clicked heading active while navigating', async () => {
    const navigate = vi.fn();
    window.addEventListener('memoji:outline-navigate', navigate, { once: true });
    renderWithProviders(<OutlinePanel page={page} />);
    const heading = screen.getByRole('button', { name: /목표/ });
    await userEvent.click(heading);
    expect(navigate).toHaveBeenCalled();
    expect(heading).toHaveAttribute('data-active', 'true');
  });
});
