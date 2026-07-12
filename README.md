# Runway

Task management for [Obsidian](https://obsidian.md): **fixed views** (Inbox · Oggi · Prossimi · Tutti) and a **Kanban board** over the checkbox tasks already in your notes. Fully compatible with the [Tasks plugin](https://publish.obsidian.md/tasks/) emoji syntax — your notes stay the source of truth, no migration, no separate database.

## Views

A fixed **view nav** slices the list by time — the primary navigation:

- **Inbox** — tasks with no date.
- **Oggi** — due today (overdue folded in) **plus** anything in today's daily note, with the daily note pinned first.
- **Prossimi** — the day-by-day **Agenda** of what's ahead.
- **Tutti** — everything.

Sidebar and full page are the **same component** at two densities. The chrome is two rows: the nav, and a full-width search. Sort, grouping and the status / tag / folder / priority filters live under the nav overflow (`⋯`); **saved views** live there too (apply or save a named filter+sort+group preset). Accordion groups collapse per-group or all at once, state persisted.

- **Agenda grouping** (Prossimi) — a day-by-day timeline: one bucket per calendar day from today to a configurable horizon (default 14 days, **Settings → Orizzonte Agenda**), with everything past-due folded into a single **Overdue** bucket and anything beyond the horizon into **Later**. Empty days never render. Each day header carries the weekday (or **Today** / **Tomorrow**) plus a faint date.

### Board (Kanban)

A **Lista ⇄ Board** toggle renders the current view as columns. Pick the column dimension inline — **Stato / Tempo / Priorità** (**Settings → Board columns** sets the default). Drag a card between columns to change its **status**, **reschedule** it, or set its **priority** — through the same guarded line edit as the list; non-droppable columns (e.g. Overdue) reject drops. Each column's `+` quick-adds a task pre-filled for that column (Todo, Oggi / Senza data, or a priority).

## Interactions & keyboard

Cursor navigation and multi-selection:

- `j` / `k` move a cursor · `x` complete · `e` edit · `enter` / `o` open · `space` toggle selection · `esc` clear.
- Multi-select via `space` or modifier/shift-click; a bulk bar offers **Complete / Reschedule / Move** on the whole selection.

## Task syntax

Standard Tasks-plugin emoji format:

```markdown
- [ ] Prepare demo ⏫ 📅 2026-07-10 ⏳ 2026-07-05 #project [[Context]]
```

- Statuses: `[ ]` todo · `[x]` done · `[/]` in progress · `[-]` cancelled
- Dates: `📅` due · `⏳` scheduled · `✅` done · `❌` cancelled
- Priority: `🔺 ⏫ 🔼 🔽 ⏬`
- Date-driven views use the **effective date**: `📅` due if present, else `⏳` scheduled.

Unmanaged fields (`🔁` recurrence, `🛫`, `➕`, block IDs) are preserved verbatim and never edited.

## Editing

Everything writes back to the source note through a guarded line edit — the write aborts if the line changed since it was indexed:

- Check / uncheck (writes and removes `✅ date`), status transitions, reschedule (with 10s undo), priority and description edit.
- **Move to note**: relocate a task line between notes (append-first, so a mid-flight failure can only duplicate — never lose — the task).
- **Quick-add** to today's daily note (created from your daily template if missing) or any picked note. A persistent **`+ Nuovo task`** in the nav, the `+` on a note group header (straight into that note), and the per-column `+` in the board all open it. Quick-add understands trailing **natural-language dates** — "chiama Marco domani", "review lunedì", "x tra 3 giorni" (IT + EN) — with a live preview.

## Recurrence

`🔁 every [N] day|week|month|year [when done]` is handled: completing a recurring task spawns the next occurrence above and marks the current one done. Richer rules (specific weekdays, "every weekday") are left to the Tasks plugin — Runway opens the file instead of guessing.

## Status bar & commands

- Status bar shows an **overdue counter**; click it to open the list filtered to overdue.
- Commands: open list, open sidebar, quick-add, **Oggi** (overdue + due-today), and **Prossimi** (opens the list in the day-by-day Agenda grouping).
- **Agent / plugin API** at `app.plugins.plugins.runway.api`: `allTasks`, `query`, `overdue`, `today`, `createTask`, `completeTask`, `reschedule`, `setPriority`, `moveToNote`, `openForDay`. Sibling plugins (Horizon's "open the active day in Runway") and Exo drive tasks through it.

## Scope

The whole vault is indexed except `.obsidian/` and the folders listed in **Settings → Cartelle escluse** (default: `.archive`). Tasks inside callouts and code blocks are not indexed (they are invisible to Obsidian's list-item cache).

## Mobile

**Playable** — `isDesktopOnly: false` in `manifest.json`; `styles.css` has `.is-mobile`/`.is-phone` layout rules (revealed tap actions, tighter padding) plus a `@media (pointer: coarse)` MOBILE KIT block that brings every interactive control to a 44px effective tap target (full controls via `min-height: 44px`; small in-card glyph buttons keep their visual size and get an invisible `::after` hit-area instead; hover-revealed action clusters are forced visible since hover doesn't exist on touch).

## Development

```bash
pnpm install
pnpm dev        # watch build
pnpm build      # typecheck + production build
pnpm test       # node native tests (pure core)
pnpm lint
```

Create a `.obsidian-plugin-dir` file containing the absolute path of `<vault>/.obsidian/plugins/runway` to deploy builds straight into your vault.
