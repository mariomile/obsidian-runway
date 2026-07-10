import { DEFAULT_FILTER } from './query.ts';
import type { DayKey, Task, TaskFilter, TaskGroup, TaskStatus } from '../types.ts';

export type ViewId = 'inbox' | 'today' | 'upcoming' | 'all';

export const VIEW_IDS: readonly ViewId[] = ['inbox', 'today', 'upcoming', 'all'];

export const VIEW_LABELS: Record<ViewId, string> = {
  inbox: 'Inbox',
  today: 'Today',
  upcoming: 'Upcoming',
  all: 'All',
};

export interface ViewContext {
  /** Current calendar day (render-time). */
  today: DayKey;
  /** Path of today's daily note (from dailyNotePath). */
  dailyPath: string;
}

export interface ResolvedView {
  filter: TaskFilter;
  group: TaskGroup;
  /** Today only: OR-branch admitting tasks that live in today's daily note. */
  include?: (task: Task) => boolean;
  /** Group keys to pin to the top (Today's daily note). */
  pinnedGroupKeys?: string[];
}

const OPEN: TaskStatus[] = ['todo', 'in-progress'];

function withFilter(over: Partial<TaskFilter>): TaskFilter {
  return { ...DEFAULT_FILTER, statuses: [...OPEN], ...over };
}

export function resolveView(view: ViewId, ctx: ViewContext): ResolvedView {
  switch (view) {
    case 'inbox':
      return { filter: withFilter({ due: 'none' }), group: 'note' };
    case 'today':
      return {
        filter: withFilter({ due: 'today' }),
        group: 'note',
        include: (task) => task.path === ctx.dailyPath,
        pinnedGroupKeys: [`1-${ctx.dailyPath}`],
      };
    case 'upcoming':
      return { filter: withFilter({ due: 'upcoming' }), group: 'agenda' };
    case 'all':
      return { filter: withFilter({ due: 'all', statuses: [] }), group: 'note' };
  }
}
