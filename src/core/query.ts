import { addDays, agendaDayLabel, compareDayKeys } from '../dates.ts';
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
  exactDay: null,
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
 * Date-driven vaults often schedule more work than they deadline — views
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
    case 'upcoming':
      return date !== undefined && compareDayKeys(date, today) > 0;
  }
}

function matchesTag(taskTags: string[], wanted: string): boolean {
  return taskTags.some((tag) => tag === wanted || tag.startsWith(`${wanted}/`));
}

export function matchesTask(task: Task, filter: TaskFilter, today: DayKey): boolean {
  if (filter.statuses.length > 0 && !filter.statuses.includes(task.status)) return false;
  if (filter.exactDay) {
    if (taskDate(task) !== filter.exactDay) return false;
  }
  if (filter.tags.length > 0 && !filter.tags.some((tag) => matchesTag(task.tags, tag))) {
    return false;
  }
  if (filter.folder !== null && filter.folder !== '') {
    const prefix = filter.folder.endsWith('/') ? filter.folder : `${filter.folder}/`;
    if (!task.path.startsWith(prefix)) return false;
  }
  if (!filter.exactDay && !matchesDue(task, filter.due, today)) return false;
  if (
    filter.priorities !== null &&
    (task.priority === null || !filter.priorities.includes(task.priority))
  ) {
    return false;
  }

  const query = normalizeText(filter.text.trim());
  if (query === '') return true;
  const haystack = normalizeText(
    `${task.description} ${task.note ?? ''} ${task.path} ${task.tags.join(' ')}`,
  );
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
  sublabel?: string;
}

/** Fallback horizon for the Agenda grouping when the caller passes none. */
export const DEFAULT_AGENDA_HORIZON = 14;

export interface QueryOptions {
  /** Folder prefixes whose tasks land in the pinned Inbox bucket of the note grouping. */
  inboxFolders?: string[];
  /** Days ahead the Agenda grouping keeps per-day before folding into "Later". */
  agendaHorizonDays?: number;
}

function isInboxPath(path: string, inboxFolders: string[]): boolean {
  return inboxFolders.some((folder) => {
    const prefix = folder.replace(/\/+$/, '');
    return prefix !== '' && (path === prefix || path.startsWith(`${prefix}/`));
  });
}

function noteName(path: string): string {
  const slash = path.lastIndexOf('/');
  return path.slice(slash + 1).replace(/\.md$/, '');
}

/** Full containing folder ('' for a vault-root note). */
function parentFolder(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Inbox first, then one bucket per source note, ordered by path. */
function noteGroup(task: Task, inboxFolders: string[]): GroupSpec {
  if (isInboxPath(task.path, inboxFolders)) {
    return { key: '0-inbox', label: 'Inbox' };
  }
  return { key: `1-${task.path}`, label: noteName(task.path) };
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

/**
 * One bucket per calendar day from today to today+horizon, with past-due folded
 * into a single Overdue bucket up top and anything beyond the horizon into
 * "Later". Keys sort chronologically: `a-overdue` < `b-<ISO>` (ISO days sort
 * lexically) < `y-later` < `zz-none`, so empty days simply never produce a
 * bucket. The day label is split into a primary word + a faint date sublabel.
 */
function agendaGroup(task: Task, today: DayKey, horizonDays: number): GroupSpec {
  const date = taskDate(task);
  if (date === undefined) return { key: 'zz-none', label: 'No date' };
  if (compareDayKeys(date, today) < 0) return { key: 'a-overdue', label: 'Overdue' };
  if (compareDayKeys(date, addDays(today, horizonDays)) > 0) {
    return { key: 'y-later', label: 'Later' };
  }
  const { primary, secondary } = agendaDayLabel(date, today);
  return { key: `b-${date}`, label: primary, sublabel: secondary };
}

function groupSpec(
  task: Task,
  group: TaskGroup,
  today: DayKey,
  options: QueryOptions,
): GroupSpec {
  switch (group) {
    case 'none':
      return { key: 'all', label: '' };
    case 'note':
      return noteGroup(task, options.inboxFolders ?? []);
    case 'date':
      return dateGroup(task, today);
    case 'agenda':
      return agendaGroup(task, today, options.agendaHorizonDays ?? DEFAULT_AGENDA_HORIZON);
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
      const dir = parentFolder(task.path);
      return dir === '' ? { key: '', label: 'Vault root' } : { key: dir, label: dir };
    }
  }
}

export function queryTasks(
  tasks: Task[],
  filter: TaskFilter,
  sort: TaskSort,
  group: TaskGroup,
  today: DayKey,
  options: QueryOptions = {},
): TaskGroupResult[] {
  const matched = sortTasks(
    tasks.filter((task) => matchesTask(task, filter, today)),
    sort,
  );
  const groups = new Map<string, TaskGroupResult>();
  for (const task of matched) {
    const spec = groupSpec(task, group, today, options);
    let bucket = groups.get(spec.key);
    if (!bucket) {
      bucket = { key: spec.key, label: spec.label, sublabel: spec.sublabel, tasks: [] };
      groups.set(spec.key, bucket);
    }
    bucket.tasks.push(task);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}
