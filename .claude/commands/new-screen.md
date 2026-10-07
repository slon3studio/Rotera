---
description: Add a new Expo Router screen that follows Rotera's conventions
argument-hint: <what the screen is for>
---
Add a new screen: $ARGUMENTS

1. Read the README section closest to this feature, and an existing screen of the same kind (`src/app/settings.tsx` for a pushed screen, a file in `src/app/(tabs)/` for a tab) and copy its structure.
2. Route file in `src/app/` only; data access in a hook in `src/hooks/use-*.ts`; reusable pieces in `src/components/ui/`.
3. Load data in `useFocusEffect`. Colours from `usePalette()`. Reserve bottom space with `useTabBarSpace()` if it scrolls. Confirmations via `confirm-dialog.tsx`.
4. All visible text in Slovene, consistent with existing wording.
5. If it's manager-only, gate it on `session.profile.role === 'manager'` in the UI **and** confirm the database also refuses workers — the UI check alone is not security.
6. Run `npx tsc --noEmit` and `npx expo lint`. Report what you verified and what needs checking on a device (and for which role).
