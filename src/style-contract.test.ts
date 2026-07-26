import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * mv-kit style contract for styles.css (obsidian-cosmos-theme/docs/mv-kit.md),
 * sibling to settings.test.ts / dates.test.ts under Runway's node:test runner.
 * Ported from obsidian-sonar's vitest contract (commit 3acb417, extended by
 * af28344 with the two comment-integrity assertions), via the node:test shape
 * established by obsidian-tabx (commit 3461483). Encodes only the state
 * landed by the 2026-07 mv-kit audit wave (docs/2026-07-mv-kit-audit.md) —
 * not aspirational rules the audit didn't actually fix.
 *
 * Four assertions:
 * 1. no CSS comment terminates early (a token glob immediately followed by
 *    a slash inside a comment closes it prematurely, silently dropping the
 *    rest of the enclosing rule — the regression that cost Sonar its
 *    `.sonar-modal` width in af28344).
 * 2. stripping comments leaves no orphaned prose (the structural symptom of
 *    the same early-termination bug: a comment's tail lines survive the
 *    strip as stray ` * ...` declaration-position garbage).
 * 3. every raw ms/hex/cubic-bezier value appears only as a
 *    `var(--token, <fallback>)` literal fallback, or as the `0.01ms`
 *    reduced-motion reset (an a11y escape hatch, not a design value) — never
 *    a bare, untethered value.
 * 4. !important declarations are capped at 10, the exact post-mv-kit-audit
 *    count — the ceiling can only ratchet down.
 */

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

/** Strip comments so `/* 80ms *\/`-style prose in doc comments doesn't trip
 * the raw-value scan below. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('no CSS comment terminates early (token glob followed by a slash)', () => {
  // Regression guard for a real outage (Sonar, 2026-07-24, af28344): a
  // comment written as `--cosmos-*` immediately followed by a slash
  // terminates the comment early. Everything after it parses as garbage and
  // the browser DROPS the enclosing rule.
  const offenders = css
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /--[\w-]*\*\//.test(line));

  assert.deepEqual(offenders, []);
});

test('stripping comments leaves no orphaned prose (structural parse check)', () => {
  // If a comment closed early, its remaining lines survive the strip as
  // stray ` * ...` prose sitting in declaration position.
  const orphans = stripComments(css)
    .split('\n')
    .map((line, idx) => ({ line: line.trim(), n: idx + 1 }))
    .filter(({ line }) => /^\*\s|^\*$/.test(line));

  assert.deepEqual(orphans, []);
});

test('raw ms/hex/cubic-bezier values appear only as var() fallbacks', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  // A raw ms/hex/cubic-bezier is allowed ONLY when it sits inside a
  // `var(--token, <fallback>)` expression (any token, native Obsidian ones
  // included — the contract's requirement is "never a bare value", not
  // "only --cosmos-*/--mv-* tokens may have fallbacks"), or when it is the
  // universal `0.01ms` reduced-motion reset (the sole such site in
  // styles.css, and it always carries `!important` to win against every
  // component's own transition shorthand — that isn't a design value, it's
  // an a11y escape hatch).
  const rawMsPattern = /\b\d+(?:\.\d+)?ms\b/g;
  const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/g;
  const rawCubicBezierPattern = /cubic-bezier\([^)]*\)/g;

  const violations: string[] = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const isReducedMotionReset = /^transition-duration:\s*0\.01ms\s*!important;$/.test(trimmed);
    if (isReducedMotionReset) return;

    const hasVarFallback = /var\(\s*--[\w-]+\s*,/.test(line);

    for (const pattern of [rawMsPattern, rawHexPattern, rawCubicBezierPattern]) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(line)) !== null) {
        if (!hasVarFallback) {
          violations.push(`line ${idx + 1}: "${match[0]}" in "${trimmed}"`);
        }
      }
    }
  });

  assert.deepEqual(violations, []);
});

test('caps !important declarations at the post-mv-kit-audit count (ratchet down only)', () => {
  const importantCount = (css.match(/!important;/g) ?? []).length;
  // Ceiling set exactly at the post-fix count landed by the mv-kit audit
  // (wave 7, 2026-07): the focus-ring kill on .runway-panel buttons and the
  // search input (4), the search input's native input[type='search']
  // chrome overrides (5), and the reduced-motion transition-duration reset
  // (1). Every occurrence is documented in
  // docs/2026-07-mv-kit-audit.md's `!important` audit table. This ceiling
  // may only be LOWERED, never raised: any future edit that adds an
  // !important without removing one elsewhere fails this test.
  assert.ok(
    importantCount <= 10,
    `!important count ${importantCount} exceeds the frozen ceiling of 10`,
  );
});

// mv-kit §6 (Elevation & motion depth) — wave 2026-07 dinamica, per
// docs/2026-07-mv-kit-audit.md's "§6 — wave 2026-07 dinamica" section.
//
// "A touch tap must never leave a stuck hover state — plugins must not
// fight it with custom :hover outside @media (hover: hover) on
// phone-reachable elements." Every `.runway-*:hover` rule in this file was
// a bare top-level rule before this wave; the panel is phone-reachable (the
// sidebar/full-page view both render on `.is-mobile`), so any of them could
// leave a stuck colour wash after a tap. Brace-depth scan (ported from the
// obsidian-tabx wave's identical assertion): tracks whether each
// `.runway-*:hover` selector opens inside an `@media (hover: hover)` block.
test('§6: no bare .runway-*:hover rule outside @media (hover: hover)', () => {
  const code = stripComments(css);
  const lines = code.split('\n');

  let depth = 0;
  const hoverGateDepths: number[] = [];
  const violations: string[] = [];

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    const opensHoverGate = /@media\s*\(hover:\s*hover\)/.test(line) && line.includes('{');

    if (opensHoverGate) hoverGateDepths.push(depth);

    const opensBareRunwayHoverRule =
      !opensHoverGate &&
      line.includes('{') &&
      /\.runway-[\w-]+(?:[.:][\w-]+)*:hover\b/.test(line);

    if (opensBareRunwayHoverRule && hoverGateDepths.length === 0) {
      violations.push(`line ${idx + 1}: "${line}"`);
    }

    for (const ch of rawLine) {
      if (ch === '{') depth += 1;
      if (ch === '}') {
        depth -= 1;
        const gateDepth = hoverGateDepths[hoverGateDepths.length - 1];
        if (gateDepth !== undefined && depth <= gateDepth) {
          hoverGateDepths.pop();
        }
      }
    }
  });

  assert.deepEqual(violations, []);
});

// mv-kit §6: "colour washes ease with --mv-wash, physical lifts (transform)
// ease with --mv-lift — the two easings are not interchangeable." Every
// `var(--runway-t)` consumer in this file transitions background-color,
// color, opacity, or border-color — never a transform — so the shared
// `--runway-t` alias must resolve to `--mv-wash`, not `--mv-lift`. (The
// file's one genuine transform transition, `.runway-group__chevron`'s
// rotate reveal, already names `--mv-lift` directly and doesn't go through
// `--runway-t` — untouched by this assertion.)
test('§6: the shared --runway-t wash alias eases with --mv-wash, not --mv-lift', () => {
  const code = stripComments(css);
  const match = code.match(/--runway-t:\s*([^;]+);/);

  assert.ok(match, 'expected to find the --runway-t custom property declaration');
  const value = match?.[1] ?? '';
  assert.match(value, /var\(--mv-wash,/);
  assert.doesNotMatch(value, /var\(--mv-lift,/);
});
