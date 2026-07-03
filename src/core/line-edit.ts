export interface LineRef {
  line: number;
  rawText: string;
}

/**
 * Pure guarded line edit: apply `transform` to the referenced line only if it
 * can be located unambiguously — exact text at the expected index, else a
 * UNIQUE exact-text match anywhere (the line may have drifted since render).
 * Zero or multiple matches abort; callers never write on ambiguity.
 */
export function applyLineEdit(
  content: string,
  ref: LineRef,
  transform: (line: string) => string,
): { content: string; changed: boolean } {
  const lines = content.split('\n');
  let index = -1;
  if (lines[ref.line] === ref.rawText) {
    index = ref.line;
  } else {
    const matches: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] === ref.rawText) matches.push(i);
    }
    if (matches.length === 1 && matches[0] !== undefined) index = matches[0];
  }
  const current = index >= 0 ? lines[index] : undefined;
  if (index === -1 || current === undefined) return { content, changed: false };
  const next = transform(current);
  if (next === current) return { content, changed: false };
  lines[index] = next;
  return { content: lines.join('\n'), changed: true };
}
