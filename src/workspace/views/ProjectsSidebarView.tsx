import { Sidebar, type SidebarProps } from '../../components/Sidebar';

export function ProjectsSidebarView(props: SidebarProps) {
  return <Sidebar {...props} forcedIndex="project" hideIndexSwitcher />;
}
