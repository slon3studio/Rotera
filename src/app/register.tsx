import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import {
  AuthBackground,
  AuthField,
  Message,
  ModeToggle,
  PrimaryButton,
} from '@/components/ui/auth-parts';
import { useAuth } from '@/contexts/auth';
import { usePalette } from '@/hooks/use-palette';

type Mode = 'join' | 'create';

export default function RegisterScreen() {
  const c = usePalette();
  const { signUp, busy, error, clearMessages } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('join');
  const [organizationName, setOrganizationName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const canSubmit =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 6 &&
    (mode === 'join' ? joinCode.trim().length > 0 : organizationName.trim().length > 0);

  const submit = () =>
    signUp({
      email,
      password,
      fullName,
      organization:
        mode === 'create'
          ? { kind: 'create', name: organizationName }
          : { kind: 'join', code: joinCode },
    });

  return (
    <View style={{ flex: 1 }}>
      <AuthBackground />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 26,
            paddingTop: 56,
            paddingBottom: 40,
            maxWidth: 460,
            width: '100%',
            alignSelf: 'center',
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 30, fontWeight: '700', color: c.text }}>Ustvari račun</Text>
          <Text style={{ fontSize: 15, color: c.textSecondary, marginTop: 8 }}>
            Nekaj sekund in ekipa je notri.
          </Text>

          <View style={{ height: 28 }} />

          <View style={{ gap: 12 }}>
            <AuthField
              icon="person"
              placeholder="Ime in priimek"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
              autoComplete="name"
            />
            <AuthField
              icon="mail"
              placeholder="E-pošta"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
            />
            <AuthField
              icon="lock"
              placeholder="Geslo (vsaj 6 znakov)"
              value={password}
              onChangeText={setPassword}
              secure
              autoComplete="new-password"
            />
          </View>

          <View style={{ height: 26 }} />

          <ModeToggle<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'join', label: 'Pridruži se ekipi' },
              { value: 'create', label: 'Nova organizacija' },
            ]}
          />

          <View style={{ height: 12 }} />

          {mode === 'join' ? (
            <AuthField
              icon="code"
              placeholder="Koda organizacije"
              value={joinCode}
              onChangeText={setJoinCode}
              autoCapitalize="characters"
              mono
              returnKeyType="done"
              onSubmitEditing={() => canSubmit && submit()}
            />
          ) : (
            <AuthField
              icon="home"
              placeholder="Ime organizacije"
              value={organizationName}
              onChangeText={setOrganizationName}
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={() => canSubmit && submit()}
            />
          )}

          <Text style={{ fontSize: 13, color: c.textSecondary, marginTop: 10 }}>
            {mode === 'join'
              ? 'Kodo dobiš od vodje. Pridružiš se kot zaposleni.'
              : 'Ustvariš novo organizacijo in postaneš njen vodja.'}
          </Text>

          {error ? (
            <View style={{ marginTop: 16 }}>
              <Message text={error} kind="error" />
            </View>
          ) : null}

          <View style={{ height: 24 }} />

          <PrimaryButton
            title="Ustvari račun"
            loading={busy}
            disabled={!canSubmit}
            onPress={submit}
          />

          <Pressable
            onPress={() => {
              clearMessages();
              router.back();
            }}
            style={{ paddingVertical: 16 }}>
            <Text style={{ textAlign: 'center', fontSize: 14, color: c.textSecondary }}>
              Prekliči
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
