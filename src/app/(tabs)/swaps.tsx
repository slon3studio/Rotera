import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { useTabBarSpace } from '@/components/ui/tab-bar';
import { Message } from '@/components/ui/auth-parts';
import {
  AppBackground,
  Card,
  EmptyHint,
  InitialsAvatar,
  PersonChip,
  PositionBadge,
  SectionTitle,
} from '@/components/ui/design';
import { useAppData } from '@/contexts/app-data';
import { useAuth } from '@/contexts/auth';
import { usePalette } from '@/hooks/use-palette';
import { useSchedule } from '@/hooks/use-schedule';
import { radius, semantic } from '@/lib/theme';
import * as time from '@/lib/time';
import { addWeeks, dayName, mondayOf } from '@/lib/week';
import { Icon } from '@/components/ui/icon';
import type { CoverRequest, CoverStatus, ShiftSwap } from '@/types';
import { coverStatusLabel, slotLabel, swapStatusLabel } from '@/types';

export default function SwapsScreen() {
  const c = usePalette();
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuth();
  const { team, cover, swaps } = useAppData();
  const schedule = useSchedule();

  const isManager = session?.profile.role === 'manager';

  /**
   * Cover requests can point at shifts in any week, so the schedule is loaded
   * for this week and the next two to resolve day and time. Anything further
   * out shows without its details rather than not at all.
   */
  const loadNearbyWeeks = useCallback(async () => {
    const thisWeek = mondayOf(new Date());
    await schedule.loadWeeks([thisWeek, addWeeks(1, thisWeek), addWeeks(2, thisWeek)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read on every focus, not once on mount: a catalog change or an approved
  // cover made elsewhere would otherwise still be invisible here.
  useFocusEffect(
    useCallback(() => {
      void schedule.loadLookups();
      void loadNearbyWeeks();
      void cover.load();
      void swaps.load();
      void team.load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadNearbyWeeks]),
  );

  const refresh = useCallback(async () => {
    cover.clearMessages();
    swaps.clearMessages();
    await Promise.all([loadNearbyWeeks(), cover.load(), swaps.load(), team.load()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!session) return null;
  const me = session.profile.id;

  /** Whether the signed-in worker already works that day and slot, which is
   *  what makes a claim unapprovable. */
  const alreadyWorking = (request: CoverRequest) => {
    const shift = schedule.shiftById(request.shift_id);
    if (!shift) return false;

    return schedule.shifts.some(
      (other) =>
        other.id !== shift.id &&
        other.week_start_date === shift.week_start_date &&
        other.day_of_week === shift.day_of_week &&
        other.slot === shift.slot &&
        other.assigned_worker_id === me,
    );
  };

  const waiting = cover.requests.filter((r) => r.status === 'claimed');
  const unclaimed = cover.requests.filter((r) => r.status === 'open');
  const available = cover.openForOthers(me);
  const mine = cover.mine(me);
  const inProgress = cover.active.filter(
    (r) => r.status === 'claimed' && r.requested_by !== me && r.claimed_by !== me,
  );

  const acceptedSwaps = swaps.swaps.filter((s) => s.status === 'accepted');
  const incomingSwaps = swaps.incoming(me);
  const mySwaps = swaps.mine(me);

  /**
   * What sets your own rows apart from everybody else's.
   *
   * A left stripe alone was too quiet — on a screen of near-identical cards
   * the eye needs the whole card to change, not four pixels of it. The tinted
   * border plus the MOJA pill means you can find your own at a glance without
   * reading a single name.
   */
  const mineCard = (mine: boolean) =>
    mine ? { borderColor: c.accent + '80', backgroundColor: c.accentSoft } : undefined;

  const card = (request: CoverRequest, actions: React.ReactNode) => {
    const shift = schedule.shiftById(request.shift_id);
    // "Mine" is either side of it: the one who asked, or the one who took it.
    const isMine = request.requested_by === me || request.claimed_by === me;

    return (
      <View key={request.id} style={{ position: 'relative' }}>
        <Card style={mineCard(isMine)}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}>
            <KindPill label="MENJAVA" tint={statusTint(request.status)} />
            {isMine ? <KindPill label="MOJA" tint={c.accent} /> : null}
            <View style={{ flex: 1 }} />
            <StatusPill status={request.status} />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            <InitialsAvatar name={team.nameOf(request.requested_by)} size={38} />

            <View style={{ flex: 1, gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '600', color: c.text }}>
                  {team.nameOf(request.requested_by)}
                </Text>
                {shift ? (
                  <PositionBadge position={schedule.positionOf(shift.position_id)} />
                ) : null}
              </View>

              <Text style={{ fontSize: 12, color: shift ? c.textSecondary : c.textTertiary }}>
                {shift
                  ? `${dayName(shift.day_of_week)} · ${time.range(shift.start_time, shift.end_time)}`
                  : 'Smena iz drugega tedna'}
              </Text>
            </View>
          </View>

          {request.note ? (
            <Text
              style={{
                fontSize: 12,
                fontStyle: 'italic',
                color: c.textSecondary,
                backgroundColor: c.fill,
                borderRadius: radius.sm,
                padding: 10,
                marginTop: 12,
              }}>
              „{request.note}”
            </Text>
          ) : null}

          {request.claimed_by ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Text style={{ fontSize: 12, color: c.textSecondary }}>→</Text>
              <PersonChip name={team.nameOf(request.claimed_by)} highlighted />
            </View>
          ) : null}

          {actions ? (
            <View
              style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              {actions}
            </View>
          ) : null}
        </Card>

        <View
          style={{
            position: 'absolute',
            left: 1,
            top: 14,
            bottom: 14,
            borderRadius: 2,
            width: 4,
            backgroundColor: statusTint(request.status),
          }}
        />
      </View>
    );
  };

  /**
   * A rotation card shows both sides stacked, because the whole point is the
   * pairing. Reusing the cover card would have shown one shift and hidden the
   * other, which is exactly the confusion the two names are meant to prevent.
   */
  const swapCard = (swap: ShiftSwap, actions: React.ReactNode) => {
    const involvesMe = swap.requester_id === me || swap.target_id === me;

    return (
      <View key={swap.id} style={{ position: 'relative' }}>
        <Card style={mineCard(involvesMe)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <KindPill label="ROTACIJA" tint={semantic.purple} />
            {involvesMe ? <KindPill label="MOJA" tint={c.accent} /> : null}
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 10, fontWeight: '600', color: c.textSecondary }}>
              {swapStatusLabel[swap.status]}
            </Text>
          </View>

          <View style={{ gap: 8, marginTop: 12 }}>
            {swapSide(swap.requester_id, swap.requester_shift_id)}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Icon name="rotate" size={13} color={semantic.purple} />
              <Text style={{ fontSize: 11, color: c.textSecondary }}>zamenjata smeni</Text>
            </View>
            {swapSide(swap.target_id, swap.target_shift_id)}
          </View>

          {swap.note ? (
            <Text
              style={{
                fontSize: 12,
                fontStyle: 'italic',
                color: c.textSecondary,
                backgroundColor: c.fill,
                borderRadius: radius.sm,
                padding: 10,
                marginTop: 12,
              }}>
              „{swap.note}”
            </Text>
          ) : null}

          {actions ? (
            <View
              style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              {actions}
            </View>
          ) : null}
        </Card>

        <View
          style={{
            position: 'absolute',
            left: 1,
            top: 14,
            bottom: 14,
            borderRadius: 2,
            width: 4,
            backgroundColor: semantic.purple,
          }}
        />
      </View>
    );
  };

  const swapSide = (workerId: string, shiftId: string) => {
    const shift = schedule.shiftById(shiftId);

    return (
      <View
        key={shiftId}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <InitialsAvatar name={team.nameOf(workerId)} size={30} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
            {team.nameOf(workerId)}
          </Text>
          <Text style={{ fontSize: 11, color: shift ? c.textSecondary : c.textTertiary }}>
            {shift
              ? `${dayName(shift.day_of_week)} · ${slotLabel[shift.slot]} · ${time.range(shift.start_time, shift.end_time)}`
              : 'Smena iz drugega tedna'}
          </Text>
        </View>
        {shift ? <PositionBadge position={schedule.positionOf(shift.position_id)} /> : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 14, paddingBottom: tabBarSpace }}
        refreshControl={<RefreshControl refreshing={cover.loading} onRefresh={refresh} />}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: c.text }}>Menjave</Text>

        {cover.error ?? swaps.error ? (
          <Message text={(cover.error ?? swaps.error) as string} kind="error" />
        ) : null}
        {cover.notice ?? swaps.notice ? (
          <Message text={(cover.notice ?? swaps.notice) as string} kind="notice" />
        ) : null}

        {isManager ? (
          <>
            <SectionTitle
              text="Za odobritev"
              trailing={waiting.length ? String(waiting.length) : undefined}
            />
            {waiting.length === 0 ? (
              <Card>
                <EmptyHint text="Nič ne čaka na tvojo odločitev." />
              </Card>
            ) : (
              waiting.map((request) =>
                card(
                  request,
                  <>
                    <ActionChip
                      label="Odobri"
                      tint={semantic.green}
                      filled
                      onPress={() => void cover.resolve(request.id, true)}
                      disabled={cover.working}
                    />
                    <ActionChip
                      label="Zavrni"
                      tint={semantic.red}
                      onPress={() => void cover.resolve(request.id, false)}
                      disabled={cover.working}
                    />
                  </>,
                ),
              )
            )}

            <SectionTitle
              text="Rotacije za odobritev"
              trailing={acceptedSwaps.length ? String(acceptedSwaps.length) : undefined}
            />
            {acceptedSwaps.length === 0 ? (
              <Card>
                <EmptyHint text="Nobena rotacija ne čaka na tvojo potrditev." />
              </Card>
            ) : (
              acceptedSwaps.map((swap) =>
                swapCard(
                  swap,
                  <>
                    <ActionChip
                      label="Odobri"
                      tint={semantic.green}
                      filled
                      onPress={() => void swaps.resolve(swap.id, true)}
                      disabled={swaps.working}
                    />
                    <ActionChip
                      label="Zavrni"
                      tint={semantic.red}
                      onPress={() => void swaps.resolve(swap.id, false)}
                      disabled={swaps.working}
                    />
                  </>,
                ),
              )
            )}

            <SectionTitle text="Še nihče ni prevzel" />
            {unclaimed.length === 0 ? (
              <Card>
                <EmptyHint text="Ni odprtih prošenj." />
              </Card>
            ) : (
              unclaimed.map((request) =>
                card(
                  request,
                  <ActionChip
                    label="Zavrni"
                    tint={semantic.red}
                    onPress={() => void cover.resolve(request.id, false)}
                    disabled={cover.working}
                  />,
                ),
              )
            )}
          </>
        ) : (
          <>
            <SectionTitle
              text="Na voljo za prevzem"
              trailing={available.length ? String(available.length) : undefined}
            />
            {available.length === 0 ? (
              <Card>
                <EmptyHint
                  text={
                    cover.active.length === 0
                      ? 'V organizaciji ni nobene aktivne menjave.'
                      : 'Trenutno ni smen, ki bi jih lahko prevzel.'
                  }
                />
              </Card>
            ) : (
              available.map((request) =>
                card(
                  request,
                  alreadyWorking(request) ? (
                    // The database refuses this too, but saying so up front
                    // beats letting someone tap and be told no.
                    <Text style={{ fontSize: 12, color: c.textSecondary }}>
                      Že delaš to smeno
                    </Text>
                  ) : (
                    <ActionChip
                      label="Prevzamem"
                      tint={c.accent}
                      filled
                      onPress={() => void cover.claim(request.id)}
                      disabled={cover.working}
                    />
                  ),
                ),
              )
            )}

            {inProgress.length > 0 ? (
              <>
                <SectionTitle text="V teku pri sodelavcih" />
                {inProgress.map((request) => card(request, null))}
              </>
            ) : null}

            <SectionTitle
              text="Rotacije zame"
              trailing={incomingSwaps.length ? String(incomingSwaps.length) : undefined}
            />
            {incomingSwaps.length === 0 ? (
              <Card>
                <EmptyHint text="Nihče ti ne predlaga rotacije." />
              </Card>
            ) : (
              incomingSwaps.map((swap) =>
                swapCard(
                  swap,
                  <>
                    <ActionChip
                      label="Sprejmem"
                      tint={c.accent}
                      filled
                      onPress={() => void swaps.respond(swap.id, true)}
                      disabled={swaps.working}
                    />
                    <ActionChip
                      label="Zavrnem"
                      tint={semantic.red}
                      onPress={() => void swaps.respond(swap.id, false)}
                      disabled={swaps.working}
                    />
                  </>,
                ),
              )
            )}

            <SectionTitle text="Moje menjave" />
            {mine.length === 0 ? (
              <Card>
                <EmptyHint text="Nimaš aktivnih menjav." />
              </Card>
            ) : (
              mine.map((request) =>
                card(
                  request,
                  <ActionChip
                    label={request.requested_by === me ? 'Prekliči' : 'Umakni se'}
                    tint={semantic.red}
                    onPress={() =>
                      void (request.requested_by === me
                        ? cover.cancel(request.id)
                        : cover.unclaim(request.id))
                    }
                    disabled={cover.working}
                  />,
                ),
              )
            )}

            <SectionTitle text="Moje rotacije" />
            {mySwaps.length === 0 ? (
              <Card>
                <EmptyHint text="Nimaš aktivnih rotacij." />
              </Card>
            ) : (
              mySwaps.map((swap) =>
                swapCard(
                  swap,
                  swap.requester_id === me ? (
                    <ActionChip
                      label="Prekliči"
                      tint={semantic.red}
                      onPress={() => void swaps.cancel(swap.id)}
                      disabled={swaps.working}
                    />
                  ) : null,
                ),
              )
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Names the kind on the card itself, so the two can never be read as one. */
function KindPill({ label, tint }: { label: string; tint: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: tint + '24',
      }}>
      <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: tint }}>
        {label}
      </Text>
    </View>
  );
}

function statusTint(status: CoverStatus): string {
  if (status === 'open') return semantic.red;
  if (status === 'claimed') return semantic.orange;
  if (status === 'approved') return semantic.green;
  return '#8E8E93';
}

function StatusPill({ status }: { status: CoverStatus }) {
  const tint = statusTint(status);

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: radius.pill,
        backgroundColor: tint + '2B',
      }}>
      <Text style={{ fontSize: 10, fontWeight: '600', color: tint }}>
        {coverStatusLabel[status]}
      </Text>
    </View>
  );
}

function ActionChip({
  label,
  tint,
  filled,
  onPress,
  disabled,
}: {
  label: string;
  tint: string;
  filled?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.pill,
        backgroundColor: filled ? tint : tint + '24',
        opacity: disabled ? 0.5 : 1,
      }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: filled ? '#fff' : tint }}>
        {label}
      </Text>
    </Pressable>
  );
}
