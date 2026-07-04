export interface LineRef {
  line: number;
  rawText: string;
}

/**
 * Locate the referenced line unambiguously: exact text at the expected index,
 * else a UNIQUE exact-text match anywhere (the line may have drifted since
 * render). Returns the index, or -1 on zero/multiple matches.
 */
export function locateLine(lines: readonly string[], ref: LineRef): number {
  if (lines[ref.line] === ref.rawText) return ref.line;
  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === ref.rawText) matches.push(i);
  }
  return matches.length === 1 && matches[0] !== undefined ? matches[0] : -1;
}

/**
 * Pure guarded line edit: apply `transform` to the referenced line only if it
 * can be located unambiguously. Callers never write on ambiguity.
 */
export function applyLineEdit(
  content: string,
  ref: LineRef,
  transform: (line: string) => string,
): { content: string; changed: boolean } {
  const lines = content.split('\n');
  const index = locateLine(lines, ref);
  const current = index >= 0 ? lines[index] : undefined;
  if (index === -1 || current === undefined) return { content, changed: false };
  const next = transform(current);
  if (next === current) return { content, changed: false };
  lines[index] = next;
  return { content: lines.join('\n'), changed: true };
}

/** Remove the referenced line (same guard). No-op on zero/multiple matches. */
export function removeLine(
  content: string,
  ref: LineRef,
): { content: string; removed: boolean } {
  const lines = content.split('\n');
  const index = locateLine(lines, ref);
  if (index === -1) return { content, removed: false };
  lines.splice(index, 1);
  return { content: lines.join('\n'), removed: true };
}
