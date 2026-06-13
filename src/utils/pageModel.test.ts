import { strict as assert } from 'node:assert';
import {
  getPageDateKey,
  getPagesForDate,
  getProjectIndexPages,
  getProjectParentId,
  normalizePage,
  sortPagesByProjectTree,
} from './pageModel';
import { Page } from '../types';

const legacyDailyPage: Page = {
  id: 'legacy-daily',
  title: '기존 날짜 메모',
  icon: '📄',
  parentId: null,
  content: 'old content',
  createdAt: '2026-05-01T09:30:00.000',
  updatedAt: '2026-05-01T09:30:00.000',
  type: 'page',
  tags: [],
  order: 2,
};

const normalizedLegacyDaily = normalizePage(legacyDailyPage, 0);

assert.equal(normalizedLegacyDaily.dateKey, '2026-05-01');
assert.equal(normalizedLegacyDaily.projectParentId, null);
assert.equal(getPageDateKey(normalizedLegacyDaily), '2026-05-01');
assert.equal(getProjectParentId(normalizedLegacyDaily), null);

const legacyProjectPage: Page = {
  id: 'legacy-project',
  title: '기존 날짜 메모',
  icon: '📄',
  parentId: 'legacy-folder',
  content: 'old content',
  createdAt: '2026-05-01T09:30:00.000',
  updatedAt: '2026-05-01T09:30:00.000',
  type: 'page',
  tags: [],
  order: 2,
};

const normalizedLegacyProject = normalizePage(legacyProjectPage, 0);

assert.equal(normalizedLegacyProject.dateKey, null);
assert.equal(normalizedLegacyProject.projectParentId, 'legacy-folder');
assert.equal(getPageDateKey(normalizedLegacyProject), null);
assert.equal(getProjectParentId(normalizedLegacyProject), 'legacy-folder');

const projectFolder: Page = normalizePage({
  id: 'project',
  title: '사건 A',
  icon: '📁',
  parentId: null,
  projectParentId: null,
  projectIndex: true,
  dateKey: null,
  content: '',
  createdAt: '2026-05-02T09:00:00.000',
  updatedAt: '2026-05-02T09:00:00.000',
  type: 'folder',
  tags: [],
  order: 1,
}, 0);

const datedProjectPage: Page = normalizePage({
  id: 'project-page',
  title: '사건 A 회의',
  icon: '📄',
  parentId: null,
  projectParentId: 'project',
  projectIndex: true,
  dateKey: '2026-05-03',
  content: 'project content',
  createdAt: '2026-05-03T12:00:00.000',
  updatedAt: '2026-05-03T12:00:00.000',
  type: 'page',
  tags: [],
  order: 0,
}, 1);

const dailyOnlyPage: Page = normalizePage({
  id: 'daily',
  title: '데일리 전용',
  icon: '📄',
  parentId: null,
  projectParentId: null,
  projectIndex: false,
  dateKey: '2026-05-03',
  content: 'daily content',
  createdAt: '2026-05-03T08:00:00.000',
  updatedAt: '2026-05-03T08:00:00.000',
  type: 'page',
  tags: [],
  order: 3,
}, 2);

assert.deepEqual(
  getPagesForDate([projectFolder, datedProjectPage, dailyOnlyPage], '2026-05-03').map(page => page.id),
  ['project-page', 'daily']
);

assert.deepEqual(
  sortPagesByProjectTree([dailyOnlyPage, datedProjectPage, projectFolder]).map(page => page.id),
  ['project', 'project-page', 'daily']
);

assert.deepEqual(
  getProjectIndexPages([dailyOnlyPage, datedProjectPage, projectFolder]).map(page => page.id),
  ['project', 'project-page']
);

const cyclicA: Page = normalizePage({
  id: 'cyclic-a',
  title: '순환 A',
  projectParentId: 'cyclic-b',
  projectIndex: true,
  dateKey: null,
  createdAt: '2026-05-04T08:00:00.000',
  updatedAt: '2026-05-04T08:00:00.000',
  type: 'page',
  tags: [],
  order: 0,
}, 0);

const cyclicB: Page = normalizePage({
  id: 'cyclic-b',
  title: '순환 B',
  projectParentId: 'cyclic-a',
  projectIndex: true,
  dateKey: null,
  createdAt: '2026-05-04T08:00:00.000',
  updatedAt: '2026-05-04T08:00:00.000',
  type: 'page',
  tags: [],
  order: 1,
}, 1);

assert.deepEqual(
  sortPagesByProjectTree([cyclicA, cyclicB]).map(page => page.id).sort(),
  ['cyclic-a', 'cyclic-b']
);
