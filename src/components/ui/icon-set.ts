/**
 * One icon vocabulary for the whole app.
 *
 * Names are what the icon *means* here, not what the platform calls it — so a
 * screen asks for `swap` and gets an SF Symbol on iOS (the same one the Xcode
 * app used), a Material symbol on Android and an Ionicon in the browser,
 * without any screen knowing the difference.
 *
 * Kept apart from the components so `icon.tsx` and `icon.web.tsx` can share it
 * rather than each carrying its own copy to drift out of step.
 */
export const ICONS = {
  schedule: { ios: 'calendar', android: 'calendar_month', ion: 'calendar-outline' },
  wishes: { ios: 'hand.raised', android: 'back_hand', ion: 'hand-left-outline' },
  swap: {
    ios: 'arrow.triangle.2.circlepath',
    android: 'swap_horiz',
    ion: 'swap-horizontal',
  },
  profile: { ios: 'person.crop.circle', android: 'account_circle', ion: 'person-circle-outline' },
  person: { ios: 'person', android: 'person', ion: 'person-outline' },
  mail: { ios: 'envelope', android: 'mail', ion: 'mail-outline' },
  lock: { ios: 'lock', android: 'lock', ion: 'lock-closed-outline' },
  home: { ios: 'house', android: 'home', ion: 'home-outline' },
  tag: { ios: 'tag', android: 'label', ion: 'pricetag-outline' },
  trash: { ios: 'trash', android: 'delete', ion: 'trash-outline' },
  warning: {
    ios: 'exclamationmark.triangle.fill',
    android: 'warning',
    ion: 'warning',
  },
  info: { ios: 'info.circle', android: 'info', ion: 'information-circle-outline' },
  check: { ios: 'checkmark', android: 'check', ion: 'checkmark' },
  more: { ios: 'ellipsis', android: 'more_horiz', ion: 'ellipsis-horizontal' },
  layout: { ios: 'square.grid.3x3', android: 'grid_view', ion: 'grid-outline' },
  list: { ios: 'list.bullet', android: 'view_agenda', ion: 'list-outline' },
  pencil: { ios: 'pencil', android: 'edit', ion: 'pencil-outline' },
  code: { ios: 'number', android: 'numbers', ion: 'keypad-outline' },
  rotate: { ios: 'arrow.2.squarepath', android: 'sync_alt', ion: 'repeat' },
  copy: { ios: 'doc.on.doc', android: 'content_copy', ion: 'copy-outline' },
  settings: { ios: 'gearshape', android: 'settings', ion: 'settings-outline' },
  chevronLeft: { ios: 'chevron.left', android: 'arrow_back_ios', ion: 'chevron-back' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', ion: 'chevron-forward' },
} as const;

export type IconName = keyof typeof ICONS;
export type IconWeight = 'regular' | 'medium' | 'semibold' | 'bold';
