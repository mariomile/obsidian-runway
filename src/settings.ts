import { DEFAULT_FILTER } from './core/query.ts';
import { boundedNumber } from './utils.ts';
import type { RunwaySettings, SavedView, TaskFilter, TaskGroup, TaskSort } from './types.ts';

export const DEFAULT_SETTINGS: RunwaySettings = {
  excludeFolders: ['.archive'],
  inboxFolders: ['_inbox'],
  savedViews: [],
  sidebarUpcomingDays: 7,
  agendaHorizonDays: 14,
  dailyFolder: '',
  dailyFormat: 'YYYY-MM-DD',
  quickAddHeading: '',
  defaultSort: 'due',
  defaultGroup: 'note',
};

const SORTS: readonly TaskSort[] = ['due', 'priority', 'path'];
const GROUPS: readonly TaskGroup[] = ['none', 'note', 'date', 'agenda', 'priority', 'tag', 'folder'];

function parseSavedViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  const views: SavedView[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || entry.name === '') continue;
    views.push({
      name: entry.name,
      filter: { ...structuredClone(DEFAULT_FILTER), ...(isRecord(entry.filter) ? (entry.filter as Partial<TaskFilter>) : {}) },
      sort: oneOf(entry.sort, SORTS, DEFAULT_SETTINGS.defaultSort),
      group: oneOf(entry.group, GROUPS, DEFAULT_SETTINGS.defaultGroup),
    });
  }
  return views;
}

export function parseSettings(data: unknown): RunwaySettings {
  if (!isRecord(data)) return structuredClone(DEFAULT_SETTINGS);
  return {
    excludeFolders: stringList(data.excludeFolders, DEFAULT_SETTINGS.excludeFolders),
    inboxFolders: stringList(data.inboxFolders, DEFAULT_SETTINGS.inboxFolders),
    savedViews: parseSavedViews(data.savedViews),
    sidebarUpcomingDays: boundedNumber(
      data.sidebarUpcomingDays,
      DEFAULT_SETTINGS.sidebarUpcomingDays,
      0,
      31,
    ),
    agendaHorizonDays: boundedNumber(
      data.agendaHorizonDays,
      DEFAULT_SETTINGS.agendaHorizonDays,
      1,
      60,
    ),
    dailyFolder: stringValue(data.dailyFolder, DEFAULT_SETTINGS.dailyFolder),
    dailyFormat: stringValue(data.dailyFormat, DEFAULT_SETTINGS.dailyFormat),
    quickAddHeading: stringValue(data.quickAddHeading, DEFAULT_SETTINGS.quickAddHeading),
    defaultSort: oneOf(data.defaultSort, SORTS, DEFAULT_SETTINGS.defaultSort),
    defaultGroup: oneOf(data.defaultGroup, GROUPS, DEFAULT_SETTINGS.defaultGroup),
  };
}

/** Normalized exclusion predicate: folder prefixes, `/`-agnostic. */
export function isExcludedPath(path: string, excludeFolders: string[]): boolean {
  for (const folder of excludeFolders) {
    const prefix = folder.replace(/\/+$/, '');
    if (prefix === '') continue;
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}
