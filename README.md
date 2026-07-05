# Runway

Task management for [Obsidian](https://obsidian.md): a sidebar glance and a filterable full-page list over the checkbox tasks already in your notes. Fully compatible with the [Tasks plugin](https://publish.obsidian.md/tasks/) emoji syntax — your notes stay the source of truth, no migration, no separate database.

## Views

Sidebar and full page are the **same component** at two densities — identical filtering, grouping, accordion and keyboard behavior.

- **Sidebar** — a compact glance; defaults to the day-by-day **Agenda** grouping with the far buckets collapsed.
- **Task list** (workspace tab) — the full-density surface.

Both offer: a compact filter bar (text search + status pills + menu-chips for due / tag / folder / priority / sort / group), **collapsible accordion groups** (per-group + collapse-all, state persisted), grouping by **note (Inbox pinned first)** / date / **agenda** / priority / tag / folder, and **saved views** (bookmark menu → apply or save a named filter+sort+group preset; managed from settings).

- **Agenda grouping** — a day-by-day timeline: one bucket per calendar day from today to a configurable horizon (default 14 days, **Settings → Orizzonte Agenda**), with everything past-due folded into a single **Overdue** bucket up top and anything beyond the horizon into **Later**. Empty days never render a bucket, so the list stays tight. Each day header carries the weekday (or **Today** / **Tomorrow**) plus a faint date; the Overdue bucket reads red and Today is marked with a due-dot. Far buckets (Later / No date) open collapsed.

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
- **Quick-add** to today's daily note (created from your daily template if missing) or any picked note. The `+` on a note group header adds straight into that note. Quick-add understands trailing **natural-language dates** — "chiama Marco domani", "review lunedì", "x tra 3 giorni" (IT + EN) — with a live preview.

## Recurrence

`🔁 every [N] day|week|month|year [when done]` is handled: completing a recurring task spawns the next occurrence above and marks the current one done. Richer rules (specific weekdays, "every weekday") are left to the Tasks plugin — Runway opens the file instead of guessing.

## Status bar & commands

- Status bar shows an **overdue counter**; click it to open the list filtered to overdue.
- Commands: open list, open sidebar, quick-add, **Oggi** (overdue + due-today), and **Prossimi** (opens the list in the day-by-day Agenda grouping).
- **Agent / plugin API** at `app.plugins.plugins.runway.api`: `allTasks`, `query`, `overdue`, `today`, `createTask`, `completeTask`, `reschedule`, `setPriority`, `moveToNote`, `openForDay`. Sibling plugins (Horizon's "open the active day in Runway") and Exo drive tasks through it.

## Scope

The whole vault is indexed except `.obsidian/` and the folders listed in **Settings → Cartelle escluse** (default: `.archive`, `.claude`, `_system`, `Resources/Templates`). Tasks inside callouts and code blocks are not indexed (they are invisible to Obsidian's list-item cache).

## Development

```bash
pnpm install
pnpm dev        # watch build
pnpm build      # typecheck + production build
pnpm test       # node native tests (pure core)
pnpm lint
```

Create a `.obsidian-plugin-dir` file containing the absolute path of `<vault>/.obsidian/plugins/runway` to deploy builds straight into your vault.
