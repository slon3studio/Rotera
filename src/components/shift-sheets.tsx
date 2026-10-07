import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { DestructiveButton, Sheet, SheetFootnote, SheetRow } from '@/components/sheet';
import { Card, PositionChips, SectionTitle } from '@/components/ui/design';
import { TimeField } from '@/components/ui/time-field';
import { Message } from '@/components/ui/auth-parts';
import { usePalette } from '@/hooks/use-palette';
import { parseDecimal } from '@/lib/format';
import { radius } from '@/lib/theme';
import * as time from '@/lib/time';
import { dayName } from '@/lib/week';
import type { Duty, Position, ScheduleConflict, Shift, ShiftSlot } from '@/types';
import { conflictExplanation, slotLabel } from '@/types';

/** Edit one person's shift: hours, position, duty. Where "do 15" comes from. */
export function ShiftEditorSheet({
  shift,
  workerName,
  conflict,
  positions,
  duties,
  onSave,
  onDelete,
  onClose,
}: {
  shift: Shift;
  workerName: string;
  conflict: ScheduleConflict | null;
  positions: Position[];
  duties: Duty[];
  onSave: (start: string, end: string, positionId: string | null, dutyId: string | null) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const c = usePalette();
  // The parent mounts this with `key={shift.id}`, so a different shift is a
  // different component and the initial state is simply the shift's own values.
  // That is the React-recommended alternative to mirroring props into state.
  const [start, setStart] = useState(() => time.toDate(shift.start_time));
  const [end, setEnd] = useState(() => time.toDate(shift.end_time));
  const [positionId, setPositionId] = useState<string | null>(shift.position_id);
  const [dutyId, setDutyId] = useState<string | null>(shift.duty_id);

  return (
    <Sheet
      visible
      title={workerName}
      onClose={onClose}
      onConfirm={() => {
        onSave(time.fromDate(start), time.fromDate(end), positionId, dutyId);
        onClose();
      }}>
      <>
          <Card>
            <SheetRow label="Dan" value={dayName(shift.day_of_week)} />
            <SheetRow label="Smena" value={slotLabel[shift.slot]} />
          </Card>

          {conflict ? (
            <>
              <Message
                text={`${workerName} ${conflictExplanation[conflict.kind]}.`}
                kind="error"
              />
              <SheetFootnote text="Ni prepovedano — samo opozorilo, da preveriš." />
            </>
          ) : null}

          <SectionTitle text="Delovni čas" />
          <Card>
            <SheetRow label="Začetek">
              <TimeField value={start} onChange={setStart} />
            </SheetRow>
            <SheetRow label="Konec">
              <TimeField value={end} onChange={setEnd} />
            </SheetRow>
          </Card>
          <SheetFootnote text="Privzeti čas smene lahko tu spremeniš samo za to osebo — npr. pride ob 18:00 ali gre domov ob 15:00." />

          <SectionTitle text="Delovno mesto" />
          <Card>
            <PositionChips positions={positions} value={positionId} onChange={setPositionId} />
          </Card>

          <SectionTitle text="Zadolžitev" />
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <DutyChip label="Ni določena" selected={dutyId === null} onPress={() => setDutyId(null)} />
              {duties.map((duty) => (
                <DutyChip
                  key={duty.id}
                  label={duty.name}
                  selected={dutyId === duty.id}
                  onPress={() => setDutyId(duty.id)}
                />
              ))}
            </View>
            {positions.length === 0 && duties.length === 0 ? (
              <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 8 }}>
                Ta organizacija nima nastavljenih delovnih mest ne zadolžitev.
              </Text>
            ) : null}
          </Card>

          <DestructiveButton
            title="Odstrani z urnika"
            onPress={() => {
              onDelete();
              onClose();
            }}
          />
      </>
    </Sheet>
  );
}

function DutyChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const c = usePalette();

  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.accent : c.fill,
      }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: selected ? '#fff' : c.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Add someone to an empty cell. */
