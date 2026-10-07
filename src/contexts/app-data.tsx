import { createContext, useContext, useEffect } from 'react';

import { useCover, type CoverHook } from '@/hooks/use-cover';
import { useSwaps, type SwapsHook } from '@/hooks/use-swaps';
import { useTeam, type TeamHook } from '@/hooks/use-team';

/**
 * Team, cover requests and rotations, owned once for the whole signed-in shell.
 *
 * The Swift app kept these in `MainTabView` for the same reason: the tab badge,
 * the coloured cells on the schedule and the Menjave list all have to read the
 * same data, and separate copies would drift.
 */
type AppData = { team: TeamHook; cover: CoverHook; swaps: SwapsHook };

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const team = useTeam();
  const cover = useCover();
  const swaps = useSwaps();

  useEffect(() => {
    void team.load();
    void cover.load();
    void swaps.load();
    // Loaded once when the shell mounts; screens refresh them on pull.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AppDataContext.Provider value={{ team, cover, swaps }}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
