import type { Priority } from '../types.ts';

/**
 * How a priority looks on screen. The file keeps the Tasks emoji (🔺⏫🔼🔽⏬),
 * which is the storage format; the UI shows Linear-style signal icons, which
 * take the theme's color and render the same on every platform.
 */
export const PRIORITY_ICON: Record<Priority, string> = {
  highest: 'alert-triangle',
  high: 'signal-high',
  medium: 'signal-medium',
  low: 'signal-low',
  lowest: 'signal-zero',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  highest: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  lowest: 'Lowest',
};

export const PRIORITIES: readonly Priority[] = ['highest', 'high', 'medium', 'low', 'lowest'];
