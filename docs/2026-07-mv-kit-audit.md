# mv-kit audit — Runway (wave 7)

Audit of `styles.css` (921 lines pre-fix, 940 post-fix) + the UI code
(`src/ui/task-panel.ts`, `src/ui/sidebar-view.ts`, `src/ui/list-view.ts`,
`src/ui/task-row.ts`, `src/ui/task-menu.ts`, `src/ui/date-menu.ts`,
`src/ui/prompt-modal.ts`, `src/ui/quick-add-modal.ts`, `src/settings-tab.ts`)
against `obsidian-cosmos-theme/docs/mv-kit.md`, both desktop and phone
columns. Scope: coherence-only fixes (radius / typography / icons / motion
tokens / empty states / microcopy). No layout redesign, no DOM restructure —
per `docs/2026-07-24-suite-coherence-design.md` §C/D non-goals.

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't apply here, with reason) / **flagged** (a real
gap against the kit, but fixing it means a component rework or a scope
decision beyond this wave's coherence-only mandate — surfaced for Mario, not
silently skipped).

## Golden rule — theme-independent consumption

| Check | Verdict |
|---|---|
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **fixed** — before this wave, zero suite-token consumption (`grep -oE "var\(--(mv\|cosmos)-"`: 0 hits). Now 8 consumption sites across 4 distinct tokens (`--mv-lift` ×2, `--cosmos-t-fast` ×3, `--cosmos-native`, `--cosmos-touch-min` ×4, `--cosmos-press-scale`), every one with a literal fallback equal to Runway's pre-fix value (or, for the two motion-token pairs, the plugin's own historical duration paired with the token's canonical easing curve — the exact idiom Sonar's `--sonar-ease` fix used in wave 1). A Cosmos-less vault renders identically. |
| No plugin stylesheet redefines `--mv-*`/`--cosmos-*` at `:root`/`body` | **pass** — Runway only ever defines its own `--runway-t` token, never a `--cosmos-*`/`--mv-*` name. |

The rewiring, mirroring Sonar wave 1's pattern exactly:

```css
/* before */                    /* after */
--runway-t: 80ms ease;          --runway-t: var(--cosmos-t-fast, 80ms)
                                   var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1));
```

