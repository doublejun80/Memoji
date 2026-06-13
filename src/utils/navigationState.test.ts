import { strict as assert } from 'node:assert';
import { resolvePageSelectionState } from './navigationState';

assert.deepEqual(
  resolvePageSelectionState({
    currentDateKey: '2026-06-12',
    pageDateKey: '2026-05-16',
    isProjectPage: true,
    requestedSource: 'project',
  }),
  {
    activeIndex: 'project',
    selectedDateKey: '2026-06-12',
  }
);

assert.deepEqual(
  resolvePageSelectionState({
    currentDateKey: '2026-06-12',
    pageDateKey: '2026-05-16',
    isProjectPage: true,
    requestedSource: 'daily',
  }),
  {
    activeIndex: 'daily',
    selectedDateKey: '2026-05-16',
  }
);

assert.deepEqual(
  resolvePageSelectionState({
    currentDateKey: '2026-06-12',
    pageDateKey: '2026-05-16',
    isProjectPage: true,
    requestedSource: 'global',
  }),
  {
    activeIndex: 'daily',
    selectedDateKey: '2026-05-16',
  }
);

assert.deepEqual(
  resolvePageSelectionState({
    currentDateKey: '2026-06-12',
    pageDateKey: null,
    isProjectPage: true,
    requestedSource: 'global',
  }),
  {
    activeIndex: 'project',
    selectedDateKey: '2026-06-12',
  }
);
