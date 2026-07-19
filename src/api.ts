import { todayKey } from './dates.ts';
import { DEFAULT_FILTER, matchesTask, sortTasks } from './core/query.ts';
import { PRIORITY_EMOJI } from './core/parse.ts';
import type { TaskEditService, TaskRef } from './edits/task-edit.ts';
import type { TaskIndexService } from './index/index-service.ts';
import type { DayKey, Priority, Task, TaskFilter } from './types.ts';

/** Plain task shape handed to agents (Exo). Carries the ref needed to mutate. */
export interface TaskDTO {
  path: string;
  line: number;
  rawText: string;
  description: string;
  status: Task['status'];
  statusChar: string;
  done: boolean;
  recurring: boolean;
  due?: DayKey;
  scheduled?: DayKey;
  doneDate?: DayKey;
  cancelledDate?: DayKey;
  priority: Priority | null;
  tags: string[];
}

function toDTO(task: Task): TaskDTO {
  return {
    path: task.path,
    line: task.line,
    rawText: task.rawText,
    description: task.description,
    status: task.status,
    statusChar: task.statusChar,
    done: task.status === 'done',
    recurring: task.tokens.some((token) => token.kind === 'unknown' && token.raw.includes('🔁')),
    due: task.due,
    scheduled: task.scheduled,
    doneDate: task.doneDate,
    cancelledDate: task.cancelledDate,
    priority: task.priority,
    tags: task.tags,
  };
}

function toRef(task: TaskDTO): TaskRef {
  return { path: task.path, line: task.line, rawText: task.rawText };
}

export interface CreateTaskOptions {
  due?: DayKey;
  priority?: Priority;
  /** Defaults to today's daily note. */
  targetPath?: string;
}

/**
 * Stable programmatic surface for agents (Exo) and sibling plugins.
 * Reachable at `app.plugins.plugins.runway.api`.
 */
export interface RunwayApi {
  isReady(): boolean;
  subscribe(listener: () => void): () => void;
  allTasks(): TaskDTO[];
  query(filter: Partial<TaskFilter>): TaskDTO[];
  overdue(): TaskDTO[];
  today(): TaskDTO[];
  createTask(description: string, options?: CreateTaskOptions): Promise<string | null>;
  completeTask(task: TaskDTO): Promise<boolean>;
  reschedule(task: TaskDTO, date: DayKey): Promise<boolean>;
  setPriority(task: TaskDTO, priority: Priority | null): Promise<boolean>;
  setNote(task: TaskDTO, text: string): Promise<boolean>;
  moveToNote(task: TaskDTO, targetPath: string): Promise<boolean>;
  openForDay(day: DayKey): Promise<void>;
}

export function createRunwayApi(
  index: TaskIndexService,
  edits: TaskEditService,
  openDay: (day: DayKey) => Promise<void>,
): RunwayApi {
  const run = (filter: Partial<TaskFilter>): TaskDTO[] => {
    const merged: TaskFilter = { ...DEFAULT_FILTER, ...filter };
    const today = todayKey();
    return sortTasks(
      index.all().filter((task) => matchesTask(task, merged, today)),
      'due',
    ).map(toDTO);
  };

  return {
    isReady() {
      return index.isReady();
    },
    subscribe(listener) {
      return index.subscribe(listener);
    },
    allTasks() {
      return index.all().map(toDTO);
    },
    query(filter) {
      return run(filter);
    },
    overdue() {
      return run({ due: 'overdue' });
    },
    today() {
      return run({ due: 'today' });
    },
    async createTask(description, options = {}) {
      let body = description.trim();
      if (options.priority) body += ` ${PRIORITY_EMOJI[options.priority]}`;
      if (options.due) body += ` 📅 ${options.due}`;
      return edits.quickAdd(body, options.targetPath);
    },
    completeTask(task) {
      return edits.setStatus(toRef(task), 'done');
    },
    reschedule(task, date) {
      return edits.reschedule(toRef(task), date);
    },
    setPriority(task, priority) {
      return edits.setPriority(toRef(task), priority);
    },
    setNote(task, text) {
      return edits.setNote(toRef(task), text);
    },
    moveToNote(task, targetPath) {
      return edits.moveToNote(toRef(task), targetPath);
    },
    openForDay(day) {
      return openDay(day);
    },
  };
}
