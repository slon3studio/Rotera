import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/ui/tab-bar';
import { Icon } from '@/components/ui/icon';
import { Message, PrimaryButton } from '@/components/ui/auth-parts';
import {
  AppBackground,
  Card,
  PersonChip,
  PositionChips,
  PreferenceSelector,
  SectionTitle,
  SlotLabel,
  WeekPicker,
  preferenceTint,
} from '@/components/ui/design';
import { useAppData } from '@/contexts/app-data';
import { useAuth } from '@/contexts/auth';
import { useAvailability } from '@/hooks/use-availability';
import { usePalette } from '@/hooks/use-palette';
import { largeTitle, semantic } from '@/lib/theme';
import { ALL_DAYS, dayDescription, dayName, defaultWeek } from '@/lib/week';
import type { DaySelection, ShiftPreference, ShiftSlot } from '@/types';
import { enabledSlots, preferenceAllowsPosition } from '@/types';

export default function WishesScreen() {
  const { session } = useAuth();
  const isManager = session?.profile.role === 'manager';
  return isManager ? <ManagerWishes /> : <WorkerWishes />;
}

/** Worker: mark what you can work each day, and for which position. */
function WorkerWishes() {
  const c = usePalette();
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuth();
  const availability = useAvailability();

  const [weekStart, setWeekStart] = useState(defaultWeek());
  /**
   * Null until the worker edits something, and then it wins.
   *
   * Derived rather than mirrored: copying the server rows into state inside an
   * effect means two sources of truth and a cascading render every time a load
   * finishes. This way the saved rows show through until there is a local edit.
   */
  const [edits, setEdits] = useState<Record<number, DaySelection> | null>(null);

  // Re-read on every focus, not once on mount: a catalog change or an approved
  // cover made elsewhere would otherwise still be invisible here.
  useFocusEffect(
    useCallback(() => {
      void availability.loadPositions();
      void availability.loadWeek(weekStart);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart]),
  );

  useEffect(() => {
    void availability.loadWeek(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  if (!session) return null;

  const slots = enabledSlots(session.organization);
  const selections = edits ?? availability.selectionsFor(session.profile.id);
  const working = Object.values(selections).filter((s) => s.preference !== 'off').length;

  const reload = async (week: Date) => {
    availability.clearMessages();
    setEdits(null);
    await availability.loadWeek(week);
  };

  const setPreference = (day: number, preference: ShiftPreference) => {
    availability.clearMessages();
    setEdits((current) => ({
      ...(current ?? selections),
      [day]: {
        preference,
        // Clearing the position when the day goes to "Prosto" mirrors what
        // save_availability() does server-side, so the UI never shows a
        // position that would silently be dropped on save.
        positionId: preferenceAllowsPosition(preference)
          ? (selections[day]?.positionId ?? null)
          : null,
      },
    }));
  };

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 14, paddingBottom: tabBarSpace }}
        refreshControl={
          <RefreshControl refreshing={availability.loading} onRefresh={() => void reload(weekStart)} />
        }>
        <Text style={{ ...largeTitle, color: c.text }}>Želje</Text>

        <Card padding={6}>
          <WeekPicker
            weekStart={weekStart}
            onChange={(next) => {
              setEdits(null);
              setWeekStart(next);
            }}
          />
        </Card>

        {!availability.hasSubmitted(session.profile.id) ? (
          <Card padding={13}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="warning" size={14} color={semantic.yellow} />
              <Text style={{ fontSize: 13, color: c.text }}>
                Za ta teden še nisi oddal želja.
              </Text>
            </View>
          </Card>
        ) : null}

        <SectionTitle
          text="Kdaj lahko delaš"
          trailing={working === 0 ? 'prosto ves teden' : `${working} od 7 dni`}
        />

        {ALL_DAYS.map((day) => {
          const selection = selections[day] ?? { preference: 'off' as ShiftPreference, positionId: null };
          const isWorking = selection.preference !== 'off';

          return (
            <View key={day} style={{ position: 'relative' }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>
                    {dayName(day)}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 12, color: c.textSecondary }}>
                    {dayDescription(day, weekStart)}
                  </Text>
                </View>

                <View style={{ height: 12 }} />

                <PreferenceSelector
                  value={selection.preference}
                  onChange={(next) => setPreference(day, next)}
                  slots={slots}
                />

                {isWorking && availability.positions.length > 0 ? (
                  <View style={{ marginTop: 12, gap: 7 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: c.textSecondary }}>
                      Delovno mesto
                    </Text>
                    <PositionChips
                      positions={availability.positions}
                      value={selection.positionId}
                      onChange={(positionId) => {
                        availability.clearMessages();
                        setEdits((current) => ({
                          ...(current ?? selections),
                          [day]: { preference: selections[day]?.preference ?? 'off', positionId },
                        }));
                      }}
                    />
                  </View>
                ) : null}
              </Card>

              {/* A colour stripe makes the week scannable: which days are
                  mornings, which afternoons, which off. */}
              <View
                style={{
                  position: 'absolute',
                  left: 1,
                  top: 14,
                  bottom: 14,
                  width: 4,
                  borderRadius: 2,
                  backgroundColor: preferenceTint(selection.preference, c.accent),
                  opacity: isWorking ? 1 : 0.35,
                }}
              />
            </View>
          );
        })}

        {availability.error ? <Message text={availability.error} kind="error" /> : null}
        {availability.notice ? <Message text={availability.notice} kind="notice" /> : null}

        <PrimaryButton
          title="Shrani"
          loading={availability.saving}
          disabled={availability.loading}
          onPress={() =>
            void availability.save(weekStart, selections).then((ok) => {
              // On success the server rows are authoritative again.
              if (ok) setEdits(null);
            })
          }
        />

        <Text style={{ fontSize: 12, color: c.textTertiary, textAlign: 'center' }}>
          Urejaš lahko, dokler vodja ne objavi urnika.
        </Text>
      </ScrollView>
    </View>
  );
}

