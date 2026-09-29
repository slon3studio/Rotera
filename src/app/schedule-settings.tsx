import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';

import { DestructiveButton, Sheet, SheetFootnote, SheetRow } from '@/components/sheet';
import { Message } from '@/components/ui/auth-parts';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SwipeToDelete } from '@/components/ui/swipe-to-delete';
import { AppBackground, Card, EmptyHint, PositionBadge, SectionTitle } from '@/components/ui/design';
import { TimeField } from '@/components/ui/time-field';
import { useAuth } from '@/contexts/auth';
import { useCatalog } from '@/hooks/use-catalog';
import { useOrgSettings, slotName, type ScheduleSettings } from '@/hooks/use-org-settings';
import { usePalette } from '@/hooks/use-palette';
import * as time from '@/lib/time';
import { positionColors, radius, semantic } from '@/lib/theme';
import type { Duty, Position, ShiftSlot } from '@/types';

/**
 * Everything about how *this* organization's schedule is shaped.
 *
 * Which halves of the day it runs, when each one starts and ends, and its own
 * vocabulary. Every new organization is still seeded with a restaurant's
 * words (Šank / Strežba, Priprava / Rajon+Smeti / Roba, from
 * create_organization in 0007); a shop needs Blagajna, Skladišče, Polnjenje,
 * so they have to be editable here.
 *
 * One screen rather than three, because these settings are read together: the
 * times mean nothing without knowing which slots are live, and a position is
 * only useful for a slot that exists.
 */
