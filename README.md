# Rotera — React Native (Expo)

Shift scheduling for **any business that works in shifts** — restaurants,
shops, care homes, warehouses, and so on. One organization (the tenant) has a
manager (vodja) and employees; the manager builds the weekly schedule, and
employees send wishes, ask for cover and trade shifts. It started as a
restaurant app, so some wording still says so — see
[Beyond restaurants](#beyond-restaurants).

Port of the SwiftUI app at `~/Desktop/Rotaly` (which is where the name Rotaly
comes from; the product is now called **Rotera**). The local folder RotalyEX
still carries the old name; the GitHub repo is `slon3studio/Rotera`. **The
Supabase backend is
shared and unchanged** — same project, same 14 migrations, same 12 RPCs. Only
the UI is being rewritten.

## Run it

```bash
npx expo start          # then scan the QR with Expo Go, or press i / a
npx tsc --noEmit        # typecheck
npx expo lint           # lint
npx expo-doctor         # dependency / config sanity
```

## Configuration

`.env` (gitignored, `.env.example` is the template):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Both are public by design — RLS is what protects the data. A `sb_secret_` key
must never go here; `src/lib/supabase.ts` refuses to start if it sees one.

## Where things live

```
src/app/                 routes (Expo Router — every file is a screen)
  _layout.tsx            auth gate via Stack.Protected
  login.tsx
  register.tsx
  (tabs)/                the signed-in shell
src/contexts/auth.tsx    session, role, org — the AuthService counterpart
src/lib/supabase.ts      the single client
src/lib/theme.ts         palette; the four semantic colours are load-bearing
src/types/index.ts       row shapes, mirroring the Postgres tables
src/components/ui/       shared pieces
```

Keep non-route code out of `src/app/` — Expo Router treats every file there as
a screen.

## Notes carried over from the Swift app

**Dates and times cross the boundary as strings**, never as `Date`. Postgres
`date` and `time` have no zone, so parsing them into a local date object is how
you end up storing the wrong Monday, or halving someone's hours.

**The client never sends `organization_id`.** Triggers derive it from
`auth.uid()`. If you find yourself typing it, something is wrong.

**"No rows" is not an error.** Use `maybeSingle()`, not `single()`. Collapsing
the two once meant a missing migration was reported to the user as "you do not
belong to a restaurant" — wrong, and unfixable from the UI.

## The database

`supabase/migrations/` is the single source of truth for the schema — all 14
migrations, in order, plus `verify_isolation.sql`. **Edit them here.** The Swift
app at `~/Desktop/Rotaly` has an older copy from before the port; it is a dead
copy kept only so that project still reads sensibly.

The user runs migrations by hand in the Supabase SQL editor, so a new one is
not applied until they say it is.

## What is ported

The whole finished Swift app, not a staged subset. Every screen it had exists
here:

| Screen | Route | Verified in the simulator |
| --- | --- | --- |
| Login | `app/login.tsx` | yes — signs in, rejects bad credentials |
| Registracija | `app/register.tsx` | yes — signs straight in, no extra step |
| Urnik, week grid | `(tabs)/index.tsx` + `components/schedule-grid.tsx` | yes |
| Urnik, vertical grid | `components/schedule-day-grid.tsx` | yes — days down, slots across, same design |
| Urnik, shifts per person (manager) | `components/team-shift-counts.tsx` | no — typechecks; tap a person to pick out their shifts in the grid |
| Shift editor sheet | `components/shift-sheets.tsx` | yes — times, position, duty, conflict warning, delete |
| Add-shift sheet | `components/shift-sheets.tsx` | yes — active workers only, `Dodaj` gated on a pick |
| Želje (worker + manager) | `(tabs)/wishes.tsx` | yes (manager side; worker side not re-checked since the port) |
| Menjave | `(tabs)/swaps.tsx` | yes — both manager sections render, with their empty states |
| Profil | `(tabs)/profile.tsx` | yes — join code, rotate, team list, role badges |
| Delovna mesta in zadolžitve | `app/catalog.tsx` | yes — including the position editor (label, 9-colour palette, live preview, `V uporabi`) |

Not verified by clicking, because they only appear for a worker account and I
have no worker password: the cover-request sheet, the shift-log editor, and the
hours + hourly-rate section of the profile. The code is there and typechecks;
sign in as `ivo1` to exercise it.

## The installable web version (PWA)

The same project builds a third target. `src/` is not duplicated anywhere: the
schedule the browser draws is `components/schedule-grid.tsx`, the same file the
phone uses, so the web version cannot drift out of looking identical.

```bash
npm run web          # dev server in a browser
npm run build:web    # static site into dist/, ready to upload
```

Web-only pieces, and nothing else:

| File | Why it exists |
| --- | --- |
| `public/index.html` | The HTML shell. Holds the manifest link and the three `apple-mobile-web-app-*` tags iOS needs, because iOS ignores the manifest for those. |
| `public/manifest.json` | `display: standalone` is what makes it open without browser chrome. |
| `public/sw.js` | Service worker. **Network-first on purpose** — a cache-first worker would serve yesterday's roster to somebody who has signal. |
| `public/icons/` | 192/512/maskable for Android, 180 for the iOS home screen. |
| `src/components/ui/time-field.web.tsx` | `@react-native-community/datetimepicker` has no web build. Metro picks this file on web by extension; the native `time-field.tsx` is untouched. |
| `src/components/ui/icon.web.tsx` | `expo-symbols` renders through a 943 KB Material Symbols font in the browser, for glyphs Ionicons already has. The phone still gets real SF Symbols from `icon.tsx`; the shared vocabulary lives in `icon-set.ts`. |

`vercel.json` carries the two things a static host has to be told: rewrite
every path to `/index.html` (only that file exists on disk — expo-router
resolves `/catalog` and the tabs in the browser, so without the rewrite a
refresh 404s), and never cache `sw.js` (a cached service worker outlives the
deploy that replaced it). Keep it free of `comment` keys: Vercel validates
`rewrites` and `headers` strictly and rejects the whole deployment over an
unknown property.

`app.json` sets `web.output: "single"` — a client-rendered SPA. `"static"`
pre-renders every route in Node, where `localStorage` does not exist, and the
Supabase client reads it at module load; that is why `src/lib/supabase.ts`
guards it too.

### Installing it on a phone

- **iPhone:** open the link in **Safari** (Chrome on iOS cannot install),
  Share → **Add to Home Screen**.
- **Android:** Chrome offers **Install app** by itself.

### Two web-only traps, both hit once

`react-native-web` ships `Alert` as `class Alert { static alert() {} }` — an
empty function. Every confirmation routed through it worked in Expo Go and did
nothing at all in the browser, which is the worst way for a bug to behave. Use
`components/ui/confirm-dialog.tsx` instead; `Modal` *is* implemented on web.

`expo-router` hands `SafeAreaProvider` a hard `insets: { bottom: 0 }` on web,
so `useSafeAreaInsets()` can never report the home-indicator strip there. Read
it from CSS with `env(safe-area-inset-bottom)` — `components/ui/tab-bar.tsx`
does, for both its own offset and the space it asks screens to reserve.

### The floating tab bar

`components/ui/tab-bar.tsx` is absolutely positioned, so it takes no space out
of the screen above it. Every scrolling screen therefore has to reserve room
itself with `useTabBarSpace()` — that is the one thing to remember when adding
a screen, and the height and the safe-area strip are stated only there.

### What the web version cannot do

Push notifications on iOS need iOS 16.4+ and only work once installed to the
home screen — weaker than APNs, and not built yet either way. Everything else
(schedule, wishes, cover, rotations, hours, join codes) is the same code.

## Appearance and the settings screen

`app/settings.tsx` holds what belongs to the person rather than the organization:
their name, their own hourly rate, and light/dark. Reached from the gear on the
profile.

`contexts/theme.tsx` is the one place that decides which palette is painted:
`system` resolves through `useColorScheme()`, `light` and `dark` override it.
The choice is read synchronously at first render out of `localStorage` — real
in a browser, SQLite-backed on the phone via the shim `lib/supabase` imports —
because loading it in an effect paints the wrong theme for a frame first.
`usePalette()` therefore reads the context, never `useColorScheme()` directly;
so does the web time picker, or the native control would stay light inside a
dark app.

Renaming yourself needs no migration: 0001 already grants
`update (full_name)` on `profiles` and only for your own row. That same column
grant is what refuses a worker writing `role = 'manager'` — in Postgres, not in
the client.

## Schedule settings belong to the organization

`app/schedule-settings.tsx` (manager only, reached from Nastavitve) is where an
organization says how its schedule is shaped: which halves of the day it runs,
when each starts and ends, and its own positions and duties. One screen,
because the settings are read together — the times mean nothing without
knowing which slots are live.

Turning a slot off is a setting, not a deletion. Shifts already on the
schedule for that slot stay; it stops new ones being wished for or generated,
so flipping it back does not lose history and flipping it off does not rewrite
last week. Migration 0017 enforces this in three places, since the client is
not the only way in: the generator skips a disabled slot, a trigger refuses a
wish for one, and another refuses a hand-added shift in one. `enabledSlots()`
is what the grids and the wishes selector read.

The times had existed on `organizations` since 0003, but the only column a
manager was granted UPDATE on was `name` — visible and unchangeable. 0017
grants exactly the six columns needed and still not `join_code`.

## Screens reload on focus, not on mount

Every tab, and the catalog, re-reads its data in `useFocusEffect` rather than a
mount-only `useEffect`. Loading once was the cause of a class of bug that only
showed up in use: a duty deleted in the catalog still appeared under people's
names on the schedule, and an approved cover still showed the old person —
because each screen holds its own cached copy and nothing told it to look
again. Signing out was the only cure.

The database was never wrong about any of it. `resolve_cover` reassigns the
shift and `resolve_swap` exchanges both, marking them `origin = 'manual'` so a
later rebuild cannot undo an agreed exchange. Only the client was stale.

`useFocusEffect` also fires on first mount, so it replaces the mount effect
rather than adding to it.

## Copying last week

`Kopiraj prejšnji teden` on the Urnik screen (manager only) calls
`copy_previous_week` (0019), which puts the previous week's shifts into the
week on screen: same day, slot, times, position, duty and person. It only
adds. Anything the week already has stays, and running it twice doubles
nothing. People who have left since and slots switched off since are skipped
rather than failing the whole copy, and the notice says how many were left
out.

Copied rows are `origin = 'manual'`: the manager chose them, so a later
`Sestavi iz želja` leaves them alone. An empty draft week copies straight
away; a week that already has shifts, or is already published, asks first
through `ConfirmDialog`.

## Tips are per organization

Tips are a restaurant thing. `organizations.tracks_tips` (0019, default true
so existing organizations keep them) is a switch in Nastavitve urnika. Off
hides the tips field in the shift-log editor and the tips line in the
profile's earnings; tips already logged stay in `shift_logs` and are passed
back unchanged when a log is edited, so switching it back on loses nothing.
Read it through `tracksTips()` in `types/index.ts`, which treats a missing
column (0019 not applied yet) as on.

## Two kinds of hand-over, deliberately named apart

- **Menjava** (cover) — one shift changes hands and the person who asked stops
  working. `cover_requests`, claimed by a colleague, approved by the manager.
- **Rotacija** (rotation) — two shifts trade places and both people still work.
  `shift_swaps`, which needs two consents plus the manager's.

They are separate tables, separate hooks, separate cards and separate words on
screen, because the failure mode is somebody reading one as the other and
turning up on the wrong day. On the schedule cover is a red fill and a rotation
is a dashed purple edge — the dash reads as "agreed, not final", and leaving
the fill alone keeps the cell able to say whether the shift is yours. Each card
in the Menjave tab also names its kind on a pill. `shift_is_busy()` in the
database stops one shift being in both.

Both are actioned by tapping the shift on the schedule. The Menjave tab is the
list view, not the only way in.

## Beyond restaurants

Rotera is meant for any shift-based business, not only restaurants. The data
model already fits: positions, duties and shift times are set per
organization, not hard-coded. What still assumes a restaurant:

- **Words on screen** are done: the UI says organizacija and zaposleni
  (`roleLabel.worker`, the role badge). The database enum value stays
  `worker`; only its label changed. The one exception is the comment in
  `contexts/auth.tsx` quoting the Swift app's old error, kept as history.
- **Seeded catalog** is gone: since 0018 a new organization starts with no
  positions or duties, and the owner adds their own. Organizations created
  before that keep the restaurant set they were given.
- **Database error messages.** Most RPCs still raise "…restavracije" /
  "…restavraciji" (e.g. "Uporabnik ni član nobene restavracije."). Only
  `create_organization` has been reworded (0018); the rest need a migration
  that redefines each function.
- **Only two slots a day.** Morning and afternoon. Night shifts, 12-hour
  shifts or three-shift rotations (care homes, factories, security) need a
  more flexible slot model — a schema change, so a migration.

New work should use the neutral wording from the start.

## Not built (deliberate)

- **Push notifications.** `expo-notifications` needs an Apple Developer
  account. Nothing written for it would have survived the port, so it waited.
- **Drag and drop.** The grids are tap-to-move, as agreed.
- A submission deadline, export/share, the chat feed, and the manager
  team-hours view.

## Known rough edges

- The accent is the blue from the app icon. `semantic.teal` still marks the
  morning shift, and blue next to cyan is a narrower gap than the old purple
  was — worth a look on the schedule before anyone relies on it.
- Expo Go's floating dev-menu bubble sits on top of the `Uredi` button in the
  top-right. Drag the bubble away, or ignore it — it is not part of the app.
