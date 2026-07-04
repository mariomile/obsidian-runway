import { boundedNumber } from './utils.ts';
import type { RunwaySettings, TaskGroup, TaskSort } from './types.ts';

export const DEFAULT_SETTINGS: RunwaySettings = {
  excludeFolders: ['.archive', '.claude', '_system', 'Resources/Templates'],
  inboxFolders: ['_inbox', 'Journal/Daily'],
  sidebarUpcomingDays: 7,
  dailyFolder: 'Journal/Daily',
  dailyFormat: 'DD-MM-YYYY',
  quickAddHeading: '',
  defaultSort: 'due',
  defaultGroup: 'note',
};

const SORTS: readonly TaskSort[] = ['due', 'priority', 'path'];
const GROUPS: readonly TaskGroup[] = ['none', 'note', 'date', 'priority', 'tag', 'folder'];

export function parseSettings(data: unknown): RunwaySettings {
  if (!isRecord(data)) return structuredClone(DEFAULT_SETTINGS);
  return {
    excludeFolders: stringList(data.excludeFolders, DEFAULT_SETTINGS.excludeFolders),
    inboxFolders: stringList(data.inboxFolders, DEFAULT_SETTINGS.inboxFolders),
    sidebarUpcomingDays: boundedNumber(
      data.sidebarUpcomingDays,
      DEFAULT_SETTINGS.sidebarUpcomingDays,
      0,
      31,
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