export default function ScheduleSettingsScreen() {
  const c = usePalette();
  const { session } = useAuth();
  const catalog = useCatalog();
  const org = useOrgSettings();

  // Derived, not mirrored: null until something is edited, so a save made
  // elsewhere shows through instead of being overwritten by stale state.
  const [edits, setEdits] = useState<ScheduleSettings | null>(null);

  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [editingDuty, setEditingDuty] = useState<Duty | null>(null);
  const [addingPosition, setAddingPosition] = useState(false);
  const [addingDuty, setAddingDuty] = useState(false);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);
  const [deletingDuty, setDeletingDuty] = useState<Duty | null>(null);

  useFocusEffect(
    useCallback(() => {
      void catalog.load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (!session) return null;
  const { organization } = session;

  const stored: ScheduleSettings = {
    morning_start: organization.morning_start,
    morning_end: organization.morning_end,
    afternoon_start: organization.afternoon_start,
    afternoon_end: organization.afternoon_end,
    uses_morning: organization.uses_morning,
    uses_afternoon: organization.uses_afternoon,
  };
  const settings = edits ?? stored;
  const changed = (Object.keys(stored) as (keyof ScheduleSettings)[]).some(
    (key) => settings[key] !== stored[key],
  );

  const patch = (next: Partial<ScheduleSettings>) => {
    org.clearMessages();
    setEdits({ ...settings, ...next });
  };

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={catalog.loading} onRefresh={() => void catalog.load()} />
        }>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={{ fontSize: 22, color: c.accent }}>‹</Text>
          </Pressable>
          <Text style={{ fontSize: 26, fontWeight: '700', color: c.text }}>Nastavitve urnika</Text>
        </View>

        {catalog.error ? <Message text={catalog.error} kind="error" /> : null}
        {catalog.notice ? <Message text={catalog.notice} kind="notice" /> : null}

        <SectionTitle text="Katere smene delate" />
        <Card>
          <SlotRow
            slot="morning"
            enabled={settings.uses_morning}
            canDisable={settings.uses_afternoon}
            onToggle={(on) => patch({ uses_morning: on })}
            start={settings.morning_start}
            end={settings.morning_end}
            onStart={(value) => patch({ morning_start: value })}
            onEnd={(value) => patch({ morning_end: value })}
          />

          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 14 }} />

          <SlotRow
            slot="afternoon"
            enabled={settings.uses_afternoon}
            canDisable={settings.uses_morning}
            onToggle={(on) => patch({ uses_afternoon: on })}
            start={settings.afternoon_start}
            end={settings.afternoon_end}
            onStart={(value) => patch({ afternoon_start: value })}
            onEnd={(value) => patch({ afternoon_end: value })}
          />

          {changed ? (
            <Pressable
              onPress={() => {
                void org.save(settings).then((ok) => {
                  if (ok) setEdits(null);
                });
              }}
              disabled={org.saving}
              style={{
                marginTop: 16,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm,
                backgroundColor: c.accent,
                opacity: org.saving ? 0.6 : 1,
              }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>
                {org.saving ? 'Shranjujem…' : 'Shrani nastavitve smen'}
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <Text style={{ fontSize: 12, color: c.textTertiary }}>
          Izklopljena smena izgine iz urnika in iz oddaje želja. Smene, ki so že na urniku,
          ostanejo — izklop velja za naprej.
        </Text>

        {org.error ? <Message text={org.error} kind="error" /> : null}
        {org.notice ? <Message text={org.notice} kind="notice" /> : null}

        <Card>
          <SectionTitle text="Delovna mesta" trailing="Šank, Rajon …" />
          <View style={{ height: 12 }} />

          {catalog.positions.length === 0 ? (
            <EmptyHint text="Ni delovnih mest." />
          ) : (
            catalog.positions.map((position, index) => (
              <View key={position.id}>
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />
                ) : null}
                <SwipeToDelete
                  accessibilityLabel={`Izbriši ${position.name}`}
                  onDelete={() => setDeletingPosition(position)}>
                  <Pressable onPress={() => setEditingPosition(position)}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 4,
                      }}>
                      <PositionBadge position={position} size={10} />
                      <Text
                        style={{
                          fontSize: 15,
                          color: position.is_active ? c.text : c.textSecondary,
                        }}>
                        {position.name}
                      </Text>
                      {!position.is_active ? <HiddenPill /> : null}
                      <View style={{ flex: 1 }} />
                      <Text style={{ fontSize: 14, color: c.textTertiary }}>›</Text>
                    </View>
                  </Pressable>
                </SwipeToDelete>
              </View>
            ))
          )}

          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />

          <Pressable
            onPress={() => {
              catalog.clearMessages();
              setAddingPosition(true);
            }}
            disabled={catalog.working}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: c.accent }}>
              + Dodaj delovno mesto
            </Text>
          </Pressable>
        </Card>

        <Card>
          <SectionTitle text="Zadolžitve" trailing="Priprava, Roba …" />
          <View style={{ height: 12 }} />

          {catalog.duties.length === 0 ? (
            <EmptyHint text="Ni zadolžitev." />
          ) : (
            catalog.duties.map((duty, index) => (
              <View key={duty.id}>
                {index > 0 ? (
                  <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />
                ) : null}
                <SwipeToDelete
                  accessibilityLabel={`Izbriši ${duty.name}`}
                  onDelete={() => setDeletingDuty(duty)}>
                  <Pressable onPress={() => setEditingDuty(duty)}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 4,
                      }}>
                      <Text
                        style={{ fontSize: 15, color: duty.is_active ? c.text : c.textSecondary }}>
                        {duty.name}
                      </Text>
                      {!duty.is_active ? <HiddenPill /> : null}
                      <View style={{ flex: 1 }} />
                      <Text style={{ fontSize: 14, color: c.textTertiary }}>›</Text>
                    </View>
                  </Pressable>
                </SwipeToDelete>
              </View>
            ))
          )}

          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 12 }} />

          <Pressable
            onPress={() => {
              catalog.clearMessages();
              setAddingDuty(true);
            }}
            disabled={catalog.working}>
            <Text style={{ fontSize: 15, fontWeight: '500', color: c.accent }}>
              + Dodaj zadolžitev
            </Text>
          </Pressable>
        </Card>

        <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center' }}>
          Povleci vrstico v levo za izbris. Izklop je varnejši: smene in želje, ki se nanj
          sklicujejo, ostanejo nedotaknjene.
        </Text>
      </ScrollView>

      {editingPosition || addingPosition ? (
        <PositionSheet
          key={editingPosition?.id ?? 'new-position'}
          position={editingPosition}
          uses={editingPosition ? catalog.usesOf(editingPosition.id) : 0}
          onDelete={() => {
            if (editingPosition) void catalog.deletePosition(editingPosition.id);
            setEditingPosition(null);
          }}
          onClose={() => {
            setEditingPosition(null);
            setAddingPosition(false);
          }}
          onSave={(name, label, color, active) => {
            if (editingPosition) {
              void catalog.updatePosition(editingPosition.id, name, label, color, active);
            } else {
              void catalog.addPosition(name, label, color);
            }
          }}
        />
      ) : null}

      {editingDuty || addingDuty ? (
        <DutySheet
          key={editingDuty?.id ?? 'new-duty'}
          duty={editingDuty}
          uses={editingDuty ? catalog.usesOf(editingDuty.id) : 0}
          onDelete={() => {
            if (editingDuty) void catalog.deleteDuty(editingDuty.id);
            setEditingDuty(null);
          }}
          onClose={() => {
            setEditingDuty(null);
            setAddingDuty(false);
          }}
          onSave={(name, active) => {
            if (editingDuty) void catalog.updateDuty(editingDuty.id, name, active);
            else void catalog.addDuty(name);
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={!!deletingPosition}
        title={deletingPosition ? `Izbrišem "${deletingPosition.name}"?` : ''}
        message={usageWarning(
          deletingPosition ? catalog.usesOf(deletingPosition.id) : 0,
          'Pri teh smenah in željah bo delovno mesto ostalo prazno.',
        )}
        confirmLabel="Izbriši"
        destructive
        busy={catalog.working}
        onConfirm={() => {
          if (deletingPosition) void catalog.deletePosition(deletingPosition.id);
          setDeletingPosition(null);
        }}
        onCancel={() => setDeletingPosition(null)}
      />

      <ConfirmDialog
        visible={!!deletingDuty}
        title={deletingDuty ? `Izbrišem "${deletingDuty.name}"?` : ''}
        message={usageWarning(
          deletingDuty ? catalog.usesOf(deletingDuty.id) : 0,
          'Pri teh smenah bo zadolžitev ostala prazna.',
        )}
        confirmLabel="Izbriši"
        destructive
        busy={catalog.working}
        onConfirm={() => {
          if (deletingDuty) void catalog.deleteDuty(deletingDuty.id);
          setDeletingDuty(null);
        }}
        onCancel={() => setDeletingDuty(null)}
      />
    </View>
  );
}

/**
 * What the confirmation says, given how many things point at the entry.
 *
 * Deleting is allowed either way — this is the only place the cost is stated,
 * so it has to be stated plainly rather than as a general warning nobody
 * reads. `null` means the count is unknown, which is itself worth saying.
 */
function usageWarning(uses: number | null, consequence: string) {
  if (uses === null) return 'Tega ni mogoče razveljaviti.';
  if (uses === 0) return 'Nič se ne sklicuje nanj. Tega ni mogoče razveljaviti.';
  return `Uporabljeno v ${uses} vnosih. ${consequence} Tega ni mogoče razveljaviti.`;
}

function HiddenPill() {
  const c = usePalette();
  return (
    <View
      style={{
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: c.fill,
      }}>
      <Text style={{ fontSize: 9, fontWeight: '800', color: c.textSecondary }}>SKRITO</Text>
    </View>
  );
}

const PALETTE = [
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'pink',
  'teal',
  'brown',
  'gray',
] as const;

function PositionSheet({
  position,
  uses,
  onClose,
  onSave,
  onDelete,
}: {
  uses: number | null;
  onDelete: () => void;
  position: Position | null;
  onClose: () => void;
  onSave: (name: string, shortLabel: string, color: string, isActive: boolean) => void;
}) {
  const c = usePalette();
  // Mounted with a key, so props are the initial state and nothing has to be
  // synced back in afterwards.
  const [name, setName] = useState(position?.name ?? '');
  const [shortLabel, setShortLabel] = useState(position?.short_label ?? '');
  const [color, setColor] = useState(position?.color ?? 'blue');
  const [isActive, setIsActive] = useState(position?.is_active ?? true);

  const previewLabel =
    shortLabel.trim().slice(0, 3).toUpperCase() || name.charAt(0).toUpperCase() || '?';

  return (
    <Sheet
      visible
      title={position ? 'Uredi' : 'Novo delovno mesto'}
      confirmDisabled={!name.trim()}
      onClose={onClose}
      onConfirm={() => {
        onSave(name, shortLabel, color, isActive);
        onClose();
      }}>
      <Card>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ime, npr. Šank"
          placeholderTextColor={c.textTertiary}
          autoCapitalize="words"
          style={{ fontSize: 16, color: c.text, minHeight: 40 }}
        />
        <View style={{ height: 1, backgroundColor: c.border }} />
        <SheetRow label="Oznaka">
          <TextInput
            value={shortLabel}
            onChangeText={setShortLabel}
            placeholder={previewLabel}
            placeholderTextColor={c.textTertiary}
            autoCapitalize="characters"
            maxLength={3}
            style={{ fontSize: 16, color: c.text, minWidth: 60, textAlign: 'right' }}
          />
        </SheetRow>
      </Card>
      <SheetFootnote text="Oznaka je tisto, kar piše poleg imena na urniku — največ trije znaki. Če je ne vpišeš, vzame prvo črko imena." />

      <SectionTitle text="Barva" />
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {PALETTE.map((option) => (
            <Pressable key={option} onPress={() => setColor(option)}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: positionColors[option],
                  borderWidth: color === option ? 3 : 0,
                  borderColor: c.text,
                }}
              />
            </Pressable>
          ))}
        </View>
      </Card>
      {/* The palette is fixed rather than free hex so a badge stays legible in
          both light and dark mode. */}
      <SheetFootnote text="Nabor je omejen, da je oznaka berljiva v svetlem in temnem načinu." />

      <Card>
        <SheetRow label="Predogled">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>Ana Kovač</Text>
            <View
              style={{
                paddingHorizontal: 4,
                paddingVertical: 1.5,
                borderRadius: radius.pill,
                backgroundColor: positionColors[color] ?? positionColors.gray,
              }}>
              <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff' }}>{previewLabel}</Text>
            </View>
          </View>
        </SheetRow>
      </Card>

      {position ? (
        <>
          <Card>
            <SheetRow label="V uporabi">
              <Switch value={isActive} onValueChange={setIsActive} />
            </SheetRow>
          </Card>
          <SheetFootnote text="Izklopljeno delovno mesto se ne pojavi več pri oddaji želja in pri razporejanju. Obstoječi vnosi ostanejo." />

          <RemoveRow
            uses={uses}
            label="Izbriši delovno mesto"
            confirmTitle={`Izbrišem "${position.name}"?`}
            consequence="Pri teh smenah in željah bo delovno mesto ostalo prazno."
            onDelete={onDelete}
          />
        </>
      ) : null}
    </Sheet>
  );
}

