import { parseDayKey } from '../dates.ts';
import type { DayKey, RunwaySettings } from '../types.ts';

/** Minimal date formatter: YYYY / MM / DD tokens only. */
export function formatDayKey(key: DayKey, format: string): string {
  const ymd = parseDayKey(key);
  if (!ymd) return key;
  const mm = String(ymd.m).padStart(2, '0');
  const dd = String(ymd.d).padStart(2, '0');
  return format.replace(/YYYY/g, String(ymd.y)).replace(/MM/g, mm).replace(/DD/g, dd);
}

export function dailyNotePath(settings: RunwaySettings, today: DayKey): string {
  const folder = settings.dailyFolder.replace(/\/+$/, '');
  const basename = formatDayKey(today, settings.dailyFormat);
  return folder === '' ? `${basename}.md` : `${folder}/${basename}.md`;
}

/**
 * Tiny template expansion for new daily notes: {{date}}, {{date:FORMAT}},
 * {{title}}. Anything else is left untouched.
 */
export function applyDailyTemplate(source: string, today: DayKey, title: string): string {
  return source
    .replace(/\{\{date:([^}]+)\}\}/g, (_match, format: string) => formatDayKey(today, format))
    .replace(/\{\{date\}\}/g, today)
    .replace(/\{\{title\}\}/g, title);
}

/**
 * Append a task line: right after `heading` when configured and present,
 * else at the end of the file. Pure — used by the edit service inside
 * vault.process.
 */
export function appendTaskLine(content: string, taskLine: string, heading: string): string {
  if (heading !== '') {
    const lines = content.split('\n');
    const headingIndex = lines.findIndex((line) => line.trim() === heading.trim());
    if (headingIndex !== -1) {
      // Skip past the heading's existing block of list items / text.
      let insertAt = headingIndex + 1;
      while (insertAt < lines.length && lines[insertAt]?.trim() !== '' && !/^#{1,6}\s/.test(lines[insertAt] ?? '')) {
        insertAt += 1;
      }
      lines.splice(insertAt, 0, taskLine);
      return lines.join('\n');
    }
  }
  const trimmed = content.replace(/\n+$/, '');
  return trimmed === '' ? `${taskLine}\n` : `${trimmed}\n${taskLine}\n`;
}
