export interface Page {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  projectParentId?: string | null; // 프로젝트/사건 인덱스 트리 소속
  projectIndex?: boolean; // 프로젝트/사건 인덱스에 표시할지 여부
  dateKey?: string | null; // 데일리 인덱스 소속 날짜(YYYY-MM-DD), 없으면 프로젝트 전용
  content: string; // 마크다운 텍스트
  createdAt: string;
  updatedAt: string;
  type: 'page' | 'folder'; // 페이지 타입 추가
  tags: string[]; // 태그 배열 추가
  order: number; // 정렬 순서
}
