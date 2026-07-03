import { parseTaskLine, PRIORITY_EMOJI } from './parse.ts';
import type {
  BodyToken,
  DateEmoji,
  DayKey,
  ParsedTask,
  Priority,
  TaskStatus,
} from '../types.ts';

export function serializeTask(task: ParsedTask): string {
  const body = task.tokens.map((token) => token.raw).join('');
  return `${task.indent}${task.listMarker}${task.gap}[${task.statusChar}]${task.sep}${body}`;
}

/** Ensure a token inserted after another starts with whitespace. */
function padded(raw: string): string {
  return /^\s/.test(raw) ? raw : ` ${raw}`;
}

/** Insert `token` before the trailing block ID, if any, else append. */
function insertNearEnd(tokens: BodyToken[], token: BodyToken): BodyToken[] {
  const last = tokens[tokens.length - 1];
  if (last !== undefined && last.kind === 'blockid') {
    return [...tokens.slice(0, -1), token, last];
  }
  return [...tokens, token];
}

function withDate(tokens: BodyToken[], emoji: DateEmoji, date: DayKey): BodyToken[] {
  let replaced = false;
  const next = tokens.map((token) => {
    if (token.kind === 'date' && token.emoji === emoji && !replaced) {
      replaced = true;
      return { ...token, date, raw: token.raw.replace(/\d{4}-\d{2}-\d{2}/, date) };
    }
    return token;
  });
  if (replaced) return next;
  const raw = tokens.length === 0 ? `${emoji} ${date}` : ` ${emoji} ${date}`;
  return insertNearEnd(next, { kind: 'date', raw, emoji, date });
}

function withoutDate(tokens: BodyToken[], emoji: DateEmoji): BodyToken[] {
  return tokens.filter((token) => !(token.kind === 'date' && token.emoji === emoji));
}

/** Line-level ops: parse → token op → serialize. A non-task line is returned unchanged. */

export function rewriteDate(line: string, emoji: DateEmoji, date: DayKey): string {
  const task = parseTaskLine(line);
  if (!task) return line;
  return serializeTask({ ...task, tokens: withDate(task.tokens, emoji, date) });
}

export function removeDateField(line: string, emoji: DateEmoji): string {
  const task = parseTaskLine(line);
  if (!task) return line;
  return serializeTask({ ...task, tokens: withoutDate(task.tokens, emoji) });
}

export function rewritePriority(line: string, priority: Priority | null): string {
  const task = parseTaskLine(line);
  if (!task) return line;
  const kept = task.tokens.filter((token) => token.kind !== 'priority');
  if (priority === null) {
    return serializeTask({ ...task, tokens: kept });
  }
  const emoji = PRIORITY_EMOJI[priority];
  const token: BodyToken = { kind: 'priority', raw: ` ${emoji}`, emoji };
  // Tasks-plugin convention: priority sits after the description, before dates.
  const firstField = kept.findIndex((candidate) => candidate.kind !== 'text');
  const tokens =
    firstField === -1
      ? [...kept, token]
      : [...kept.slice(0, firstField), token, ...kept.slice(firstField)];
  return serializeTask({ ...task, tokens });
}

const CHAR_OF_STATUS: Record<Exclude<TaskStatus, 'unknown'>, string> = {
  todo: ' ',
  done: 'x',
  'in-progress': '/',
  cancelled: '-',
};

/**
 * Status transitions, Tasks-plugin style: done gains `✅ today`, reopening
 * drops `✅` (and `❌`). Unknown status chars are never touched.
 */
export function transitionStatus(
  line: string,
  target: Exclude<TaskStatus, 'unknown'>,
  today: DayKey,
): string {
  const task = parseTaskLine(line);
  if (!task || task.status === 'unknown') return line;
  let tokens = task.tokens;
  if (target === 'done') {
    tokens = withDate(tokens, '✅', today);
  } else if (target === 'todo' || target === 'in-progress') {
    tokens = withoutDate(withoutDate(tokens, '✅'), '❌');
  }
  return serializeTask({ ...task, statusChar: CHAR_OF_STATUS[target], tokens });
}

/**
 * Replace the descriptive text, keeping every field token. The new text
 * becomes the leading token; field tokens follow in their original order.
 */
export function rewriteDescription(line: string, text: string): string {
  const task = parseTaskLine(line);
  if (!task) return line;
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return line;
  const fields = task.tokens
    .filter((token) => token.kind !== 'text')
    .map((token) => ({ ...token, raw: padded(token.raw) }));
  return serializeTask({
    ...task,
    tokens: [{ kind: 'text', raw: trimmed }, ...fields],
  });
}
