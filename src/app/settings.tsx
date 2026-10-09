import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Message } from '@/components/ui/auth-parts';
import { AppBackground, Card, SectionTitle } from '@/components/ui/design';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/ui/icon';
import { useAuth } from '@/contexts/auth';
import { themePreferenceLabel, useAppTheme, type ThemePreference } from '@/contexts/theme';
import { useEarnings } from '@/hooks/use-earnings';
import { useTeam } from '@/hooks/use-team';
import { usePalette } from '@/hooks/use-palette';
import { parseDecimal } from '@/lib/format';
import { radius, largeTitle, semantic } from '@/lib/theme';

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

// App Store Connect needs both pages, and the privacy policy must also be
// reachable from inside the app.
const PRIVACY_URL = 'https://slon3studio.github.io/Slon3Studio_website/pages/Rotera/PrivacyPolicy.html';
const SUPPORT_URL = 'https://slon3studio.github.io/Slon3Studio_website/pages/Rotera/SupportPage.html';

/**
 * The things that belong to the person rather than to the organization: their
 * name, their own hourly rate, and how the app should look.
 *
 * Kept off the profile screen because none of it is read more than once in a
 * while, and the profile is where the daily things live — the join code, the
 * team, this month's hours.
 */
export default function SettingsScreen() {
  const c = usePalette();
  const { session, updateFullName, deleteAccount, busy, error, notice, clearMessages } =
    useAuth();
  const { preference, setPreference } = useAppTheme();
  const earnings = useEarnings();
  const team = useTeam();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Derived, not mirrored: null until the field is touched, so the stored
  // value shows through until then and a save elsewhere is not overwritten.
  const [typedName, setTypedName] = useState<string | null>(null);
  const [typedRateText, setTypedRateText] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (session && session.profile.role !== 'manager') await earnings.load(session.profile.id);
    // Only to word the delete confirmation: the last manager takes the
    // organization with them (0021).
    if (session?.profile.role === 'manager') await team.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.profile.id]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => clearMessages, [clearMessages]);

  if (!session) return null;
  const { profile } = session;
  const isManager = profile.role === 'manager';

  const isLastManager =
    isManager &&
    !team.members.some((m) => m.role === 'manager' && m.is_active && m.id !== profile.id);

  const name = typedName ?? profile.full_name;
  const nameChanged = name.trim() !== profile.full_name && name.trim().length > 0;

  const rateText =
    typedRateText ??
    (earnings.hourlyRate != null ? earnings.hourlyRate.toFixed(2).replace('.', ',') : '');
  const typedRate = parseDecimal(rateText);
  const rateChanged =
    typedRate == null
      ? rateText.length > 0
      : earnings.hourlyRate == null || Math.abs(typedRate - earnings.hourlyRate) > 0.001;

  return (
    <View style={{ flex: 1 }}>
      <AppBackground />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 56, gap: 16, paddingBottom: 40 }}
        keyboardDismissMode="on-drag">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Icon name="chevronLeft" size={22} color={c.accent} />
          </Pressable>
          <Text style={{ ...largeTitle, color: c.text }}>Nastavitve</Text>
        </View>

        {error ? <Message text={error} kind="error" /> : null}
        {notice ? <Message text={notice} kind="notice" /> : null}

        <SectionTitle text="Ime" />
        <Card>
          <TextInput
            value={name}
            onChangeText={setTypedName}
            placeholder="Ime in priimek"
            placeholderTextColor={c.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            style={{
              fontSize: 16,
              color: c.text,
              paddingHorizontal: 12,
              paddingVertical: 11,
              borderRadius: radius.sm,
              backgroundColor: c.fill,
            }}
          />

          <SaveButton
            label={busy ? 'Shranjujem…' : 'Shrani ime'}
            disabled={busy || !nameChanged}
            onPress={() => {
              void updateFullName(name).then((ok) => {
                if (ok) setTypedName(null);
              });
            }}
          />

          <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 10 }}>
            Tako te vidijo sodelavci na urniku in pri menjavah.
          </Text>
        </Card>

        {!isManager ? (
          <>
            <SectionTitle text="Urna postavka" />
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontSize: 15, fontWeight: '500', color: c.text }}>
                  Moja postavka
                </Text>
                <TextInput
                  value={rateText}
                  onChangeText={setTypedRateText}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={c.textTertiary}
                  style={{
                    width: 74,
                    textAlign: 'right',
                    fontSize: 16,
                    color: c.text,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    borderRadius: radius.sm,
                    backgroundColor: c.fill,
                  }}
                />
                <Text style={{ fontSize: 15, color: c.textSecondary }}>€/h</Text>
              </View>

              <SaveButton
                label={earnings.saving ? 'Shranjujem…' : 'Shrani postavko'}
                disabled={earnings.saving || typedRate == null || !rateChanged}
                onPress={() => {
                  if (typedRate != null) {
                    void earnings.saveRate(typedRate, profile.id).then(() =>
                      setTypedRateText(null),
                    );
                  }
                }}
              />

              {earnings.error ? (
                <View style={{ marginTop: 10 }}>
                  <Message text={earnings.error} kind="error" />
                </View>
              ) : null}

              <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: 10 }}>
                Vidiš jo samo ti.
              </Text>
            </Card>
          </>
        ) : null}

        {isManager ? (
          <>
            <SectionTitle text="Organizacija" />
            <Pressable onPress={() => router.push('/schedule-settings')}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name="schedule" size={19} color={c.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, color: c.text }}>Nastavitve urnika</Text>
                    <Text style={{ fontSize: 12, color: c.textSecondary }}>
                      Smene in njihov čas, delovna mesta, zadolžitve
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={15} color={c.textTertiary} />
                </View>
              </Card>
            </Pressable>
          </>
        ) : null}

        <SectionTitle text="Videz" />
        <Card>
          {THEME_OPTIONS.map((option, index) => {
            const active = option === preference;

            return (
              <Pressable
                key={option}
                onPress={() => setPreference(option)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 13,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: c.border,
                }}>
                <Text style={{ flex: 1, fontSize: 15, color: c.text }}>
                  {themePreferenceLabel[option]}
                </Text>
                {active ? <Icon name="check" size={17} color={c.accent} /> : null}
              </Pressable>
            );
          })}

        </Card>

        <SectionTitle text="Barve na urniku" />
        <Card>
          <Legend tint={semantic.red} label="Menjava" note="Nekdo išče zamenjavo za smeno" />
          <Legend
            tint={semantic.purple}
            label="Rotacija"
            note="Dva si zamenjata smeni, oba delata"
          />
          <Legend tint={c.accent} label="Moja smena" note="Tvoja smena tisti dan" />
          <Legend tint={semantic.yellow} label="Opozorilo" note="Ne ujema se z oddanimi željami" />
        </Card>

        <SectionTitle text="Pomoč in zasebnost" />
        <Card>
          <LinkRow label="Politika zasebnosti" url={PRIVACY_URL} first />
          <LinkRow label="Podpora" url={SUPPORT_URL} />
        </Card>

        <SectionTitle text="Račun" />
        <Pressable
          onPress={() => setConfirmingDelete(true)}
          disabled={busy}
          style={{
            minHeight: 46,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: semantic.red + '40',
            backgroundColor: semantic.red + '14',
          }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: semantic.red }}>
            Izbriši račun
          </Text>
        </Pressable>
        <Text style={{ fontSize: 12, color: c.textSecondary, marginTop: -8 }}>
          Trajno izbriše tvoj račun in tvoje podatke. Tega ni mogoče razveljaviti.
        </Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmingDelete}
        title="Izbrišem račun?"
        message={
          isLastManager
            ? `Si edini vodja, zato se izbriše tudi organizacija ${session.organization.name} z urnikom in podatki vseh članov. Tega ni mogoče razveljaviti.`
            : 'Izbrišejo se tvoj račun, želje, vpisane ure in postavka. Tega ni mogoče razveljaviti.'
        }
        confirmLabel="Izbriši račun"
        destructive
        busy={busy}
        onConfirm={() => {
          void deleteAccount().then(() => setConfirmingDelete(false));
        }}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}