function DutySheet({
  duty,
  uses,
  onClose,
  onSave,
  onDelete,
}: {
  uses: number | null;
  onDelete: () => void;
  duty: Duty | null;
  onClose: () => void;
  onSave: (name: string, isActive: boolean) => void;
}) {
  const c = usePalette();
  const [name, setName] = useState(duty?.name ?? '');
  const [isActive, setIsActive] = useState(duty?.is_active ?? true);

  return (
    <Sheet
      visible
      title={duty ? 'Uredi' : 'Nova zadolžitev'}
      confirmDisabled={!name.trim()}
      onClose={onClose}
      onConfirm={() => {
        onSave(name, isActive);
        onClose();
      }}>
      <Card>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ime, npr. Priprava"
          placeholderTextColor={c.textTertiary}
          style={{ fontSize: 16, color: c.text, minHeight: 40 }}
        />
      </Card>
      <SheetFootnote text="Zadolžitev se na urniku izpiše pod imenom osebe." />

      {duty ? (
        <>
          <Card>
            <SheetRow label="V uporabi">
              <Switch value={isActive} onValueChange={setIsActive} />
            </SheetRow>
          </Card>
          <SheetFootnote text="Izklopljena zadolžitev se ne pojavi več pri razporejanju. Obstoječi vnosi ostanejo." />

          <RemoveRow
            uses={uses}
            label="Izbriši zadolžitev"
            confirmTitle={`Izbrišem "${duty.name}"?`}
            consequence="Pri teh smenah bo zadolžitev ostala prazna."
            onDelete={onDelete}
          />
        </>
      ) : null}
    </Sheet>
  );
}

