@AGENTS.md

# Rotera

Multi-tenant shift scheduling for **any business that works in shifts** —
restaurants, shops, care homes, warehouses, etc. It started as a restaurant
app, so some code and wording is still restaurant-specific; new work must be
industry-neutral. Product name is **Rotera** (formerly Rotaly — the local
folder RotalyEX still carries the old name; the GitHub repo is
`slon3studio/Rotera`).
One Expo Router codebase in `src/` builds iOS, Android and an installable web
PWA. The Supabase backend is shared with the older SwiftUI app at
`~/Desktop/Rotaly` — that folder is a dead copy, never edit it.

`README.md` is the full design record (the why behind every rule below). Read
the relevant section before changing an area, and update it when you change
behaviour it describes.

## Definition of done

- `npx tsc --noEmit` and `npx expo lint` both pass. There is no test suite.
- For UI changes, say what you verified and what you could not (worker-only
  screens need a worker account, e.g. `ivo1`).

## Hard rules

- Tenant isolation lives in Postgres, not the client. The client **never sends
  `organization_id`** — triggers derive it from `auth.uid()`.
- Dates and times cross the boundary as **strings** (`YYYY-MM-DD`, `HH:MM`),
  never `Date`. Use `src/lib/time.ts` and `src/lib/week.ts`.
- Use `maybeSingle()`, not `single()` — "no rows" is not an error.
- Only the publishable key belongs in `.env`. Never a `sb_secret_` /
  service_role key anywhere in the app.

## Database

- `supabase/migrations/` is the single source of truth. A change is a **new**
  file with the next number (`0018_…sql`); never edit an existing migration.
- Match the existing style: a header comment explaining *why*, numbered
  sections, idempotent (`drop … if exists` before `create`).
- Every tenant table has RLS on, with policies scoped by
  `public.current_org_id()` and `public.current_user_role()`. Grant only the
  columns that are needed (see 0017).
- `src/types/index.ts` is hand-written — update it to mirror schema changes.
- A new tenant table gets steps added to `supabase/verify_isolation.sql`.
- **The user applies migrations by hand** in the Supabase SQL editor. A
  migration is not live until they say so. Never run `supabase db push`/`reset`
  or connect to the remote database.

## UI conventions

- UI text is Slovene and industry-neutral: organizacija / podjetje (not
  restavracija), zaposleni (not natakar), vodja, urnik, želje. Don't introduce
  new restaurant-specific words; when touching old ones (e.g. `roleLabel` in
  `src/types/index.ts`), flag them rather than renaming silently.
  **Menjava** (cover: one shift changes hands, `cover_requests`) and
  **Rotacija** (two shifts trade, `shift_swaps`) are deliberately separate —
  never merge their tables, hooks, cards or wording.
- Screens load data in `useFocusEffect`, not a mount-only `useEffect`.
- Scrolling screens reserve room with `useTabBarSpace()` (floating tab bar).
- Colours come from `usePalette()`, never `useColorScheme()` directly.
- Confirmations use `components/ui/confirm-dialog.tsx` — RN-web's `Alert` is a
  silent no-op.
- Web-only variants are `*.web.tsx` next to the native file; don't touch the
  native one for a web fix.
- Routes only in `src/app/`; shared UI in `src/components/ui/`; data access in
  `src/hooks/use-*.ts`; the single Supabase client in `src/lib/supabase.ts`.

## Web / deploy

- `vercel.json` must stay free of `comment` keys, and `sw.js` must stay
  uncached. `app.json` keeps `web.output: "single"`.
- `public/sw.js` is network-first on purpose — don't make it cache-first.

## Git

- Commit messages: one short Slovene line (no diacritics) describing the
  user-visible change — see `git log`.
- Don't commit or push unless asked.