/** Manager: who is available, per day, per slot. The raw material. */
function ManagerWishes() {
  const c = usePalette();
  const tabBarSpace = useTabBarSpace();
  const { team } = useAppData();
  const availability = useAvailability();
  const [weekStart, setWeekStart] = useState(defaultWeek());

  // Re-read on every focus, not once on mount: a catalog change or an approved
  // cover made elsewhere would otherwise still be invisible here.
  useFocusEffect(
    useCallback(() => {
      void availability.loadPositions();
      void availability.loadWeek(weekStart);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart]),
  );

  useEffect(() => {
    void availability.loadWeek(weekStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const missing = team.workers.filter((worker) => !availability.hasSubmitted(worker.id));
  const submitted = team.workers.length - missing.length;

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 14, paddingBottom: tabBarSpace }}
        refreshControl={
          <RefreshControl
            refreshing={availability.loading}
            onRefresh={() => {
              void availability.loadWeek(weekStart);
              void team.load();
            }}
          />
        }>
        <Text style={{ ...largeTitle, color: c.text }}>Želje ekipe</Text>

        <Card padding={6}>
          <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
        </Card>

        {/* Without this the manager cannot tell "nobody is free on Thursday"
            from "nobody has filled it in yet" — two different problems. */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>Oddane želje</Text>
            <View style={{ flex: 1 }} />
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color:
                  team.workers.length === 0
                    ? c.textSecondary
                    : missing.length === 0
                      ? semantic.green
                      : semantic.orange,
              }}>
              {submitted} / {team.workers.length}
            </Text>
          </View>

          <View style={{ height: 10 }} />

          {team.workers.length === 0 ? (
            <Text style={{ fontSize: 13, color: c.textSecondary }}>
              V organizaciji še ni nobenega zaposlenega. Deli kodo za pridružitev iz svojega profila.
            </Text>
          ) : missing.length === 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Icon name="check" size={14} color={semantic.green} />
              <Text style={{ fontSize: 13, color: semantic.green }}>Vsi so oddali.</Text>
            </View>
          ) : (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {missing.map((worker) => (
                  <PersonChip key={worker.id} name={worker.full_name} />
                ))}
              </View>
              <Text style={{ fontSize: 12, color: c.textTertiary, marginTop: 8 }}>
                Ti še niso oddali.
              </Text>
            </>
          )}
        </Card>

        <SectionTitle text="Po dnevih" />

        {ALL_DAYS.map((day) => (
          <Card key={day}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>{dayName(day)}</Text>
              <View style={{ flex: 1 }} />
              <Text style={{ fontSize: 12, color: c.textSecondary }}>
                {dayDescription(day, weekStart)}
              </Text>
            </View>

            {(['morning', 'afternoon'] as ShiftSlot[]).map((slot, index) => {
              const entries = availability.availableFor(day, slot);

              return (
                <View key={slot} style={{ marginTop: 12 }}>
                  {index === 1 ? (
                    <View style={{ height: 1, backgroundColor: c.border, marginBottom: 12 }} />
                  ) : null}

                  <SlotLabel slot={slot} count={entries.length} />

                  <View style={{ height: 8 }} />

                  {entries.length === 0 ? (
                    <Text style={{ fontSize: 12, color: c.textTertiary }}>Nihče ni na voljo</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {entries.map((entry) => (
                        <PersonChip
                          key={entry.id}
                          name={team.nameOf(entry.worker_id)}
                          position={availability.positionOf(entry.position_id)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </Card>
        ))}

        {availability.error ? <Message text={availability.error} kind="error" /> : null}
      </ScrollView>
    </View>
  );
}