export function AddShiftSheet({
  target,
  candidates,
  positions,
  duties,
  onAdd,
  onClose,
}: {
  target: { day: number; slot: ShiftSlot };
  candidates: { id: string; full_name: string }[];
  positions: Position[];
  duties: Duty[];
  onAdd: (workerId: string, positionId: string | null, dutyId: string | null) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [positionId, setPositionId] = useState<string | null>(null);
  const [dutyId, setDutyId] = useState<string | null>(null);

  return (
    <Sheet
      visible
      title="Dodaj na urnik"
      confirmLabel="Dodaj"
      confirmDisabled={!workerId}
      onClose={onClose}
      onConfirm={() => {
        if (workerId) onAdd(workerId, positionId, dutyId);
        onClose();
      }}>
      <>
          <Card>
            <SheetRow label="Dan" value={dayName(target.day)} />
            <SheetRow label="Smena" value={slotLabel[target.slot]} />
          </Card>

          <SectionTitle text="Kdo dela" />
          <Card>
            {candidates.length === 0 ? (
              <Text style={{ fontSize: 15, color: c.textSecondary }}>
                Vsi sodelavci so že razporejeni v to smeno.
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {candidates.map((person) => (
                  <DutyChip
                    key={person.id}
                    label={person.full_name}
                    selected={workerId === person.id}
                    onPress={() => setWorkerId(person.id)}
                  />
                ))}
              </View>
            )}
          </Card>

          <SectionTitle text="Delovno mesto" />
          <Card>
            <PositionChips positions={positions} value={positionId} onChange={setPositionId} />
          </Card>

          <SectionTitle text="Zadolžitev" />
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <DutyChip label="Ni določena" selected={dutyId === null} onPress={() => setDutyId(null)} />
              {duties.map((duty) => (
                <DutyChip
                  key={duty.id}
                  label={duty.name}
                  selected={dutyId === duty.id}
                  onPress={() => setDutyId(duty.id)}
                />
              ))}
            </View>
          </Card>

          <SheetFootnote text="Delovni čas bo privzet za to smeno. Po dodajanju ga lahko spremeniš s klikom na ime." />
      </>
    </Sheet>
  );
}

/** Worker corrects one of their own logged shifts. */
export function ShiftLogEditorSheet({
  log,
  showTips,
  onSave,
  onClose,
}: {
  log: { id: string; work_date: string; clock_in: string; clock_out: string; tips_earned: number | null; notes: string | null; shift_id: string | null };
  /** Off when the organization does not track tips (0019). */
  showTips: boolean;
  onSave: (clockIn: string, clockOut: string, tips: number | null, notes: string) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const [start, setStart] = useState(() => time.toDate(log.clock_in));
  const [end, setEnd] = useState(() => time.toDate(log.clock_out));
  const [tips, setTips] = useState(
    log.tips_earned != null ? String(log.tips_earned).replace('.', ',') : '',
  );
  const [notes, setNotes] = useState(log.notes ?? '');

  const computedHours = time.hoursBetween(time.fromDate(start), time.fromDate(end));

  return (
    <Sheet
      visible
      title="Popravi smeno"
      onClose={onClose}
      onConfirm={() => {
        // With tips hidden, whatever was logged before is passed back as it
        // was — hiding the field must not quietly wipe it.
        onSave(
          time.fromDate(start),
          time.fromDate(end),
          showTips ? parseDecimal(tips) : log.tips_earned,
          notes,
        );
        onClose();
      }}>
      <>
          <Card>
            <SheetRow label="Ur skupaj" value={`${String(Number(computedHours.toFixed(2))).replace('.', ',')} h`} />
            {log.shift_id === null ? (
              <SheetFootnote text="Ta smena ni bila na urniku." />
            ) : null}
          </Card>

          <SectionTitle text="Dejanski čas" />
          <Card>
            <SheetRow label="Prišel">
              <TimeField value={start} onChange={setStart} />
            </SheetRow>
            <SheetRow label="Odšel">
              <TimeField value={end} onChange={setEnd} />
            </SheetRow>
          </Card>
          <SheetFootnote text="Če si delal čez polnoč, vpiši uro odhoda normalno — ure se preračunajo same." />

          <SectionTitle text={showTips ? 'Napitnina' : 'Opomba'} />
          <Card>
            {showTips ? (
              <SheetRow label="Znesek">
                <TextInput
                  value={tips}
                  onChangeText={setTips}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={c.textTertiary}
                  style={{ fontSize: 15, color: c.text, minWidth: 70, textAlign: 'right' }}
                />
              </SheetRow>
            ) : null}
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Opomba (neobvezno)"
              placeholderTextColor={c.textTertiary}
              multiline
              style={{ minHeight: 50, fontSize: 15, color: c.text, marginTop: showTips ? 8 : 0 }}
            />
          </Card>
          <SheetFootnote
            text={
              showTips
                ? 'Napitnino in opombo vidiš samo ti. Vodja ne.'
                : 'Opombo vidiš samo ti. Vodja ne.'
            }
          />
      </>
    </Sheet>
  );
}
