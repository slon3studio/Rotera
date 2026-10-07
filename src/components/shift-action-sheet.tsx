import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DestructiveButton, Sheet, SheetFootnote, SheetRow } from '@/components/sheet';
import { Message } from '@/components/ui/auth-parts';
import { Card, PersonChip, PositionBadge, SectionTitle } from '@/components/ui/design';
import { Icon } from '@/components/ui/icon';
import type { CoverHook } from '@/hooks/use-cover';
import { usePalette } from '@/hooks/use-palette';
import type { ScheduleHook } from '@/hooks/use-schedule';
import type { SwapsHook } from '@/hooks/use-swaps';
import type { TeamHook } from '@/hooks/use-team';
import { radius, semantic } from '@/lib/theme';
import * as time from '@/lib/time';
import { dayName } from '@/lib/week';
import type { Shift } from '@/types';
import { coverStatusLabel, slotLabel, swapStatusLabel } from '@/types';

/**
 * Everything a worker can do with one shift, reached by tapping it on the
 * schedule.
 *
 * Before this, a cover request could only be claimed from the Menjave tab,
 * which meant seeing a red shift on the schedule and then having to go hunt
 * for it in a list. The schedule is where people look, so the schedule is
 * where the actions belong.
 *
 * Which of the six states you get is decided here rather than by the caller,
 * because the rules are about the *data* — whose shift it is, and what is
 * already in flight for it — not about the screen that opened the sheet.
 */
export function ShiftActionSheet({
  shift,
  meId,
  schedule,
  team,
  cover,
  swaps,
  onClose,
}: {
  shift: Shift;
  meId: string;
  schedule: ScheduleHook;
  team: TeamHook;
  cover: CoverHook;
  swaps: SwapsHook;
  onClose: () => void;
}) {
  const c = usePalette();
  const [note, setNote] = useState('');
  const [pickingRotation, setPickingRotation] = useState(false);

  const isMine = shift.assigned_worker_id === meId;
  const ownerName = shift.assigned_worker_id
    ? team.nameOf(shift.assigned_worker_id)
    : 'Prosto';

  const coverRequest = cover.requestFor(shift.id);
  const swap = swaps.swapForShift(shift.id);
  const busy = cover.working || swaps.working;
  const errorMessage = cover.error ?? swaps.error;

  /**
   * My shifts this shift could trade with. Filtered here rather than letting
   * the database refuse later: a shift already tied up in a cover request or
   * another rotation cannot be swapped, and offering it would only produce a
   * refusal the person cannot act on.
   */
  const swappableMine = schedule.shifts.filter(
    (other) =>
      other.assigned_worker_id === meId &&
      other.id !== shift.id &&
      other.week_start_date === shift.week_start_date &&
      !cover.shiftIdsAwaitingCover.has(other.id) &&
      !swaps.shiftIdsInSwap.has(other.id),
  );

  /** Only closes on success, so a refusal stays on screen with its reason. */
  const run = async (action: () => Promise<boolean>) => {
    if (await action()) onClose();
  };

  const title = isMine ? 'Moja smena' : ownerName;

  return (
    <Sheet visible title={title} onClose={onClose}>
      <>
        <Card>
          <SheetRow label="Kdo" value={ownerName} />
          <SheetRow label="Dan" value={dayName(shift.day_of_week)} />
          <SheetRow label="Smena" value={slotLabel[shift.slot]} />
          <SheetRow label="Čas" value={time.range(shift.start_time, shift.end_time)} />
        </Card>

        {errorMessage ? <Message text={errorMessage} kind="error" /> : null}

        {swap ? (
          <RotationState
            swap={swap}
            meId={meId}
            team={team}
            schedule={schedule}
            busy={busy}
            onRespond={(accept) => run(() => swaps.respond(swap.id, accept))}
            onCancel={() => run(() => swaps.cancel(swap.id))}
          />
        ) : coverRequest ? (
          <CoverState
            request={coverRequest}
            isMine={isMine}
            meId={meId}
            team={team}
            busy={busy}
            onCancel={() => run(() => cover.cancel(coverRequest.id))}
            onClaim={() => run(() => cover.claim(coverRequest.id))}
            onUnclaim={() => run(() => cover.unclaim(coverRequest.id))}
          />
        ) : isMine ? (
          <>
            <SectionTitle text="Zakaj ne moreš" />
            <Card>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Razlog (neobvezno)"
                placeholderTextColor={c.textTertiary}
                multiline
                style={{ minHeight: 60, fontSize: 15, color: c.text }}
              />
            </Card>
            <SheetFootnote text="Prošnjo za menjavo vidijo vsi sodelavci. Ko jo kdo prevzame, mora menjavo potrditi še vodja." />

            <BigButton
              label="Zaprosi za menjavo"
              icon="swap"
              busy={busy}
              onPress={() => void run(() => cover.requestCover(shift.id, note))}
            />
          </>
        ) : pickingRotation ? (
          <>
            <SectionTitle
              text="S katero svojo smeno"
              trailing={swappableMine.length ? String(swappableMine.length) : undefined}
            />
            {swappableMine.length === 0 ? (
              <Card>
                <Text style={{ fontSize: 13, color: c.textSecondary }}>
                  Ta teden nimaš proste smene, ki bi jo lahko zamenjal. Rotacija je možna samo
                  znotraj istega tedna, in smena, ki je že v menjavi, ne šteje.
                </Text>
              </Card>
            ) : (
              swappableMine.map((mine) => (
                <Pressable
                  key={mine.id}
                  disabled={busy}
                  onPress={() => void run(() => swaps.propose(mine.id, shift.id, note))}>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: '600', color: c.text }}>
                            {dayName(mine.day_of_week)}
                          </Text>
                          <PositionBadge position={schedule.positionOf(mine.position_id)} />
                        </View>
                        <Text style={{ fontSize: 12, color: c.textSecondary }}>
                          {slotLabel[mine.slot]} · {time.range(mine.start_time, mine.end_time)}
                        </Text>
                      </View>
                      <Icon name="rotate" size={17} color={semantic.purple} />
                    </View>
                  </Card>
                </Pressable>
              ))
            )}
            <SheetFootnote text="Ti dobiš njegovo smeno, on tvojo. Potrditi morata še sodelavec in vodja." />
          </>
        ) : (
          <>
            <SheetFootnote text="Menjava pomeni, da smeno prevzameš in sodelavec ta dan ne dela. Rotacija pomeni, da si smeni zamenjata — oba delata, samo drug drugega." />

            <BigButton
              label="Predlagaj rotacijo"
              icon="rotate"
              busy={busy}
              onPress={() => setPickingRotation(true)}
            />
          </>
        )}
      </>
    </Sheet>
  );
}

