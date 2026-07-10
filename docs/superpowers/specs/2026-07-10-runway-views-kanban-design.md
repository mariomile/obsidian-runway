# Runway — Fixed views, Kanban board & suite UX alignment

**Date:** 2026-07-10
**Status:** Approved design (pending spec review)
**Repo:** `obsidian-runway` (v0.2.x)

## 1. Context & goal

Runway today is a single `TaskPanel` component rendered at two densities (sidebar +
full page), driven by a **freeform filter bar** (text + status pills + due / tag / folder /
priority + sort + group + saved views). There is no fixed view taxonomy.

The goal is to make Runway feel like a **task app**, not a filter surface, by adding:

1. A **fixed view nav** — Inbox / Today / Upcoming / All — as the primary navigation.
2. A **Kanban board** rendering mode, available inside every view.
3. A prominent **new-task** affordance ("add" like Kairos).
4. A **UX/UI pass** that formally enrolls Runway in the Marioverse suite design system.

The task data model (parser, serializer, index) is sufficient as-is — this is an
additive UI + view-resolution layer. No changes to how tasks are read/written on disk.

## 2. Decisions (from brainstorming, 2026-07-10)

| # | Decision | Choice |
|---|---|---|
| D1 | View model | **Fixed nav + secondary filter.** The 4 views set a resolved filter+group; the existing filter bar stays below to refine within a view. Saved views remain in the bookmark menu. |
| D2 | Kanban columns | **Configurable, default by status.** Columns reuse the existing group-by mechanism as their source (status default; time / priority selectable). |
| D3 | Inbox definition | **Dateless tasks** (`due: none`), open statuses. The current folder-based `inboxFolders` is retained only as a *pin* in note-grouping, not as the Inbox view. |
| D4 | Today composition | Due-today **∪** tasks living in today's daily note (any/no date), open statuses. Daily note pinned first. |
| D5 | Add-task | **(a)** Prominent persistent "+ New task" button in the nav header (opens existing quick-add with NL-date IT/EN) + per-note `+` in every view. *(Assumption — see §9.)* |
| D6 | UX target | **Filone B — "app panel"** (ref. exo) of the suite design system. |

## 3. View taxonomy (nav + resolution)

A **view nav strip** sits at the top of the panel (segmented control), with 4 fixed
views plus a Lista ⇄ Board toggle and a `+ New task` action. Each view resolves to a
starting filter + group; the filter bar below refines within the active view.

| View | Resolved filter | Default group |
|---|---|---|
| **Inbox** | `due: none` + open statuses (`todo`, `in-progress`) | note (inbox-folder pinned) |
| **Today** | `due: today` **∪** source note == today's daily note (any date) + open statuses | note (today's daily pinned first, then other notes) |
| **Upcoming** | `due` in `[tomorrow … agendaHorizonDays]` + open statuses | agenda (existing day-by-day grouping) |
| **All** | no date filter | note |

Notes:

- The **active view** and **board/list mode** persist in `panelState`.
- The filter bar remains fully functional as a *refinement* inside the resolved view
  (e.g. text search within Today, add a tag filter within All).
- "Open statuses" = `todo` + `in-progress`; `done`/`cancelled` are excluded from
  Inbox/Today/Upcoming by default (visible in All, or via the status pills).

## 4. Today algorithm (the delicate part)

A task appears in **Today** if **at least one** holds:

1. Its effective date (`📅` due, else `⏳` scheduled) equals **today**, or
2. Its **source note path equals today's daily note path** — derived from
   `dailyFolder` + `dailyFormat` (Moment tokens) applied to the current date — even if
   the task has **no date**. This surfaces tasks jotted into the daily note immediately.

Rendering: grouped by note. The **today's-daily group is pinned first** (label e.g.
"Today · daily"), followed by every other note that has a due-today task.

`today` is computed **at render time** (not frozen at mount), so the view rolls over
at midnight without a manual refresh. This must be covered by the render-loop-starvation
backstop already used elsewhere in the suite (a timer poll, not a render-loop-gated
recompute) so an idle pane still rolls the day over.

## 5. Kanban board

A **Lista ⇄ Board** toggle in the nav switches the render mode of the *current view*.

- **Columns reuse group-by.** Default `boardColumnsBy: 'status'` → Todo · In progress ·
  Done (Cancelled column optional/collapsible). A menu re-groups columns by **time**
  (Overdue / Today / Upcoming / No date) or **priority** (Highest…Lowest).
