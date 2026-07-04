# Runway — design system

Shared DNA of Mario's Obsidian plugin suite, as applied to Runway. Reference implementations: `obsidian-horizon/styles.css` (task chips, semantic colors, custom checks), `obsidian-masonry/styles.css` (full-page header + toolbar), `obsidian-superbasetags/styles.css` (sidebar panel), `obsidian-exo/styles.css` (card rhythm, micro-labels).

## Foundations

- **Theme-agnostic**: Obsidian native CSS variables only. No fixed colors except through `--color-*` palette vars.
- **Radii**: `--radius-s` for rows/chips, `--radius-m` for containers/inputs. (Exo equivalent: r1 6 / r2 9.)
- **Motion**: `80ms ease` for hover states (horizon), `140ms cubic-bezier(0.25, 1, 0.5, 1)` for surfaces (masonry). Respect `prefers-reduced-motion`.
- **Focus**: `outline: 2px solid var(--interactive-accent); outline-offset: 2px` on every focusable.
- **Numbers**: `font-variant-numeric: tabular-nums` on every count and date.

## Semantic task colors (horizon convention — do not invent new ones)

| State | Color |
|---|---|
| due | `--color-orange` |
| overdue | `--color-red` |
| scheduled | `--color-cyan` |
| done | `--color-green` |
| neutral/none | `--text-faint` / `--text-muted` |

## Components

- **Custom checkbox** (horizon `chip__check`): 13px square, 3px radius, 1.5px border in state color; done = filled green with CSS checkmark; in-progress = cyan with inner dot; cancelled = faint with slash; unknown = dashed.
- **Panel header (sidebar)**: tracked micro-label — `font-ui-smaller`, `letter-spacing: 0.08em`, uppercase, `--text-faint`, semibold (superbasetags). 24px transparent icon buttons, hover `--background-modifier-hover`.
- **Page header (full page)**: bold title `clamp(1.25rem…1.8rem)`, weight 700, `letter-spacing: -0.035em` + faint tabular count at baseline; toolbar right with 36px controls on `--background-secondary` + 1px `--background-modifier-border` (masonry).
- **Search**: input with absolute icon inside, `--background-secondary`, no box-shadow (masonry) — or borderless input inside a form-field pill (superbasetags) in narrow panels.
- **Rows**: compact (5–6px vertical padding), `--radius-s`, hover `--background-modifier-hover`; actions hidden until row hover.
- **Section heads**: `font-ui-medium`/600/`--text-muted` group titles on the page (masonry group-title); tracked faint micro-labels in the sidebar.
- **Date chips**: 5px state-colored dot + date text, no emoji, no filled background; overdue label text goes red.
