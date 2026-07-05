/** Calendar day in YYYY-MM-DD form. */
export type DayKey = string;

export type TaskStatus = 'todo' | 'done' | 'in-progress' | 'cancelled' | 'unknown';

export type Priority = 'highest' | 'high' | 'medium' | 'low' | 'lowest';

/** Emoji date fields the plugin understands (Tasks-plugin syntax). */
export type DateEmoji = '📅' | '⏳' | '✅' | '❌';

/**
 * Lossless body token: concatenating `raw` in order rebuilds the exact body.
 * Field tokens carry their own leading whitespace so removal never leaves
 * double spaces and round-trips are byte-identical.
 */
export type BodyToken =
  | { kind: 'text'; raw: string }
  | { kind: 'date'; raw: string; emoji: DateEmoji; date: DayKey }
  | { kind: 'priority'; raw: string; emoji: string }
  | { kind: 'blockid'; raw: string }
  /** 🛫/➕ dates, 🔁 rules — preserved verbatim, never surfaced or edited. */
  | { kind: 'unknown'; raw: string };

export interface ParsedTask {
  indent: string;
  /** '-', '*', '+', '1.', '1)' */
  listMarker: string;
  /** Whitespace between the list marker and '['. */
  gap: string;
  /** Raw char inside [ ]. */
  statusChar: string;
  status: TaskStatus;
  /** Whitespace char between ']' and the body. */
  sep: string;
  tokens: BodyToken[];
  // Derived, read-only conveniences (recomputed on every parse):
  description: string;
  due?: DayKey;
  scheduled?: DayKey;
  doneDate?: DayKey;
  cancelledDate?: DayKey;
  priority: Priority | null;
  tags: string[];
  links: string[];
}

/** A parsed task anchored to a vault location. */
export interface Task extends ParsedTask {
  path: string;
  line: number;
  rawText: string;
  /** Top-level folder ('' for vault root). */
  folder: string;
  /** An attached note (the indented child line below the task), if any. */
  note?: string;
}

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'upcoming' | 'none';

export interface TaskFilter {
  /** Free text, all terms must match (description + path + tags). */
  text: string;
  /** Empty array = no status filter. */
  statuses: TaskStatus[];
  /** OR semantics; matches exact tag or namespace prefix. Empty = all. */
  tags: string[];
  /** Path prefix ('' or null = all). */
  folder: string | null;
  due: DueFilter;
  /** Exact effective-date match (deep-link / Horizon cross-link). Overrides `due`. */
  exactDay?: DayKey | null;
  /** null = all priorities. */
  priorities: Priority[] | null;
}

export type TaskSort = 'due' | 'priority' | 'path';

export type TaskGroup = 'none' | 'note' | 'date' | 'priority' | 'tag' | 'folder';

export interface TaskGroupResult {
  key: string;
  label: string;
  tasks: Task[];
}

export interface SavedView {
  name: string;
  filter: TaskFilter;
  sort: TaskSort;
  group: TaskGroup;
}

export interface RunwaySettings {
  /** Folder path prefixes excluded from indexing (.obsidian is always excluded). */
  excludeFolders: string[];
  /** Folders whose tasks are "not yet filed" — pinned as Inbox in the note grouping. */
  inboxFolders: string[];
  /** User-named filter/sort/group presets. */
  savedViews: SavedView[];
  /** Days ahead shown in the sidebar Upcoming section. */
  sidebarUpcomingDays: number;
  /** Daily note folder for quick-add default target. */
  dailyFolder: string;
  /** Daily note filename format using DD/MM/YYYY tokens. */
  dailyFormat: string;
  /** Heading under which quick-add appends ('' = end of file). */
  quickAddHeading: string;
  /** Defaults for the list view toolbar. */
  defaultSort: TaskSort;
  defaultGroup: TaskGroup;
}