- **Cards** are the task-row at card density (same content, board rhythm).
- **Drag card → column** performs one write on the source line through the existing
  **guarded `line-edit`** (aborts if the line changed since indexing, with the existing
  undo affordance):
  - columns = status → status transition
  - columns = time → reschedule (`📅`)
  - columns = priority → set priority
- Board honors the active view's resolved filter (e.g. a Kanban of just Today).
- Column header shows label + **count pill** (accent).

## 6. Add-task

- A persistent **`+ New task`** in the nav header opens the existing quick-add modal
  (natural-language dates IT/EN, note picker, daily/inbox targeting) — unchanged logic,
  just a prominent, always-available entry point.
- The per-note-group **`+`** (quick-add straight into that note) must render in **every**
  view and grouping, not only note-grouping.

## 7. UX / UI — Filone B enrollment

Apply the suite "app panel" signature (ref. exo), **all values from theme variables**
(Cosmos-safe; Principle 0 — no hardcoded hex):

- **Nav strip**: segmented control, `--radius-s`; section headers uppercase, `0.06em`,
  `--text-faint`, `--font-ui-smaller`.
- **Icon buttons 28px**, `--radius-s`, hover `--background-modifier-hover`; **no focus
  ring on buttons**; inputs **quiet** (border-only focus).
- **Counts** (per view / per group / per column) = **accent pill**
  (`--interactive-accent` / `--text-on-accent`) with `tabular-nums`.
- **Single card rhythm**: identical padding / radius / border across list task-row and
  board card.
- Fonts inherit `--font-interface` (SF Pro on Mario's setup). Motion subtle, consistent
  with the suite.
- **Suite deliverable**: add Runway to `DESIGN-SYSTEM.md` (Filone B members) and tick the
  "map runway" item in `ALIGNMENT-TODO.md` (both in the vault theme kit).

Runway's `styles.css` already uses theme tokens (`--radius-*`, `--interactive-accent`,
`--color-*`, `--size-*`, `--shadow-s`), so this is a refinement, not a rewrite.

## 8. Architecture

New / changed units, each with one clear purpose:

| Unit | Kind | Responsibility |
|---|---|---|
| `src/core/views.ts` | **new**, pure, tested | `resolveView(viewId, today, settings) → { filterOverride, group, pins }`. Isolates Inbox/Today/Upcoming/All logic from render. No Obsidian imports. |
| `src/ui/view-nav.ts` | **new** | The nav strip: view segments + Lista/Board toggle + `+ New task`. |
| `src/ui/kanban.ts` | **new** | Board render; columns from group-by; drag → `task-edit`. |
| `src/ui/task-panel.ts` | change | Mount nav; switch list/board; demote filter bar to secondary. |
| `src/settings.ts`, `src/types.ts` | change | `defaultView`, `boardColumnsBy`; persist active view + mode in `panelState`. |
| `src/edits/task-edit.ts` | reuse | Drag actions route through existing guarded edits. |

Unchanged: `core/parse`, `core/serialize`, `core/query`, `index/*`, `api.ts`
(the public API keeps working; Horizon/Exo integration untouched).

## 9. Open items / assumptions

- **A3 (add-task meaning):** taken as **(a)** prominent new-task button. If Mario meant
  (b) attach a note to a task, or (c) create a project note, revise §6.
- Inbox redefinition (D3) changes the meaning of "Inbox" vs the current folder-based one;
  `inboxFolders` is preserved as a note-grouping pin, not removed.

## 10. Out of scope (YAGNI)

- No new task syntax, no recurrence-rule expansion, no separate database.
- No cross-note task dependencies, no calendar grid view (agenda grouping covers time).
- No multi-board / per-column WIP limits in v1.

## 11. Verification plan

- `pnpm build` (typecheck) + `pnpm test` (existing 11 core tests green + new
  `core/views.test.ts` covering Inbox/Today/Upcoming/All resolution incl. the
  daily-note-path Today branch and midnight rollover boundary).
- Manual smoke in vault via `.obsidian-plugin-dir` deploy: each view, board drag in all
  three column modes, quick-add from nav + per-note `+`, sidebar + full-page + phone
  density.
- Risk: **low** — additive, UI-heavy; the only new logic (`core/views.ts`) is pure and
  fully unit-tested.
