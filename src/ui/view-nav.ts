import { setIcon } from 'obsidian';

import { VIEW_IDS, VIEW_LABELS } from '../core/views.ts';
import type { ViewId } from '../core/views.ts';

export interface ViewNavOptions {
  active: ViewId;
  mode: 'list' | 'board';
  onSelect: (view: ViewId) => void;
  onToggleMode: () => void;
  onNewTask: () => void;
}

/** Segmented view nav + list/board toggle + add-task, styled Filone B. */
export function renderViewNav(parent: HTMLElement, opts: ViewNavOptions): void {
  const nav = parent.createDiv({ cls: 'runway-nav' });

  const seg = nav.createDiv({ cls: 'runway-nav__views' });
  for (const view of VIEW_IDS) {
    const btn = seg.createEl('button', {
      cls: 'runway-nav__view',
      text: VIEW_LABELS[view],
    });
    btn.toggleClass('is-active', view === opts.active);
    btn.addEventListener('click', () => opts.onSelect(view));
  }

  const actions = nav.createDiv({ cls: 'runway-nav__actions' });

  const mode = actions.createEl('button', { cls: 'runway-iconbtn', attr: { 'aria-label': 'Lista / Board' } });
  setIcon(mode, opts.mode === 'board' ? 'list' : 'columns-3');
  mode.addEventListener('click', () => opts.onToggleMode());

  const add = actions.createEl('button', { cls: 'runway-nav__add' });
  setIcon(add.createSpan({ cls: 'runway-nav__add-icon' }), 'plus');
  add.createSpan({ text: 'New task' });
  add.addEventListener('click', () => opts.onNewTask());
}
