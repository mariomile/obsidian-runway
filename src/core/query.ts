import { addDays, compareDayKeys } from '../dates.ts';
import { normalizeText } from '../utils.ts';
import type {
  DayKey,
  Priority,
  Task,
  TaskFilter,
  TaskGroup,
  TaskGroupResult,
  TaskSort,
} from '../types.ts';

export const DEFAULT_FILTER: TaskFilter = {
  text: '',
  statuses: ['todo', 'in-progress'],
  tags: [],
  folder: null,
  due: 'all',
  priorities: null,
};

const PRIORITY_RANK: Record<Priority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4,
};

function priorityRank(priority: Priority | null): number {
  return priority === null ? 5 : PRIORITY_RANK[priority];
}

/**
 * The date a task "lives on": the 📅 due date, else the ⏳ scheduled date.
 * Mario's vault schedules far more than it deadlines — date-driven views
 * would be empty if they looked at 📅 alone.
 */
export function taskDate(task: Task): DayKey | undefined {
  return task.due ?? task.scheduled;
}

function matchesDue(task: Task, due: TaskFilter['due'], today: DayKey): boolean {
  const date = taskDate(task);
  switch (due) {
    case 'all':
      return true;
    case 'none':
      return date === undefined;
    case 'overdue':
      return date !== undefined && compareDayKeys(date, today) < 0;
    case 'today':
      return date !== undefined && compareDayKeys(date, today) <= 0;
    case 'week':
      return date !== undefined && compareDayKeys(date, addDays(today, 7)) <= 0;
  }
}

function matchesTag(taskTags: string[], wanted: string): boolean {
  return taskTags.some((tag) => tag === wanted || tag.startsWith(`${wanted}/`));
}

export function matchesTask(task: Task, filter: TaskFilter, today: DayKey): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(task.status)) return false;
  if (filter.tags.length > 0 && !filter.tags.some((tag) => matchesTag(task.tags, tag))) {
    return false;
  }
  if (filter.folder !== null && filter.folder !== '') {
    const prefix = filter.folder.endsWith('/') ? filter.folder : `${filter.folder}/`;
    if (!task.path.startsWith(prefix)) return false;
  }
  if (!matchesDue(task, filter.due, today)) return false;
  if (
    filter.priorities !== null &&
    (task.priority === null || !filter.priorities.includes(task.priority))
  ) {
    return false;
  }

  const query = normalizeText(filter.text.trim());
  if (query === '') return true;
  const haystack = normalizeText(`${task.description} ${task.path} ${task.tags.join(' ')}`);
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  const byPath = (a: Task, b: Task): number =>
    a.path.localeCompare(b.path) || a.line - b.line;
  const byDue = (a: Task, b: Task): number => {
    const dateA = taskDate(a);
    const dateB = taskDate(b);
    if (dateA === undefined && dateB === undefined) return 0;
    if (dateA === undefined) return 1;
    if (dateB === undefined) return -1;
    return compareDayKeys(dateA, dateB);
  };
  const byPriority = (a: Task, b: Task): number =>
    priorityRank(a.priority) - priorityRank(b.priority);

  return [...tasks].sort((a, b) => {
    switch (sort) {
      case 'due':
        return byDue(a, b) || byPriority(a, b) || byPath(a, b);
      case 'priority':
        return byPriority(a, b) || byDue(a, b) || byPath(a, b);
      case 'path':
        return byPath(a, b);
    }
  });
}

interface GroupSpec {
  key: string;
  label: string;
}

function dateGroup(task: Task, today: DayKey): GroupSpec {
  const date = taskDate(task);
  if (date === undefined) return { key: 'zz-none', label: 'No date' };
  const cmp = compareDayKeys(date, today);
  if (cmp < 0) return { key: 'a-overdue', label: 'Overdue' };
  if (cmp === 0) return { key: 'b-today', label: 'Today' };
  if (compareDayKeys(date, addDays(today, 7)) <= 0) {
    return { key: 'c-week', label: 'Next 7 days' };
  }
  return { key: 'd-later', label: 'Later' };
}

function groupSpec(task: Task, group: TaskGroup, today: DayKey): GroupSpec {
  switch (group) {
    case 'none':
      return { key: 'all', label: '' };
    case 'date':
      return dateGroup(task, today);
    case 'priority': {
      const priority = task.priority;
      return priority === null
        ? { key: '5-none', label: 'No priority' }
        : { key: `${PRIORITY_RANK[priority]}-${priority}`, label: priority };
    }
    case 'tag': {
      const tag = task.tags[0];
      return tag === undefined ? { key: 'zz-none', label: 'No tag' } : { key: tag, label: tag };
    }
    case 'folder': {
      const folder = task.folder === '' ? 'Vault root' : task.folder;
      return { key: folder, label: folder };
    }
  }
}

export function queryTasks(
  tasks: Task[],
  filter: TaskFilter,
  sort: TaskSort,
  group: TaskGroup,
  today: DayKey,
): TaskGroupResult[] {
  const matched = sortTasks(
    tasks.filter((task) => matchesTask(task, filter, today)),
    sort,
  );
  const groups = new Map<string, TaskGroupResult>();
  for (const task of matched) {
    const spec = groupSpec(task, group, today);
    let bucket = groups.get(spec.key);
    if (!bucket) {
      bucket = { key: spec.key, label: spec.label, tasks: [] };
      groups.set(spec.key, bucket);
    }
    bucket.tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
