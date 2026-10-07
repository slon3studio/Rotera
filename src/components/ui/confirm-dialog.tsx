import { Modal, Pressable, Text, View } from 'react-native';

import { usePalette } from '@/hooks/use-palette';
import { radius, semantic } from '@/lib/theme';

/**
 * A centred yes/no dialog.
 *
 * Written rather than using `Alert.alert`, because react-native-web ships
 * `Alert` as `class Alert { static alert() {} }` — an empty function. Every
 * confirmation routed through it was silently doing nothing in the browser and
 * in the installed app, while working fine in Expo Go, which is the worst
 * possible way for a bug to behave.
 *
 * `Modal` is implemented on web, so this one works on all three platforms.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = usePalette();
  const tint = destructive ? semantic.red : c.accent;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Tapping the backdrop cancels, which is what people expect and what
          stops the dialog becoming a trap if the buttons ever fail. */}
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          backgroundColor: 'rgba(0, 0, 0, 0.55)',
        }}>
        {/* Swallows taps so pressing inside the card does not dismiss it. */}
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 320,
            borderRadius: radius.lg,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            overflow: 'hidden',
          }}>
          <View style={{ padding: 20, gap: 6, alignItems: 'center' }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: c.text,
                textAlign: 'center',
              }}>
              {title}
            </Text>
            {message ? (
              <Text style={{ fontSize: 13, color: c.textSecondary, textAlign: 'center' }}>
                {message}
              </Text>
            ) : null}
          </View>

          <View style={{ height: 1, backgroundColor: c.border }} />

          <Pressable
            onPress={onConfirm}
            disabled={busy}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: tint }}>
              {busy ? 'Počakaj…' : confirmLabel}
            </Text>
          </Pressable>

          <View style={{ height: 1, backgroundColor: c.border }} />

          <Pressable
            onPress={onCancel}
            disabled={busy}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 16, color: c.text }}>Prekliči</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
