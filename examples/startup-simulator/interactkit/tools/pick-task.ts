import type { DeveloperEntity } from '../.generated/types.js';

export default async (entity: DeveloperEntity): Promise<string> => {
  const tasks = await entity.refs.taskBoard.getTasks();
  const todo = tasks.find((t: any) => t.status === 'todo');
  if (todo) {
    entity.state.currentTaskId = todo.id;
    await entity.refs.taskBoard.moveTask({ id: todo.id, status: 'in-progress' });
    return todo.id;
  }
  return '';
};