function LinkRow({ label, url, first }: { label: string; url: string; first?: boolean }) {
  const c = usePalette();

  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 13,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.border,
      }}>
      <Text style={{ flex: 1, fontSize: 15, color: c.text }}>{label}</Text>
      <Icon name="chevronRight" size={15} color={c.textTertiary} />
    </Pressable>
  );
}

function SaveButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const c = usePalette();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        marginTop: 10,
        // As wide as its label. A full-width button reads as the main action of
        // the screen, and saving a name is not that.
        alignSelf: 'flex-start',
        minHeight: 38,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.sm,
        // Dimming the whole button dims the label with it, which leaves the
        // word unreadable on both themes. The inert state gets its own fill
        // and text colour instead — the same fix PrimaryButton needed.
        backgroundColor: disabled ? c.fill : c.accent,
        borderWidth: 1,
        borderColor: disabled ? c.border : 'transparent',
      }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: '600',
          color: disabled ? c.textSecondary : '#fff',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** What the colours on the schedule mean, since two of them now matter. */
function Legend({ tint, label, note }: { tint: string; label: string; note: string }) {
  const c = usePalette();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 7 }}>
      <View
        style={{
          width: 26,
          height: 20,
          borderRadius: radius.sm - 2,
          backgroundColor: tint + '26',
          borderWidth: 1,
          borderColor: tint + '8C',
        }}
      />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: c.text }}>{label}</Text>
        <Text style={{ fontSize: 11, color: c.textSecondary }}>{note}</Text>
      </View>
    </View>
  );
}