Every downstream `var(--runway-t)` reference (18 sites: icon buttons, the
add button, segments, pills, chips, group heads/actions, rows, checkboxes,
note chips) is unchanged, so the two-line rewire moved the whole
stylesheet's hover/reveal wash onto the suite scale. The fallback duration
(`80ms`) stays Runway's own literal — it doesn't match `--cosmos-t-fast`'s
canonical `140ms`, so per the tabx wave-4 precedent ("the kit names a token
slot, not a mandate to visually match every plugin's card") the fallback is
kept as-is rather than silently bumped.

## §1 Radius + surfaces

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.runway-iconbtn` / `.runway-add-btn` / `.runway-segment` inner / `.runway-fchip` / `.runway-row` / `.runway-group__head` / `.runway-row__check` (native `--radius-s`) | native token | same | **pass** — native tokens, not hand-picked pixels. |
| `.runway-segments` container (`--radius-m`) | native token | same | **pass** |
| `.runway-check` (custom checkbox square, `3px`) | literal `3px` | same | **waived** — a fixed 13×13px checkbox glyph, not a "pill/card/chip" surface in the kit's §1 sense; no token in the radius table names a control this small. |
| `.runway-pill` / `.runway-quick-add__chip` (`999px`) | literal `999px` | same | **waived** — the generic round-cap idiom on a status pill, matching the exact verdict Sonar's grab-handle/badge-dot and TabX's status-dot got in their waves. The kit's `--cosmos-r-fusion-tab` (`999px`) means "full pill for fusion-flavour tab bars" specifically, a different semantic; the radius table has no entry for a status/filter pill outside that context. |
| `.runway-check--in-progress::after` / `.runway-group--today .runway-group__title::before` (`50%` dots) | literal | n/a | **waived** — round-cap idiom on fixed tiny shapes (status dot, "now" marker), same class as the above. |
| Elevation shadow on floating surfaces | Runway renders no popovers/menus of its own — filter/sort/group menus are native Obsidian `Menu` chrome | same | **waived, nothing to tokenize** — no plugin-owned floating chrome exists to consume `--cosmos-pop-shadow` for; native `Menu` already carries the theme's own elevation. Identical verdict to Sonar/TabX/Portal's own floating-surface waivers. |
| `.runway-segment.is-active` (`box-shadow: var(--shadow-s)`) | native token | same | **pass** |

## §2 Type sizes, icon sizes, touch targets

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.runway-iconbtn` (26×26px) | `26×26px`, no minimum enforced (kit: desktop N/A) | was `28×28px` inside `.is-mobile` | **fixed on phone** — now `var(--cosmos-touch-min, 44px)` square. Desktop unchanged. |
| `.runway-row__check` / `.runway-row__more` / `.runway-group__act` (22×22px) | `22×22px`, no minimum | was `28×28px` inside `.is-mobile` | **fixed on phone** — now `var(--cosmos-touch-min, 44px)` square. |
| `.runway-segment` / `.runway-fchip` / `.runway-pill` (24–26px tall) | mouse-sized, no minimum | was `min-height: 32px` inside `.is-mobile` | **fixed on phone** — now `min-height: var(--cosmos-touch-min, 44px)`. |
| `.runway-search__input` (30px tall) | `30px`, no minimum | was `height: 34px` inside `.is-mobile`, still 10px under the floor | **fixed on phone** — now `height: var(--cosmos-touch-min, 44px)`. A genuine, previously-unnoticed §2 violation: the primary search field sat under the floor on phone even inside its own mobile-scoped block. |
| `.runway-add-btn` (26px tall) | `26px`, no minimum | **was missing from the `.is-mobile` block entirely** — stayed 26px, 18px under the floor | **flagged, not fixed this wave** — the primary "add task" action is the single most-tapped control in the header and is under the floor on phone. Left unfixed because the compact variant (`.runway-panel--compact .runway-add-btn`, an icon-only 26×26 square used in the sidebar) would need a coordinated width change alongside the height bump to stay visually square, and the full variant's `padding: 0 10px` would need a matching horizontal bump too — a two-axis sizing decision closer to a component tweak than a token substitution. Flagged for Mario rather than sized unilaterally. |
| `.runway-row` (whole-row tap target) | row padding only, comfortably >44px tall (`4px` + content) | `padding: 8px var(--size-2-2)` on `.is-mobile`, whole row clickable, comfortably >44px in practice | **pass** |
| `.runway-group__head` (accordion header, whole-row tap target) | row padding only | same, no phone-specific override, comfortably >44px in practice (icon + title + count row) | **pass** |
| Micro-label / count text size (`.runway-group__count`, `.runway-chip`, `.runway-group__sub`) | `var(--font-ui-smaller)` | same | **pass** |
| Icon sizing (16px search/chevron/group-act icons, 15px add-btn icon, 13px fchip icon, 12px note-icon) | raw px on SVG wrapper spans, native `setIcon()` Lucide glyphs (`search`, `plus`, `filter`, `chevron-down`, `chevron-right`, `file-symlink`, `more-horizontal`, `text`, `x`) | same | **pass** — matches the kit's own §2 row ("Cosmos defines no separate icon-size scale") and the wave-1/3/4 precedent on the identical pattern. All icons are core Lucide names, none bespoke. |

## §3 Motion

| Token / animation | Before | After | Verdict |
|---|---|---|---|
| `--runway-t` (the file's only wash easing, used by 18 hover/reveal transitions: icon buttons, add button, segments, pills, chips, group head/actions, rows, checkbox, note chip) | raw `80ms ease` | `var(--cosmos-t-fast, 80ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))` | **fixed** — exactly the kit's "physical hover/reveal easing" (`--mv-lift`) on the micro-feedback duration tier, the same rewrite Sonar's `--sonar-ease` got in wave 1. |
| `.runway-group__chevron` rotate reveal | raw `120ms ease` | `var(--cosmos-t-fast, 120ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))` | **fixed** — same physical-reveal semantic as `--runway-t`, tokenized independently since it isn't routed through the shared variable. |
| **Press-scale on phone** (`--cosmos-press-scale`) | **absent** — no tap-confirmation anywhere in the panel | `transform: scale(var(--cosmos-press-scale, 0.98))` on `:active` for `.runway-row__check`, `.runway-row__more`, `.runway-group__act`, `.runway-segment`, `.runway-fchip`, `.runway-iconbtn`, `.runway-pill`, `.runway-add-btn`, inside `.is-mobile`, transitioned on `var(--cosmos-t-fast, 140ms) var(--cosmos-native, cubic-bezier(0.32, 0.72, 0, 1))` | **fixed** — kit §3 MUST: "tap targets apply `transform: scale(var(--cosmos-press-scale, 0.98))` on active/press." Runway had nothing; same gap Portal, Masonry and TabX each had before their own waves. Transform-only, composited. |
| `prefers-reduced-motion: reduce` | `.runway-panel * { transition-duration: 0.01ms !important; }` — a single wildcard rule already covering every descendant | unchanged, and the new press-scale `:active` rules are covered automatically by the same wildcard (no extension needed, unlike TabX which had to add new selectors to a narrower per-class block) | **pass** — Runway's reduced-motion block was already maximally broad; nothing to extend. |
| Animated properties (hover washes) | `background-color`/`color`/`border-color`/`opacity`/`transform` (chevron rotate) | unchanged, plus the new `transform` on press-scale | **pass** — no layout-triggering property is animated on hover/press/reveal. |
| `--cosmos-spring` (overshoot) | never used | unchanged | **pass** — correctly not reached for; Runway has no confirmation micro-moment (e.g. a checkbox "pop") that would call for it. The `.runway-check--done::after` checkmark appears instantly on state change with no entrance animation at all — a possible future delight opportunity, not a coherence defect, so left untouched (out of scope: adding a new animation is not a fix to an existing one). |
| Phone entrance recipes (`cosmos-pop-in` / `cosmos-sheet-rise` / `cosmos-fade-in`) | n/a | Runway's modals (quick-add, date-pick, edit-description, prompt) are native Obsidian `Modal` instances; the panel itself is embedded view content, not floating chrome | **pass, inherited** — same verdict as every prior wave's identical situation: nothing plugin-owned to animate an entrance for; native `Modal` chrome already carries the theme's own recipes when Cosmos is active. |

## §4 Empty-state pattern

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.runway-empty` ("Indicizzazione…" / "Nessun task corrisponde ai filtri.") | was `color: var(--text-faint)` (already correct) at `font-size: var(--font-ui-small)` — one step too large | same, no phone variant | **fixed** — `font-size` dropped to `var(--font-ui-smaller)`, the kit's whisper recipe verbatim. Identical fix shape to Sonar's `.sonar-preview__empty` (wave 1) and TabX's `.tabx-grid-empty p` (wave 4). |
| `.runway-group__title` (accordion section heading: "Oggi", "Inbox", note names, tag names, folder names) | `font-size: var(--font-ui-medium); font-weight: var(--font-semibold); color: var(--text-normal)` — no uppercase/letter-spacing | same | **waived, correctly out of scope** — unlike Sonar's `.sonar-group` eyebrow or TabX's `.tabx-rail-title`, this is not a secondary micro-label sitting above other content; it *is* the group's primary, only-occurring content label (the equivalent of a folder/file name), rendered at a readable body-adjacent size on purpose so date buckets and note names stay legible. Forcing it into the micro-label recipe (uppercase, `--text-faint`, smaller) would make the single most information-bearing text in the accordion the quietest thing on the row — a hierarchy regression, not a coherence fix. Same judgement class as Portal's `.portal-section-title` and TabX's `.tabx-rail-title` deferrals, but here the verdict lands the other way (correctly out of scope, not merely flagged) because the semantic — content label vs. section eyebrow — is genuinely different. |
| `.runway-group__count` (task count next to the group title) | `color: var(--text-faint); font-size: var(--font-ui-small)` | same | **waived** — a numeric annotation beside a heading, not an empty-state message nor a micro-label eyebrow; same "pass, not applicable" class as TabX's `.tabx-rail-count`. Left at `--font-ui-small` deliberately: it sits directly beside the `--font-ui-medium` group title, and dropping two full steps to `--font-ui-smaller` (the whisper size) would read as visually disconnected from the heading it annotates. |
| `.runway-quick-add__hint` (natural-date parse preview, e.g. "📅 2026-07-25 — …") | `color: var(--text-accent); font-size: var(--font-ui-smaller)` | same | **pass, correctly not a whisper state** — this is live positive feedback confirming a successful parse, not an empty/absence state; the kit's whisper recipe (`--text-faint`) is for "nothing here", and using it here would make useful feedback illegible. |

## §5 Microcopy voice

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Sentence-case labels | `RunwaySettingTab` uses Obsidian's native `Setting`/`PluginSettingTab` API exclusively (`new Setting(containerEl).setName('Cartelle escluse')…`) | n/a | **pass on mechanism** — no bespoke `.mva-pv`-style form exists to normalize; delegates entirely to native `Setting`, matching Sonar/Portal/TabX's identical verdict for the same reason. Language is a separate axis, see below. |
| No native `<select>` in plugin-authored view/panel UI | `grep -n "createEl('select'\|<select"` over `src/ui/`: **one hit** — `quick-add-modal.ts:62`, a native `<select>` for priority in the Quick Add modal | same modal reused on phone | **flagged, not fixed this wave** — this is a genuine kit §5 MUST NOT ("no plugin form uses a native `<select>` element — chip+popover only"), and unlike the settings-screen `addDropdown` uses (which are explicitly out of scope by the programme doc), this one lives in an in-app modal the kit's picker rule does cover. Not fixed because replacing it means building a new chip+popover picker component from scratch — Runway has no existing `.mva-sel`-style component to reuse (the date/priority pickers elsewhere in the plugin are native `Menu` instances, not inline pickers) — which is a component build, not a coherence-only token/property substitution, and crosses this wave's "no DOM restructure" boundary. Flagged for a follow-up wave or the settings-screen cantiere, whichever Mario prefers to fold it into. |
| No `mod-cta` on buttons | `grep -rn "mod-cta"` over `src/`: **5 hits** — `quick-add-modal.ts`, `task-menu.ts` (×2 modals: edit-description + the shared save pattern), `date-menu.ts`, `prompt-modal.ts`, all on the primary "save/confirm" button of a native Obsidian `Modal` | same modals reused on phone | **waived, judged against the kit's actual scope** — `mod-cta` is Obsidian's own core class for "this is the modal's primary action", applied here exclusively inside native `Modal.contentEl` button rows (never inside `.runway-panel`, the plugin's own chip/pill/button surface). The kit's MUST NOT reads "no plugin *button* carries `mod-cta`" in the context of the suite's own `.mva-btn` convention for *custom-built* forms (§5's own preamble cites `.mva-pv`/`.mva-sel`/`.mva-btn` as "the suite's form-language convention" for bespoke chrome); Sonar and TabX's own wave audits reached "pass, correctly out of scope" for the identical situation (their settings tabs delegate to native `Setting`/`Modal`, so there's "no bespoke form to normalize"). Runway's four small modals are the same case: native `Modal` primary-action buttons, not `.runway-panel`-authored chrome. Replacing 5 native `mod-cta` buttons with a hand-built `.mva-btn` equivalent would be introducing new bespoke UI where Obsidian's own primary-action convention already applies correctly — the opposite of coherence. |
| Sentence-case labels — language axis | **every user-facing string in the plugin is Italian**: view titles, filter labels ("Oggi"/"Prossimi"/"Senza data"/"Tutti"), menu items ("Modifica testo…", "Sposta in nota…"), button text ("Salva", "Annulla", "Aggiungi", "Conferma"), empty states ("Indicizzazione…", "Nessun task corrisponde ai filtri."), `Notice` messages, `aria-label`s, and the entire settings tab | same strings, same modals, reused verbatim on phone | **flagged, explicit scope decision for Mario — not fixed, not silently waived.** The kit's §5 MUST reads "product-surface copy is English; standard PM jargon stays untranslated even in an Italian-language context" — Runway fails this MUST completely and uniformly, but this is categorically different from every other finding in this audit: it is not a missed token substitution or a small gap, it is the plugin's whole-file content design, spanning 9 source files and every UI surface (panel chrome, three menu builders, four modals, `Notice` text, the settings tab). Translating it is a genuine content rewrite of hundreds of strings, several of which are interpolated with dynamic values (`` `${activeFilters} filtri` ``, `` `Runway: task aggiunto a ${path}.` ``) — a scope order of magnitude beyond "coherence-only fixes: radius / typography / icons / motion / empty states / microcopy" token/property substitutions every other plugin in this rollout received. It is also a legitimate product decision Mario may have made deliberately (an Italian-first task manager for an Italian-first vault), not an oversight comparable to a missed `--cosmos-touch-min`. Surfaced here per the audit procedure's "every unchecked box is a fix, not a note" — but sized honestly as a call only Mario can make, not something to silently rewrite or silently ignore. |
| PM jargon untranslated | n/a — no English PM-jargon terms are used at all; the plugin's whole vocabulary is Italian task-management terms ("task", "priorità", "cartella") | same | **not applicable while the language question above is open** — revisit together with the language flag. |
| Chip+popover pickers, never native `<select>` | `.runway-fchip` (filter/sort/group chips) already follows this pattern | same | **pass** — the one exception is the quick-add priority `<select>`, already flagged separately above. |

## Golden-rule raw-value leakage (post-fix grep, repo-wide)

- raw hex: **0 occurrences**, before and after.
- `cubic-bezier`: **3 occurrences**, all literal fallbacks inside `var()` —
  the `--runway-t` fallback, the chevron transition fallback, and the new
  press-scale block's `--cosmos-native` fallback.
- `ms` durations: **4 occurrences** — 3 are `var(--cosmos-t-fast, N)`
  fallbacks, 1 is the pre-existing `0.01ms` reduced-motion reset (an a11y
  escape hatch carrying `!important`, not a design value).
- `var(--cosmos-*)` / `var(--mv-*)` consumption: **0 → 8** occurrences
  across 4 distinct tokens (`--mv-lift`, `--cosmos-t-fast`,
  `--cosmos-native`, `--cosmos-touch-min`, `--cosmos-press-scale`).
- `--cosmos-*` / `--mv-*` *definitions* anywhere (including `:root`/`body`):
  **0**.

`src/style-contract.test.ts` (added in the next commit) enforces exactly
this shape mechanically.

## `!important` audit — 10, unchanged, each now judged individually

The kit is silent on `!important` (no MUST/MUST NOT); each is judged on
whether it wins a real specificity battle or shortcuts the cascade. No
`!important` was added or removed this wave.

| Block | Count | Verdict |
|---|---|---|
| `.runway-panel :is(button, [role='button']):focus`/`:focus-visible` — `outline`/`box-shadow: none` | 2 | **kept, justified inline** — suite preference (already documented in the file: "no focus ring on buttons, keyboard too"), defeats theme/core `:focus-visible` default outlines at equal or higher specificity. |
| `.runway-panel .runway-search__input` — `padding-inline`, `border`, `border-radius`, `background`, `box-shadow` | 5 | **kept, justified inline (new comment)** — Obsidian core styles the same element via `input[type='search']` (an attribute selector, (0,1,1)), which outranks `.runway-panel .runway-search__input` (0,2,0) on background/border/shadow; without `!important` the field would render as native search chrome (with the OS clear-button widget) instead of matching the filter-bar's chip/pill visual language. Same specificity story as TabX's `.tabx-search-input` block. |
| `.runway-panel .runway-search__input:focus` — `outline`/`box-shadow: none` | 2 | **kept, justified inline** — same focus-ring suppression as the button rule above, scoped to the search field; the plugin deliberately draws its own `:focus-visible` outline instead (see the very next rule, `outline: 2px solid var(--interactive-accent)`, correctly *not* `!important` since nothing competes with it at that specificity). |
| `@media (prefers-reduced-motion: reduce) { transition-duration: 0.01ms !important }` | 1 | **kept, justified inline (new comment)** — must outrank every per-property transition-duration declared elsewhere in the file (18+ sites using `var(--runway-t)`/`var(--cosmos-t-fast, …)`), which are all higher-specificity, later-declared rules than this one wildcard reset; `!important` is the only way a single top-level reduced-motion block can win against every component's own transition shorthand. |

**Total: 10.** None removed — every one is a genuine specificity battle
against Obsidian core or the plugin's own later, more-specific component
rules, not a shortcut around normal cascade. `src/style-contract.test.ts`
caps this at 10 exactly (ratchet-down only): any future edit that adds an
`!important` without removing one fails the contract test.

## Not touched (explicit non-goals, confirmed out of scope)

- No layout or DOM changes anywhere — every fix in this wave is a token
  substitution, a missing phone-size addition on an already-existing
  selector, or a new `:active` press-scale rule.
- Row/panel/keyboard-cursor/multi-selection logic (`task-panel.ts`'s
  `onKeyDown`/`moveCursor`/`selectRange`/`toggleSelect`) — untouched;
  `dates.test.ts`, `settings.test.ts`, and every `src/core/*.test.ts` /
  `src/edits/*.test.ts` / `src/index/*.test.ts` passing unmodified in the
  final run is the mechanical proof.
- Settings screen (`settings-tab.ts`'s `.addDropdown` → native `<select>`)
  — explicitly queued after this programme, same deferral TabX and Masonry
  both recorded for their own settings tabs.
- Quick-add priority `<select>` (see §5) — flagged, not fixed; a component
  build (chip+popover), not a coherence-only substitution.
- `.runway-add-btn` missing from the `.is-mobile` touch-target block (see
  §2) — flagged, not fixed; a two-axis (width+height, plus padding) sizing
  decision for the header's primary action, not a single-property token
  swap.
- The full-Italian microcopy surface (see §5) — flagged as an explicit
  scope decision for Mario, not silently rewritten and not silently waived.
- `.runway-check--done` checkmark's instant (non-animated) appearance —
  a possible future delight opportunity per the kit's `--cosmos-spring`
  row, not a defect in anything the kit currently requires.

## Verification

Run on the post-fix tree, exit codes and counts quoted verbatim:

- `pnpm typecheck` (`tsc --noEmit`) — **exit 0**, 0 errors.
- `pnpm lint` (`eslint src`) — **exit 0**, 0 problems.
- `pnpm test` (`node --experimental-strip-types --test "src/**/*.test.ts"`)
  — **95/95 passing** (91 pre-existing + 4 new in
  `src/style-contract.test.ts`).
- Desktop screenshot / live vault-reload verification: **pending** — not
  performed this wave (no live vault-reload check run in this session),
  matching Sonar wave 1's own "pending" verification note.
- Phone verification: **pending Mario's on-device sign-off** — per hard
  constraint, Obsidian's `EmulateMobile` was not used (it kills Node
  plugins); phone changes (touch targets, motion tokens, press-scale) are
  verified by reading the resulting CSS values against the kit's phone
  column, not by rendering on-device.
