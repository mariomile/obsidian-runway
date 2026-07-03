import { isValidDayKey } from '../dates.ts';
import type { BodyToken, DateEmoji, ParsedTask, Priority, TaskStatus } from '../types.ts';

const TASK_RE = /^(\s*)([-*+]|\d+[.)])(\s+)\[(.)\](\s)(.*)$/;
const BLOCK_ID_RE = /(\s\^[A-Za-z0-9-]+)$/;

/**
 * One pass over the body: date fields (leading whitespace included in the
 * match), recurrence rules, and priority emojis. Everything between matches
 * stays raw text. Order matters: 🔁 swallows its rule text up to the next
 * field emoji, exactly like the Tasks plugin renders it.
 */
const TOKEN_RE =
  /(\s*)(?:([📅⏳✅❌🛫➕])[ \t]*(\d{4}-\d{2}-\d{2})|(🔁[^📅⏳✅❌➕🛫🔺⏫🔼🔽⏬]*)|([🔺⏫🔼🔽⏬]))/gu;

const DATE_EMOJIS: ReadonlySet<string> = new Set(['📅', '⏳', '✅', '❌']);

const PRIORITY_OF_EMOJI: Record<string, Priority> = {
  '🔺': 'highest',
  '⏫': 'high',
  '🔼': 'medium',
  '🔽': 'low',
  '⏬': 'lowest',
};

const STATUS_OF_CHAR: Record<string, TaskStatus> = {
  ' ': 'todo',
  x: 'done',
  X: 'done',
  '/': 'in-progress',
  '-': 'cancelled',
};

const TAG_RE = /#[\p{L}\p{N}_/-]+/gu;
const LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;

export function statusOfChar(char: string): TaskStatus {
  return STATUS_OF_CHAR[char] ?? 'unknown';
}

function tokenizeBody(body: string): BodyToken[] {
  const tokens: BodyToken[] = [];
  let blockId = '';
  const blockMatch = BLOCK_ID_RE.exec(body);
  if (blockMatch && blockMatch[1] !== undefined) {
    blockId = blockMatch[1];
    body = body.slice(0, blockMatch.index);
  }

  let text = '';
  let cursor = 0;
  TOKEN_RE.lastIndex = 0;
  for (const match of body.matchAll(TOKEN_RE)) {
    const whole = match[0];
    const leading = match[1] ?? '';
    const emoji = match[2];
    const date = match[3];
    const recurrence = match[4];
    const priority = match[5];

    const flushText = (): void => {
      text += body.slice(cursor, match.index);
      if (text !== '') {
        tokens.push({ kind: 'text', raw: text });
        text = '';
      }
    };

    if (emoji !== undefined && date !== undefined) {
      if (DATE_EMOJIS.has(emoji) && isValidDayKey(date)) {
        flushText();
        tokens.push({ kind: 'date', raw: whole, emoji: emoji as DateEmoji, date });
      } else if (!DATE_EMOJIS.has(emoji)) {
        // 🛫/➕ — recognized field of the Tasks plugin we do not manage.
        flushText();
        tokens.push({ kind: 'unknown', raw: whole });
      } else {
        // Malformed date on a managed emoji: leave it visible as text.
        text += body.slice(cursor, match.index) + whole;
      }
    } else if (recurrence !== undefined) {
      flushText();
      tokens.push({ kind: 'unknown', raw: leading + recurrence });
    } else if (priority !== undefined) {
      flushText();
      tokens.push({ kind: 'priority', raw: leading + priority, emoji: priority });
    }
    cursor = match.index + whole.length;
  }
  text += body.slice(cursor);
  if (text !== '') tokens.push({ kind: 'text', raw: text });
  if (blockId !== '') tokens.push({ kind: 'blockid', raw: blockId });
  return tokens;
}

function firstDate(tokens: BodyToken[], emoji: DateEmoji): string | undefined {
  for (const token of tokens) {
    if (token.kind === 'date' && token.emoji === emoji) return token.date;
  }
  return undefined;
}

export function parseTaskLine(raw: string): ParsedTask | null {
  const match = TASK_RE.exec(raw);
  if (!match) return null;
  const indent = match[1] ?? '';
  const listMarker = match[2] ?? '-';
  const gap = match[3] ?? ' ';
  const statusChar = match[4] ?? ' ';
  const sep = match[5] ?? ' ';
  const body = match[6] ?? '';

  const tokens = tokenizeBody(body);

  const textRaw = tokens
    .filter((token) => token.kind === 'text')
    .map((token) => token.raw)
    .join(' ');
  const description = textRaw.replace(/\s+/g, ' ').trim();

  let priority: Priority | null = null;
  for (const token of tokens) {
    if (token.kind === 'priority') {
      priority = PRIORITY_OF_EMOJI[token.emoji] ?? null;
      break;
    }
  }

  const tags = [...textRaw.matchAll(TAG_RE)].map((tag) => tag[0]);
  const links = [...textRaw.matchAll(LINK_RE)]
    .map((link) => (link[1] ?? '').trim())
    .filter((target) => target !== '');

  return {
    indent,
    listMarker,
    gap,
    statusChar,
    status: statusOfChar(statusChar),
    sep,
    tokens,
    description,
    due: firstDate(tokens, '📅'),
    scheduled: firstDate(tokens, '⏳'),
    doneDate: firstDate(tokens, '✅'),
    cancelledDate: firstDate(tokens, '❌'),
    priority,
    tags,
    links,
  };
}

export const PRIORITY_EMOJI: Record<Priority, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};