/** A rotation already in flight, from whichever side is looking at it. */
function RotationState({
  swap,
  meId,
  team,
  schedule,
  busy,
  onRespond,
  onCancel,
}: {
  swap: import('@/types').ShiftSwap;
  meId: string;
  team: TeamHook;
  schedule: ScheduleHook;
  busy: boolean;
  onRespond: (accept: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const c = usePalette();

  const iAmRequester = swap.requester_id === meId;
  const iAmTarget = swap.target_id === meId;
  const theirShift = schedule.shiftById(
    iAmRequester ? swap.target_shift_id : swap.requester_shift_id,
  );
  const myShift = schedule.shiftById(
    iAmRequester ? swap.requester_shift_id : swap.target_shift_id,
  );

  return (
    <>
      <Message text={`Rotacija — ${swapStatusLabel[swap.status]}`} kind="notice" />

      <Card>
        <View style={{ gap: 10 }}>
          <Pair
            label={team.nameOf(swap.requester_id)}
            shift={schedule.shiftById(swap.requester_shift_id)}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="rotate" size={14} color={semantic.purple} />
            <Text style={{ fontSize: 12, color: c.textSecondary }}>zamenjata smeni</Text>
          </View>
          <Pair
            label={team.nameOf(swap.target_id)}
            shift={schedule.shiftById(swap.target_shift_id)}
          />
        </View>
      </Card>

      {swap.note ? (
        <Card>
          <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textSecondary }}>
            „{swap.note}”
          </Text>
        </Card>
      ) : null}

      {iAmTarget && swap.status === 'pending' ? (
        <>
          <SheetFootnote
            text={
              myShift && theirShift
                ? `Če sprejmeš, delaš ${dayName(theirShift.day_of_week)} namesto ${dayName(myShift.day_of_week)}.`
                : 'Če sprejmeš, si smeni zamenjata.'
            }
          />
          <BigButton
            label="Sprejmem rotacijo"
            icon="check"
            busy={busy}
            onPress={() => void onRespond(true)}
          />
          <DestructiveButton
            title="Zavrnem"
            disabled={busy}
            onPress={() => void onRespond(false)}
          />
        </>
      ) : iAmRequester ? (
        <DestructiveButton
          title={busy ? 'Pošiljam…' : 'Prekliči rotacijo'}
          disabled={busy}
          onPress={() => void onCancel()}
        />
      ) : (
        <SheetFootnote text="To rotacijo urejata sodelavca med sabo." />
      )}
    </>
  );
}

