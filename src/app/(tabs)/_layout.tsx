import { Tabs } from 'expo-router';

import { TabBar } from '@/components/ui/tab-bar';
import { AppDataProvider, useAppData } from '@/contexts/app-data';
import { useAuth } from '@/contexts/auth';

export default function TabsLayout() {
  return (
    <AppDataProvider>
      <RoleTabs />
    </AppDataProvider>
  );
}

/**
 * One codebase, two experiences — the tabs are the same four, but each screen
 * branches on role internally, which is where the two apps actually differ.
 *
 * The bar itself is `components/ui/tab-bar.tsx`; see the note there for why it
 * is written by hand instead of configured through `screenOptions`.
 */
function RoleTabs() {
  const { session } = useAuth();
  const { cover, swaps } = useAppData();

  const badge = session
    ? cover.badgeCount(session.profile) + swaps.badgeCount(session.profile)
    : 0;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} badges={{ swaps: badge }} />}>
      <Tabs.Screen name="index" options={{ title: 'Urnik' }} />
      <Tabs.Screen name="wishes" options={{ title: 'Želje' }} />
      <Tabs.Screen name="swaps" options={{ title: 'Menjave' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
