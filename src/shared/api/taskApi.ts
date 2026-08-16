import { invoke } from '@tauri-apps/api/core';
import { TAURI_COMMANDS } from './tauriCommands';
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
  list: (request) => invoke(TAURI_COMMANDS.listTasks, { request }),
  update: (request) => invoke(TAURI_COMMANDS.updateTask, { request }),
};