/** A cover request already in flight. */
function CoverState({
  request,
  isMine,
  meId,
  team,
  busy,
  onCancel,
  onClaim,
  onUnclaim,
}: {
  request: import('@/types').CoverRequest;
  isMine: boolean;
  meId: string;
  team: TeamHook;
  busy: boolean;
  onCancel: () => Promise<void>;
  onClaim: () => Promise<void>;
  onUnclaim: () => Promise<void>;
}) {
  const c = usePalette();
  const iClaimedIt = request.claimed_by === meId;

  return (
    <>
      <Message text={`Menjava — ${coverStatusLabel[request.status]}`} kind="notice" />

      {request.note ? (
        <Card>
          <Text style={{ fontSize: 13, fontStyle: 'italic', color: c.textSecondary }}>
            „{request.note}”
          </Text>
        </Card>
      ) : null}

      {request.claimed_by ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 12, color: c.textSecondary }}>Prevzel:</Text>
          <PersonChip name={team.nameOf(request.claimed_by)} highlighted />
        </View>
      ) : null}

      {isMine ? (
        <DestructiveButton
          title={busy ? 'Pošiljam…' : 'Prekliči prošnjo'}
          disabled={busy}
          onPress={() => void onCancel()}
        />
      ) : iClaimedIt ? (
        <>
          <SheetFootnote text="Smeno si prevzel. Dokler vodja ne potrdi, se lahko še umakneš." />
          <DestructiveButton
            title="Umakni se"
            disabled={busy}
            onPress={() => void onUnclaim()}
          />
        </>
      ) : request.status === 'open' ? (
        <>
          <SheetFootnote text="Če prevzameš, ta dan delaš ti. Potrditi mora še vodja." />
          <BigButton
            label="Prevzemi menjavo"
            icon="swap"
            busy={busy}
            onPress={() => void onClaim()}
          />
        </>
      ) : (
        <SheetFootnote text="Smeno je prevzel že nekdo drug. Čaka se potrditev vodje." />
      )}
    </>
  );
}

function Pair({ label, shift }: { label: string; shift: Shift | null }) {
  const c = usePalette();

  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{label}</Text>
      <Text style={{ fontSize: 12, color: shift ? c.textSecondary : c.textTertiary }}>
        {shift
          ? `${dayName(shift.day_of_week)} · ${slotLabel[shift.slot]} · ${time.range(shift.start_time, shift.end_time)}`
          : 'Smena iz drugega tedna'}
      </Text>
    </View>
  );
}

function BigButton({
  label,
  icon,
  busy,
  onPress,
}: {
  label: string;
  icon: 'swap' | 'rotate' | 'check';
  busy: boolean;
  onPress: () => void;
}) {
  const c = usePalette();

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{
        flexDirection: 'row',
        gap: 8,
        minHeight: 50,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: c.accent,
        opacity: busy ? 0.6 : 1,
      }}>
      <Icon name={icon} size={17} color="#fff" />
      <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff' }}>
        {busy ? 'Pošiljam…' : label}
      </Text>
    </Pressable>
  );
}
