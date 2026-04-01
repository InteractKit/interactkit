import {
  Entity,
  BaseEntity,
  State,
  Tool,
  Describe,
} from "@interactkit/sdk";
import { randomUUID } from "node:crypto";

interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  status: "backlog" | "in-progress" | "review" | "done";
  createdBy: string;
  createdAt: number;
}

@Entity({ description: "Kanban task board for tracking work" })
export class TaskBoard extends BaseEntity {
  @State({ description: "All tasks" })
  private tasks: Task[] = [];

  @Describe()
  describe() {
    const counts = { backlog: 0, "in-progress": 0, review: 0, done: 0 };
    for (const t of this.tasks) counts[t.status]++;
    return `TaskBoard: ${this.tasks.length} tasks — backlog:${counts.backlog} in-progress:${counts["in-progress"]} review:${counts.review} done:${counts.done}`;
  }

  @Tool({ description: "Add a new task to the backlog" })
  async addTask(input: {
    title: string;
    description: string;
    assignee: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const id = randomUUID();
    this.tasks.push({
      id,
      title: input.title,
      description: input.description,
      assignee: input.assignee,
      status: "backlog",
      createdBy: input.createdBy,
      createdAt: Date.now(),
    });
    return { id };
  }

  @Tool({ description: "Move a task to a new status" })
  async moveTask(input: {
    id: string;
    status: "backlog" | "in-progress" | "review" | "done";
  }): Promise<void> {
    const task = this.tasks.find((t) => t.id === input.id);
    if (task) task.status = input.status;
  }

  @Tool({
    description: "Get all tasks, optionally filtered by status or assignee",
  })
  async getTasks(input: {
    status?: string;
    assignee?: string;
  }): Promise<Task[]> {
    return this.tasks.filter((t) => {
      if (input.status && t.status !== input.status) return false;
      if (input.assignee && t.assignee !== input.assignee) return false;
      return true;
    });
  }

  @Tool({ description: "Get a specific task by ID" })
  async getTask(input: { id: string }): Promise<Task | null> {
    return this.tasks.find((t) => t.id === input.id) ?? null;
  }
}
