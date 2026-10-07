import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { AppThemeProvider, useAppTheme } from '@/contexts/theme';
import { usePalette } from '@/hooks/use-palette';
import { semantic } from '@/lib/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // AppThemeProvider wraps everything, including the loading and
  // misconfigured screens — they call usePalette too.
  return (
    <AppThemeProvider>
      <Themed />
    </AppThemeProvider>
  );
}

function Themed() {
  const { scheme } = useAppTheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Routes on auth state. `Stack.Protected` is the SDK 57 way — `guard` decides
 * which group is reachable, so there is no manual redirect to race against
 * the first render.
 *
 * (`redirectTo` only exists from SDK 58, so it is not used here.)
 */
function Gate() {
  const { status, configProblem } = useAuth();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'misconfigured') return <ConfigError reason={configProblem ?? ''} />;
  if (status === 'loading') return <Loading />;

  const signedIn = status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" options={{ presentation: 'modal' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="schedule-settings" />
        <Stack.Screen name="settings" />
      </Stack.Protected>
    </Stack>
  );
}

function Loading() {
  const c = usePalette();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        backgroundColor: c.background,
      }}>
      <ActivityIndicator />
      <Text style={{ color: c.textSecondary }}>Nalaganje…</Text>
    </View>
  );
}

/** Shown when .env has not been filled in — the plist screen's counterpart. */
function ConfigError({ reason }: { reason: string }) {
  const c = usePalette();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 32,
        backgroundColor: c.background,
      }}>
      <Icon name="warning" size={44} color={semantic.orange} />
      <Text style={{ fontSize: 22, fontWeight: '700', color: c.text }}>
        Nastavitve niso dokončane
      </Text>
      <Text style={{ fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 21 }}>
        {reason}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: c.text,
          backgroundColor: c.fill,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
        }}>
        .env
      </Text>
    </View>
  );
}
