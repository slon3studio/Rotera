---
description: Review the current uncommitted changes against Rotera's rules
---
Review the current changes (`git diff` and `git status` for new files). Don't edit anything; report findings ranked by severity, each with file:line and a concrete failure scenario.

Check in particular:
- Tenant isolation: client sending `organization_id`, new tables/RPCs without RLS or with over-broad grants, `SECURITY DEFINER` without an org check. Use the `tenant-isolation-reviewer` agent if migrations changed.
- Dates/times converted to `Date` across the Supabase boundary.
- `single()` where "no rows" is a normal outcome.
- Screens loading on mount instead of `useFocusEffect`; missing `useTabBarSpace()`; `Alert` instead of `confirm-dialog`; `useColorScheme()` instead of `usePalette()`.
- Menjava/Rotacija mixed up in code or wording.
- Web breakage: `.web.tsx` variants, `vercel.json`, `sw.js` caching.
- Edited existing migrations, or README now out of date.

Finish with `npx tsc --noEmit` and `npx expo lint` results.
