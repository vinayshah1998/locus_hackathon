/**
 * In-memory Task Store for A2A protocol
 * Manages task lifecycle and state
 */

import { Task, TaskStatus, Message, Artifact } from './a2a-types.js';

export class TaskStore {
  private tasks: Map<string, Task> = new Map();
  private contextToTask: Map<string, string> = new Map();

  createTask(taskId: string, contextId: string, initialMessage?: Message): Task {
    const task: Task = {
      id: taskId,
      contextId,
      status: {
        state: 'submitted',
        timestamp: new Date().toISOString()
      },
      history: initialMessage ? [initialMessage] : [],
      artifacts: [],
      metadata: {}
    };

    this.tasks.set(taskId, task);
    this.contextToTask.set(contextId, taskId);
    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getTaskByContextId(contextId: string): Task | undefined {
    const taskId = this.contextToTask.get(contextId);
    if (taskId) {
      return this.tasks.get(taskId);
    }
    return undefined;
  }

  updateTaskStatus(taskId: string, status: TaskStatus): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.status = status;

    // Add status message to history if present
    if (status.message) {
      task.history = task.history || [];
      task.history.push(status.message);
    }

    return true;
  }

  addMessageToHistory(taskId: string, message: Message): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.history = task.history || [];
    task.history.push(message);
    return true;
  }

  addArtifact(taskId: string, artifact: Artifact): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.artifacts = task.artifacts || [];
    task.artifacts.push(artifact);
    return true;
  }

  setMetadata(taskId: string, key: string, value: unknown): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    task.metadata = task.metadata || {};
    task.metadata[key] = value;
    return true;
  }

  getMetadata(taskId: string, key: string): unknown | undefined {
    const task = this.tasks.get(taskId);
    if (!task || !task.metadata) {
      return undefined;
    }
    return task.metadata[key];
  }

  deleteTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    this.contextToTask.delete(task.contextId);
    this.tasks.delete(taskId);
    return true;
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  getTasksInState(state: string): Task[] {
    return Array.from(this.tasks.values()).filter(
      (task) => task.status.state === state
    );
  }

  // Get tasks waiting for user input
  getTasksRequiringInput(): Task[] {
    return this.getTasksInState('input-required');
  }

  // Clean up old completed/failed tasks
  cleanup(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      const taskAge = now - new Date(task.status.timestamp).getTime();
      const isFinalState = ['completed', 'cancelled', 'rejected', 'failed'].includes(
        task.status.state
      );

      if (isFinalState && taskAge > maxAgeMs) {
        this.deleteTask(taskId);
        cleaned++;
      }
    }

    return cleaned;
  }
}
