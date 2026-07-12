# Changelog

All notable changes to Runway are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); versions map to `versions.json`.

## 0.3.0

### Added

- **Fixed view nav** — a primary segmented nav (**Inbox · Oggi · Prossimi ·
  Tutti**) that slices the list by time. Inbox = tasks with no date; Oggi =
  due-today (incl. overdue) plus anything living in today's daily note, with the
  daily note pinned first; Prossimi = the day-by-day agenda of what's ahead;
  Tutti = everything. The view is the only time switch — the old duplicate
  segment row is gone.
- **Kanban board** — a Lista ⇄ Board toggle renders the current view as columns.
  Columns are configurable inline (**Stato / Tempo / Priorità**); drag a card
  between columns to change its status, reschedule it, or set its priority, all
  through the same guarded line edit as the list. Each column offers a `+` that
  quick-adds a task pre-filled for that column (Todo, Oggi / Senza data, or a
  priority).
- **Prominent add-task** — a persistent `+ Nuovo task` in the nav.
- **Per-view empty states** — tailored copy and icon for each view (Inbox
  pulita, Niente per oggi, …) with a distinct variant when a search/filter is
  active.
- **Settings** — `defaultView` and `boardColumnsBy`.

### Changed

- **Minimal chrome** — two rows: the nav, and a full-width search. Sort,
  grouping and the status/tag/folder/priority filters all live under the nav
  overflow (`⋯`).
- **UX refined to the suite design system** (Filone B "app panel"): aligned
  rails, 120ms motion, complete focus/hover/active states, accent count pills —
  every value from a theme variable, so it tracks the active theme.

## 0.2.1

- Fixes and polish over 0.2.0.

## 0.2.0

- Agenda grouping, saved views, quick-add with natural-language dates,
  recurrence handling, and the plugin API (`app.plugins.plugins.runway.api`).

## 0.1.0

- Initial release: sidebar glance + filterable task list over Tasks-plugin
  emoji-syntax checkboxes.
