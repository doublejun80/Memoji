export interface Page {
  id: string;
  title: string;
  icon: string;
  parentId: string | null;
  content: string; // 마크다운 텍스트
  createdAt: string;
  updatedAt: string;
  type: 'page' | 'folder'; // 페이지 타입 추가
  tags: string[]; // 태그 배열 추가
  order: number; // 정렬 순서
}