/**
 * Delete, with the cost stated.
 *
 * Deleting is unconditional by the owner's decision, so the only protection
 * left is that the confirmation names how many shifts and wishes it will blank
 * — an informed choice rather than a blocked one.
 */
function RemoveRow({
  uses,
  label,
  confirmTitle,
  consequence,
  onDelete,
}: {
  uses: number | null;
  label: string;
  confirmTitle: string;
  consequence: string;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <DestructiveButton title={label} onPress={() => setConfirming(true)} />
      <SheetFootnote text="Lahko ga tudi samo izklopiš zgoraj — takrat se nikjer ne izgubi." />

      <ConfirmDialog
        visible={confirming}
        title={confirmTitle}
        message={usageWarning(uses, consequence)}
        confirmLabel="Izbriši"
        destructive
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/**
 * One half of the day: on or off, and when it runs.
 *
 * The times stay editable while the slot is off, just dimmed — turning a slot
 * back on and finding its old hours intact is less surprising than finding
 * them reset, and the manager may well want to set the hours before switching
 * it on.
 */
function SlotRow({
  slot,
  enabled,
  canDisable,
  onToggle,
  start,
  end,
  onStart,
  onEnd,
}: {
  slot: ShiftSlot;
  enabled: boolean;
  /** False when this is the only slot left on. The database refuses having
   *  none, and a switch you can flip only to be told no is worse than one
   *  that will not flip. */
  canDisable: boolean;
  onToggle: (on: boolean) => void;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
}) {
  const c = usePalette();
  const tint = slot === 'morning' ? semantic.teal : semantic.orange;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: enabled ? tint : c.textTertiary,
          }}
        />
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: '600',
            color: enabled ? c.text : c.textSecondary,
          }}>
          {slotName[slot]}
        </Text>
        <Switch value={enabled} onValueChange={onToggle} disabled={enabled && !canDisable} />
      </View>

      <View style={{ opacity: enabled ? 1 : 0.45, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 14, color: c.textSecondary }}>Začetek</Text>
          <TimeField
            value={time.toDate(start)}
            onChange={(next) => onStart(time.fromDate(next))}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flex: 1, fontSize: 14, color: c.textSecondary }}>Konec</Text>
          <TimeField value={time.toDate(end)} onChange={(next) => onEnd(time.fromDate(next))} />
        </View>

        {time.minutes(end, true) <= time.minutes(start) ? (
          <Text style={{ fontSize: 11, color: semantic.orange }}>
            Konec je pred začetkom — smena bo tekla čez polnoč.
          </Text>
        ) : null}
      </View>
    </View>
  );
}
