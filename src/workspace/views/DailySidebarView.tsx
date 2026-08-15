import { Sidebar, type SidebarProps } from '../../components/Sidebar';

export function DailySidebarView(props: SidebarProps) {
  return <Sidebar {...props} forcedIndex="daily" hideIndexSwitcher />;
}
