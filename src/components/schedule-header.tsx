import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card } from '@/components/ui/design';
import { Icon, type IconName } from '@/components/ui/icon';
import { usePalette } from '@/hooks/use-palette';
import { radius, semantic } from '@/lib/theme';
import { addWeeks, dateOf, isCurrentWeek, mondayOf } from '@/lib/week';

/**
 * The top of the Urnik screen, kept to two slim rows so the schedule gets the
 * screen.
 *
 * It used to be a title row plus a card holding the week picker, a status
 * line, three action buttons and the shift counts — about half a phone. The
 * schedule is what people open the tab for; everything else here is either
 * glanceable (week, status, counts) or occasional (rebuilding, copying), and
 * the occasional things now live behind "⋯" in `ScheduleActionsSheet`.
 *
 * Row 1: week on the left, view controls on the right.
 * Row 2: whatever the viewer needs at a glance — status and counts for a
 * manager, their own shifts for a worker. The screen passes it in as
 * children, so this file does not need to know about the team or schedule.
 */
export function ScheduleHeader({
  weekStart,
  onWeekChange,
  layout,
  onToggleLayout,
  editing,
  onToggleEditing,
  onMore,
  children,
}: {
  weekStart: Date;
  onWeekChange: (next: Date) => void;
  layout: 'grid' | 'vertical';
  onToggleLayout: () => void;
  /** Undefined for a worker: they have nothing to edit. */
  editing?: boolean;
  onToggleEditing?: () => void;
  /** Undefined for a worker: the actions are the manager's. */
  onMore?: () => void;
  children?: React.ReactNode;
}) {
  const c = usePalette();
  const relative = relativeWeek(weekStart);

  return (
    <View style={{ paddingHorizontal: 10, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        <WeekArrow direction="back" onPress={() => onWeekChange(addWeeks(-1, weekStart))} />

        <View style={{ alignItems: 'center', paddingHorizontal: 2 }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }}>
            {shortRange(weekStart)}
          </Text>
          {relative ? (
            <Text style={{ fontSize: 11, color: relative === 'Ta teden' ? c.accent : c.textTertiary }}>
              {relative}
            </Text>
          ) : null}
        </View>

        <WeekArrow direction="forward" onPress={() => onWeekChange(addWeeks(1, weekStart))} />

        <View style={{ flex: 1 }} />

        <HeaderButton
          icon={layout === 'grid' ? 'list' : 'layout'}
          label={layout === 'grid' ? 'Navpični pogled' : 'Tedenski pogled'}
          onPress={onToggleLayout}
        />

        {onToggleEditing ? (
          editing ? (
            <Pressable
              onPress={onToggleEditing}
              hitSlop={6}
              style={{
                height: 34,
                paddingHorizontal: 12,
                marginLeft: 6,
                justifyContent: 'center',
                borderRadius: radius.pill,
                backgroundColor: c.accent,
              }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>Končaj</Text>
            </Pressable>
          ) : (
            <HeaderButton icon="pencil" label="Uredi" onPress={onToggleEditing} />
          )
        ) : null}

        {onMore ? <HeaderButton icon="more" label="Več dejanj" onPress={onMore} /> : null}
      </View>

      {children ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 30, gap: 8 }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The screen opens on next week (the one being built), so the label says
 * which week this is relative to today rather than only flagging this one.
 */
function relativeWeek(weekStart: Date): string | null {
  const now = mondayOf(new Date());
  if (isCurrentWeek(weekStart)) return 'Ta teden';
  if (isCurrentWeek(addWeeks(-1, weekStart), now)) return 'Naslednji teden';
  if (isCurrentWeek(addWeeks(1, weekStart), now)) return 'Prejšnji teden';
  return null;
}

/** "28. 9. – 4. 10." — the year only when the week is not in this one. */
function shortRange(weekStart: Date): string {
  const end = dateOf(7, weekStart);
  const year = end.getFullYear() !== new Date().getFullYear() ? ` ${end.getFullYear()}` : '';
  return `${weekStart.getDate()}. ${weekStart.getMonth() + 1}. – ${end.getDate()}. ${
    end.getMonth() + 1
  }.${year}`;
}

function WeekArrow({ direction, onPress }: { direction: 'back' | 'forward'; onPress: () => void }) {
  const c = usePalette();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={direction === 'back' ? 'Prejšnji teden' : 'Naslednji teden'}
      style={{ width: 34, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Icon
        name={direction === 'back' ? 'chevronLeft' : 'chevronRight'}
        size={18}
        color={c.text}
        weight="semibold"
      />
    </Pressable>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const c = usePalette();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      style={{
        width: 34,
        height: 34,
        marginLeft: 6,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: c.fill,
      }}>
      <Icon name={icon} size={17} color={c.text} />
    </Pressable>
  );
}

/** OSNUTEK / OBJAVLJENO, or a worker's "3 SMENE". */
export function StatusPill({ label, tint }: { label: string; tint: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: tint + '2B',
      }}>
      <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: tint }}>
        {label}
      </Text>
    </View>
  );
}

/** Conflicts on the week, next to the status — the number is the whole message. */
export function ConflictCount({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <Icon name="warning" size={12} color={semantic.yellow} />
      <Text style={{ fontSize: 12, fontWeight: '700', color: semantic.yellow }}>{count}</Text>
    </View>
  );
}

/**
 * Publishing is the one action a draft week is waiting for, so it stays one
 * tap away instead of going into the sheet with the rest.
 */
export function PublishPill({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{
        height: 28,
        paddingHorizontal: 12,
        justifyContent: 'center',
        borderRadius: radius.pill,
        backgroundColor: semantic.green,
        opacity: disabled ? 0.5 : 1,
      }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Objavi</Text>
    </Pressable>
  );
}

/**
 * The manager's week actions, behind "⋯".
 *
 * The copy confirmation is rendered inside the sheet rather than after it
 * closes: on iOS a second modal cannot be presented while the first is still
 * animating away, so opening one straight after closing the other silently
 * shows nothing.
 */
export function ScheduleActionsSheet({
  visible,
  isPublished,
  working,
  copyNeedsConfirm,
  onClose,
  onRebuild,
  onCopy,
  onTogglePublished,
}: {
  visible: boolean;
  isPublished: boolean;
  working: boolean;
  /** The week already has shifts or is published, so ask before adding. */
  copyNeedsConfirm: boolean;
  onClose: () => void;
  onRebuild: () => void;
  onCopy: () => void;
  onTogglePublished: () => void;
}) {
  const c = usePalette();
  const [confirmingCopy, setConfirmingCopy] = useState(false);

  const run = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Sheet visible={visible} title="Teden" onClose={onClose}>
      <Card padding={6}>
        <ActionRow
          icon="wishes"
          title="Sestavi iz želja"
          detail="Doda manjkajoče smene iz oddanih želja. Ročno urejenih ne spremeni."
          disabled={working}
          onPress={() => run(onRebuild)}
        />
        <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: 10 }} />
        <ActionRow
          icon="copy"
          title="Kopiraj prejšnji teden"
          detail="Doda smene iz prejšnjega tedna. Obstoječe ostanejo."
          disabled={working}
          onPress={() => (copyNeedsConfirm ? setConfirmingCopy(true) : run(onCopy))}
        />
      </Card>

      <Card padding={6}>
        <ActionRow
          icon={isPublished ? 'lock' : 'check'}
          title={isPublished ? 'Prekliči objavo' : 'Objavi'}
          detail={
            isPublished
              ? 'Ekipa urnika tega tedna ne bo več videla.'
              : 'Ekipa bo urnik tega tedna videla.'
          }
          tint={isPublished ? semantic.red : semantic.green}
          disabled={working}
          onPress={() => run(onTogglePublished)}
        />
      </Card>

      <ConfirmDialog
        visible={confirmingCopy}
        title="Kopiram prejšnji teden?"
        message={
          isPublished
            ? 'Ta teden je že objavljen, zato bo ekipa kopirane smene videla takoj. Obstoječe smene ostanejo, dodajo se le manjkajoče.'
            : 'Ta teden že ima smene. Ostanejo, kot so; dodajo se le tiste iz prejšnjega tedna, ki jih še ni.'
        }
        confirmLabel="Kopiraj"
        busy={working}
        onConfirm={() => {
          setConfirmingCopy(false);
          run(onCopy);
        }}
        onCancel={() => setConfirmingCopy(false)}
      />
    </Sheet>
  );
}

