import { invoke } from '@tauri-apps/api/core';
import type {
  MarkdownTaskDto,
  TaskListRequest,
  UpdateTaskRequest,
} from '../../features/tasks/taskTypes';

export interface TaskApi {
  list(request: TaskListRequest): Promise<MarkdownTaskDto[]>;
  update(request: UpdateTaskRequest): Promise<MarkdownTaskDto>;
}

export const tauriTaskApi: TaskApi = {
  list: (request) => invoke('list_tasks', { request }),
  update: (request) => invoke('update_task', { request }),
};
