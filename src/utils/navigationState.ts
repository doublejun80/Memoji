import type { PageNavigationIndex, PageSelectionSource } from '../types';

interface ResolvePageSelectionStateArgs {
  currentDateKey: string;
  pageDateKey: string | null;
  isProjectPage: boolean;
  requestedSource?: PageSelectionSource;
}

interface PageSelectionState {
  activeIndex: PageNavigationIndex;
  selectedDateKey: string;
}

export const resolvePageSelectionState = ({
  currentDateKey,
  pageDateKey,
  isProjectPage,
  requestedSource = 'global',
}: ResolvePageSelectionStateArgs): PageSelectionState => {
  const activeIndex: PageNavigationIndex = requestedSource === 'global'
    ? pageDateKey
      ? 'daily'
      : isProjectPage
        ? 'project'
        : 'daily'
    : requestedSource;

  return {
    activeIndex,
    selectedDateKey: requestedSource === 'project' || !pageDateKey
      ? currentDateKey
      : pageDateKey,
  };
};
