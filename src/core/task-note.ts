/**
 * A task "note" is a single indented child line placed right below the task in
 * the source note — plain markdown, invisible to the task index (it carries no
 * checkbox, so metadataCache lists it but `item.task` is undefined).
 */

function leadingWhitespace(line: string): string {
  return /^\s*/.exec(line)?.[0] ?? '';
}

/** Indentation for a note written under `taskLine` (one level deeper). */
export function noteIndentFor(taskLine: string): string {
  return `${leadingWhitespace(taskLine)}\t`;
}

/**
 * Is `candidate` the note child of `taskLine`? It must be indented deeper,
 * carry non-empty text, and not itself be a checkbox task.
 */
export function isChildNote(taskLine: string, candidate: string | undefined): boolean {
  if (candidate === undefined) return false;
  const taskIndent = leadingWhitespace(taskLine).length;
  const indent = leadingWhitespace(candidate).length;
  if (indent <= taskIndent) return false;
  const body = candidate.slice(indent);
  if (body.trim() === '') return false;
  if (/^(?:[-*+]|\d+[.)])\s+\[.\]/.test(body)) return false; // a nested task, not a note
  return true;
}

/** Display text of a note child: strip indentation and an optional bullet. */
export function noteTextOf(candidate: string): string {
  return candidate.replace(/^\s+/, '').replace(/^(?:[-*+]|\d+[.)])\s+/, '').trim();
}

/** Serialize a note line under a task, matching its indentation. */
export function noteLine(taskLine: string, text: string): string {
  return `${noteIndentFor(taskLine)}- ${text.trim()}`;
}
