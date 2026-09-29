/** Mirrors the Postgres enum `public.user_role`. */
export type UserRole = 'worker' | 'manager';

export const roleLabel: Record<UserRole, string> = {
  worker: 'zaposleni',
  manager: 'vodja',
};

/**
 * An organization. The tenant boundary — RLS guarantees a signed-in user can only
 * ever read the single row matching their own organization_id.
 */
export type Organization = {
  id: string;
  name: string;
  join_code: string;
  /** Default shift times, per organization. 8:30/16:00 is seed data, not a rule. */
  morning_start: string;
  morning_end: string;
  afternoon_start: string;
  afternoon_end: string;
  /**
   * Which halves of the day this organization runs. A shop that shuts at four
   * has no afternoon shift, and offering one produces wishes that can never
   * be met. Defaults to both; the database refuses having neither.
   */
  uses_morning: boolean;
  uses_afternoon: boolean;
};

/** The slots this organization actually runs, in the order they are shown. */
export function enabledSlots(organization: Organization): ShiftSlot[] {
  const slots: ShiftSlot[] = [];
  if (organization.uses_morning) slots.push('morning');
  if (organization.uses_afternoon) slots.push('afternoon');
  // Should be impossible (the database has a check constraint), but a grid
  // with no columns at all would be a worse way to find out.
  return slots.length > 0 ? slots : ['morning', 'afternoon'];
}

/** Extends auth.users. `id` is the Supabase auth user id. */
export type Profile = {
  id: string;
  organization_id: string;
  full_name: string;
  role: UserRole;
  /** False once a manager takes them off the team; history is kept. */
  is_active: boolean;
};

export type AppSession = {
  profile: Profile;
  organization: Organization;
};

export type ShiftSlot = 'morning' | 'afternoon';

export const slotLabel: Record<ShiftSlot, string> = {
  morning: 'Dopoldne',
  afternoon: 'Popoldne',
};

export type ShiftPreference = 'morning' | 'afternoon' | 'off' | 'any';

export type Position = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  /** What shows on a schedule cell: "Š" for Šank, "R" for Rajon. */
  short_label: string | null;
  color: string | null;
};

export type Duty = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type Shift = {
  id: string;
  week_start_date: string;
  day_of_week: number;
  slot: ShiftSlot;
  start_time: string;
  end_time: string;
  position_id: string | null;
  duty_id: string | null;
  assigned_worker_id: string | null;
};

export type CoverStatus = 'open' | 'claimed' | 'approved' | 'denied' | 'cancelled';

export const coverStatusLabel: Record<CoverStatus, string> = {
  open: 'Išče zamenjavo',
  claimed: 'Čaka vodjo',
  approved: 'Odobreno',
  denied: 'Zavrnjeno',
  cancelled: 'Preklicano',
};

/** Still in play — the shift is not settled yet. */
export function isCoverActive(status: CoverStatus): boolean {
  return status === 'open' || status === 'claimed';
}

export type CoverRequest = {
  id: string;
  shift_id: string;
  requested_by: string;
  status: CoverStatus;
  claimed_by: string | null;
  note: string | null;
};

/**
 * A rotation is not a cover request wearing a different hat.
 *
 * Cover: one shift changes hands, and the person who asked stops working it.
 * Rotation: two shifts trade places, and both people still work — just each
 * other's slot. That is two shifts and two consents, which is why it needs its
 * own table rather than another status on `cover_requests`.
 */
export type SwapStatus =
  | 'pending'
  | 'accepted'
  | 'approved'
  | 'declined'
  | 'rejected'
  | 'cancelled';

export const swapStatusLabel: Record<SwapStatus, string> = {
  pending: 'Čaka sodelavca',
  accepted: 'Čaka vodjo',
  approved: 'Odobreno',
  declined: 'Sodelavec zavrnil',
  rejected: 'Vodja zavrnil',
  cancelled: 'Preklicano',
};

/** Still in play, so neither shift may be used for anything else. */
export function isSwapActive(status: SwapStatus): boolean {
  return status === 'pending' || status === 'accepted';
}

export type ShiftSwap = {
  id: string;
  requester_id: string;
  requester_shift_id: string;
  target_id: string;
  target_shift_id: string;
  status: SwapStatus;
  note: string | null;
};

export type AvailabilityEntry = {
  id: string;
  worker_id: string;
  week_start_date: string;
  day_of_week: number;
  preference: ShiftPreference;
  position_id: string | null;
};

/** What one day looks like while a worker is editing it, before it is saved. */
export type DaySelection = {
  preference: ShiftPreference;
  positionId: string | null;
};

export type ScheduleWeek = {
  week_start_date: string;
  status: 'draft' | 'published';
};

/** Computed by the `schedule_conflicts` view, not in the app. */
export type ConflictKind = 'off' | 'wrong_slot' | 'double';

export const conflictExplanation: Record<ConflictKind, string> = {
  off: 'je za ta dan oddal Prosto',
  wrong_slot: 'je oddal drugo smeno',
  double: 'dela dvojno smeno ta dan',
};

export type ScheduleConflict = {
  worker_id: string;
  shift_id: string;
  kind: ConflictKind;
};

/** The worker's own record of what they actually worked. Private to them. */
export type ShiftLog = {
  id: string;
  shift_id: string | null;
  work_date: string;
  clock_in: string;
  clock_out: string;
  tips_earned: number | null;
  notes: string | null;
};

/** One month, planned next to actual. */
export type MonthlySummary = {
  worker_id: string;
  month: string;
  planned_hours: number;
  actual_hours: number;
  tips: number;
  shift_count: number;
};

export const preferenceLabel: Record<ShiftPreference, string> = {
  morning: 'Dopoldne',
  afternoon: 'Popoldne',
  off: 'Prosto',
  any: 'Karkoli',
};

export const preferenceShort: Record<ShiftPreference, string> = {
  morning: 'Dop',
  afternoon: 'Pop',
  off: '—',
  any: 'Vse',
};

/** `any` covers both, which is what makes it useful to a manager. */
export function preferenceCovers(preference: ShiftPreference, slot: ShiftSlot): boolean {
  if (preference === 'off') return false;
  if (preference === 'any') return true;
  return preference === slot;
}

/** A position preference only means something if the worker is working. */
export function preferenceAllowsPosition(preference: ShiftPreference): boolean {
  return preference !== 'off';
}
