import type { Task } from '../types.ts';

function isOpen(task: Task): boolean {
  return task.status === 'todo' || task.status === 'in-progress';
}

/**
 * Tasks that went from open to done in this edit and still carry no ✅ date:
 * a checkbox ticked straight in the editor, which writes `[x]` and nothing
 * else. Each one is matched to its earlier self by line and text, else by a
 * unique text match (lines shift when something above is added). A task with
 * no open counterpart was never seen open, so it is left alone: a pasted or
 * long-done `[x]` must not be stamped with today's date.
 */
export function newlyCompleted(before: readonly Task[], after: readonly Task[]): Task[] {
  const result: Task[] = [];
  for (const task of after) {
    if (task.status !== 'done' || task.doneDate !== undefined) continue;
    const sameLine = before.find(
      (prev) => prev.line === task.line && prev.description === task.description,
    );
    let prev = sameLine;
    if (prev === undefined) {
      const byText = before.filter((candidate) => candidate.description === task.description);
      prev = byText.length === 1 ? byText[0] : undefined;
    }
    if (prev !== undefined && isOpen(prev)) result.push(task);
  }
  return result;
}
