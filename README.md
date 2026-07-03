# Runway

Task management for [Obsidian](https://obsidian.md): a sidebar glance and a filterable full-page list over the checkbox tasks already in your notes. Fully compatible with the [Tasks plugin](https://publish.obsidian.md/tasks/) emoji syntax — your notes stay the source of truth, no migration, no separate database.

## Views

- **Sidebar** — daily glance: *In ritardo* / *Oggi* / *Prossimi N giorni*, plus one-click quick-add.
- **Task list** (workspace tab) — one flat list with on-the-fly filters (text, status, tag, folder, due preset), sorting (due / priority / note) and grouping (date / priority / tag / folder). Filter state persists per tab.

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

## Interactions

Everything writes back to the source note through a guarded line edit — the write aborts if the line changed since it was indexed:

- Check / uncheck (writes and removes `✅ date`)
- Status transitions to in-progress and cancelled
- Reschedule: Oggi / Domani / +1 settimana / date picker, with 10s undo
- Priority and description edit
- Quick-add to today's daily note (created from your daily template if missing) or any picked note

## Scope

The whole vault is indexed except `.obsidian/` and the folders listed in **Settings → Cartelle escluse** (default: `.archive`). Tasks inside callouts and code blocks are not indexed (they are invisible to Obsidian's list-item cache).

Recurrence (`🔁`) is out of scope: recurring tasks can only be completed from the file, and Runway opens it for you.

## Development

```bash
pnpm install
pnpm dev        # watch build
pnpm build      # typecheck + production build
pnpm test       # node native tests (pure core)
pnpm lint
```

Create a `.obsidian-plugin-dir` file containing the absolute path of `<vault>/.obsidian/plugins/runway` to deploy builds straight into your vault.
