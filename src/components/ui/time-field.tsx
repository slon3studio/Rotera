import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { radius } from '@/lib/theme';
import * as time from '@/lib/time';

export type TimeFieldProps = { value: Date; onChange: (next: Date) => void };

/**
 * Picks a time of day on a phone.
 *
 * `@react-native-community/datetimepicker` ships iOS, Android and Windows
 * builds and no web one, so the browser gets `time-field.web.tsx` instead —
 * Metro picks the file by platform, which is why this one needs no web branch.
 */
export function TimeField({ value, onChange }: TimeFieldProps) {
  const c = usePalette();
  const [open, setOpen] = useState(Platform.OS === 'ios');

  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="time"
        display="compact"
        onChange={(_, next) => next && onChange(next)}
      />
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: radius.sm,
          backgroundColor: c.fill,
        }}>
        <Text style={{ fontSize: 15, color: c.text }}>{time.fromDate(value).slice(0, 5)}</Text>
      </Pressable>

      {open ? (
        <DateTimePicker
          value={value}
          mode="time"
          onChange={(_, next) => {
            setOpen(false);
            if (next) onChange(next);
          }}
        />
      ) : null}
    </>
  );
}