function ActionRow({
  icon,
  title,
  detail,
  tint,
  disabled,
  onPress,
}: {
  icon: IconName;
  title: string;
  detail: string;
  tint?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const color = tint ?? c.accent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        opacity: disabled ? 0.5 : 1,
      }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color + '24',
        }}>
        <Icon name={icon} size={17} color={color} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: tint ?? c.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: c.textSecondary, lineHeight: 16 }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/**
 * A notice or error from the last action, one slim line that can be closed.
 *
 * It used to be a full message card that stayed until the next action, which
 * pushed the whole schedule down for good. Notices now also go away by
 * themselves; errors stay until closed, because an error nobody saw is worse
 * than one that is in the way.
 */
export function ScheduleBanner({
  text,
  kind,
  onDismiss,
}: {
  text: string;
  kind: 'error' | 'notice';
  onDismiss: () => void;
}) {
  const c = usePalette();
  const tint = kind === 'error' ? semantic.red : c.accent;

  // Held in a ref: the screen passes a fresh function every render, and
  // restarting the timer on each one would keep a notice up indefinitely.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (kind !== 'notice') return;
    const timer = setTimeout(() => dismiss.current(), 4000);
    return () => clearTimeout(timer);
  }, [kind, text]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 14,
        paddingLeft: 10,
        paddingVertical: 6,
        borderRadius: radius.sm,
        backgroundColor: tint + '1F',
        borderWidth: 1,
        borderColor: tint + '40',
      }}>
      <Icon name={kind === 'error' ? 'warning' : 'info'} size={13} color={tint} />
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 12, color: c.text, lineHeight: 16 }}>
        {text}
      </Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityLabel="Zapri"
        style={{ paddingHorizontal: 10 }}>
        <Text style={{ fontSize: 16, color: c.textSecondary }}>×</Text>
      </Pressable>
    </View>
  );
}
