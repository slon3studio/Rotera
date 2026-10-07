import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import {
  AuthBackground,
  AuthField,
  BrandMark,
  Message,
  PrimaryButton,
} from '@/components/ui/auth-parts';
import { useAuth } from '@/contexts/auth';
import { usePalette } from '@/hooks/use-palette';

export default function LoginScreen() {
  const c = usePalette();
  const {
    signIn,
    busy,
    error,
    notice,
    clearMessages,
    requestPasswordReset,
    completePasswordReset,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  /** Moves to step two only once the email has actually gone out. */
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const sendCode = async () => {
    if (!email.includes('@')) return;
    if (await requestPasswordReset(email)) setCodeSent(true);
  };

  const finishReset = async () => {
    await completePasswordReset({ email, code, password: newPassword });
  };

  const leaveReset = () => {
    clearMessages();
    setResetting(false);
    setCodeSent(false);
    setCode('');
    setNewPassword('');
  };

  return (
    <View style={{ flex: 1 }}>
      <AuthBackground />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 26,
            paddingVertical: 32,
            maxWidth: 460,
            width: '100%',
            alignSelf: 'center',
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled">
          <BrandMark />

          <View style={{ height: 40 }} />

          {resetting ? (
            <View style={{ gap: 12 }}>
              <Text style={{ fontSize: 15, color: c.textSecondary, textAlign: 'center' }}>
                {codeSent
                  ? 'Vpiši 6-mestno kodo iz e-pošte in izberi novo geslo.'
                  : 'Vpiši svojo e-pošto in poslali ti bomo kodo za novo geslo.'}
              </Text>

              <AuthField
                icon="mail"
                placeholder="E-pošta"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType={codeSent ? 'next' : 'send'}
                onSubmitEditing={() => void sendCode()}
              />

              {codeSent ? (
                <>
                  <AuthField
                    icon="code"
                    placeholder="Koda iz e-pošte"
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    mono
                    returnKeyType="next"
                  />

                  <AuthField
                    icon="lock"
                    placeholder="Novo geslo"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secure
                    autoComplete="new-password"
                    returnKeyType="go"
                    onSubmitEditing={() => void finishReset()}
                  />
                </>
              ) : null}

              {error ? <Message text={error} kind="error" /> : null}
              {notice ? <Message text={notice} kind="notice" /> : null}

              {codeSent ? (
                <PrimaryButton
                  title="Shrani novo geslo"
                  loading={busy}
                  disabled={code.replace(/\s/g, '').length !== 6 || newPassword.length < 6}
                  onPress={() => void finishReset()}
                />
              ) : (
                <PrimaryButton
                  title="Pošlji kodo"
                  loading={busy}
                  disabled={!email.includes('@')}
                  onPress={() => void sendCode()}
                />
              )}

              {codeSent ? (
                <Pressable onPress={() => void sendCode()} disabled={busy}>
                  <Text style={{ textAlign: 'center', fontSize: 13, color: c.textSecondary }}>
                    Kode ni prišlo? Pošlji znova
                  </Text>
                </Pressable>
              ) : null}

              <Pressable onPress={leaveReset}>
                <Text style={{ textAlign: 'center', fontSize: 14, color: c.textSecondary }}>
                  Nazaj na prijavo
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              <AuthField
                icon="mail"
                placeholder="E-pošta"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />

              <AuthField
                icon="lock"
                placeholder="Geslo"
                value={password}
                onChangeText={setPassword}
                secure
                autoComplete="current-password"
                returnKeyType="go"
                onSubmitEditing={() => canSubmit && signIn(email, password)}
              />

              {error ? <Message text={error} kind="error" /> : null}
              {notice ? <Message text={notice} kind="notice" /> : null}

              <View style={{ height: 10 }} />

              <PrimaryButton
                title="Prijava"
                loading={busy}
                disabled={!canSubmit}
                onPress={() => signIn(email, password)}
              />

              <Pressable
                onPress={() => {
                  clearMessages();
                  setResetting(true);
                }}
                style={{ paddingVertical: 10 }}>
                <Text style={{ textAlign: 'center', fontSize: 13, color: c.textSecondary }}>
                  Pozabljeno geslo?
                </Text>
              </Pressable>

              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                <Text style={{ fontSize: 12, color: c.textSecondary }}>ali</Text>
                <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
              </View>

              <Pressable
                onPress={() => {
                  clearMessages();
                  router.push('/register');
                }}>
                <Text style={{ textAlign: 'center', fontSize: 14, color: c.textSecondary }}>
                  Nimaš računa?{' '}
                  <Text style={{ color: c.accent, fontWeight: '600' }}>Registracija</Text>
                </Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
