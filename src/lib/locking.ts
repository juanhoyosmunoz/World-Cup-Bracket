// -----------------------------------------------------------------------------
// LOCKING — UTC-correct lock evaluation, mirrored by Firestore security rules.
// All times are stored as Firestore Timestamps in UTC; we render in the user's
// local time at the UI layer.
//
//   - Group fixture lock: kickoff - 1 hour  (also locks if status != SCHEDULED)
//   - Knockout bracket lock: shared appConfig.knockoutLockAt
//   - Favorite team lock:    shared appConfig.favoriteLockAt
//
// Important: the canonical lock is the server-side rule. Client display is
// optimistic; an attempted write after lock will be rejected by Firestore.
// -----------------------------------------------------------------------------

import type { Timestamp } from "firebase/firestore";
import type { AppConfig, Fixture } from "../types";

export const LOCK_LEAD_MINUTES = 60;

function tsToDate(ts: Timestamp | Date | undefined | null): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof (ts as any).toDate === "function") return (ts as Timestamp).toDate();
  return null;
}

export function fixtureLocked(fx: Fixture, now: Date = new Date()): boolean {
  if (fx.status !== "SCHEDULED") return true;
  const lock = tsToDate(fx.lockAt);
  if (!lock) {
    // Defensive: compute from kickoff if lockAt missing.
    const k = tsToDate(fx.kickoff);
    if (!k) return false;
    return now.getTime() >= k.getTime() - LOCK_LEAD_MINUTES * 60_000;
  }
  return now.getTime() >= lock.getTime();
}

export function knockoutLocked(cfg: AppConfig | null, now: Date = new Date()): boolean {
  if (!cfg) return false;
  const t = tsToDate(cfg.knockoutLockAt);
  return t ? now.getTime() >= t.getTime() : false;
}

export function favoriteLocked(cfg: AppConfig | null, now: Date = new Date()): boolean {
  if (!cfg) return false;
  const t = tsToDate(cfg.favoriteLockAt);
  return t ? now.getTime() >= t.getTime() : false;
}

export function msUntil(date: Date | Timestamp | null | undefined, now: Date = new Date()): number {
  const d = tsToDate(date as Timestamp);
  if (!d) return Number.POSITIVE_INFINITY;
  return d.getTime() - now.getTime();
}

/**
 * Returns a human-readable local timezone label, e.g.,
 *   "EDT"  / "GMT−4"  / "Argentina Standard Time (GMT−3)"
 */
export function localTimezoneLabel(date: Date = new Date()): string {
  // Try the short form first ("EDT"); fall back to the IANA zone name.
  try {
    const short = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
    if (short) return short;
  } catch {}
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
}

/**
 * Long-form timezone label used in the footer for a friendly explanation:
 *   "Eastern Daylight Time (GMT−4)"
 */
export function localTimezoneLong(date: Date = new Date()): string {
  let long = "";
  try {
    long = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "long",
    }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {}
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "−";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60));
  const mm = abs % 60;
  const gmt = `GMT${sign}${hh}${mm ? `:${String(mm).padStart(2, "0")}` : ""}`;
  return long ? `${long} (${gmt})` : gmt;
}

/** Format a Timestamp/Date as a short local kickoff line including timezone. */
export function formatKickoff(
  t: Timestamp | Date | null | undefined,
  opts: { withTz?: boolean } = { withTz: true }
): string {
  const d = tsToDate(t as Timestamp);
  if (!d) return "TBD";
  const parts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (opts.withTz) parts.timeZoneName = "short";
  return d.toLocaleString(undefined, parts);
}

/**
 * Returns the elapsed match minute (1..95+) given a kickoff timestamp.
 * Returns 0 before kickoff. Caps at 95 to keep the badge tidy when matches
 * run long (extra time / stoppage). The 90+ case renders as "90+" by the
 * caller if desired.
 */
export function elapsedMatchMinute(kickoff: Timestamp | Date | null | undefined, now: Date = new Date()): number {
  const k = tsToDate(kickoff as Timestamp);
  if (!k) return 0;
  const ms = now.getTime() - k.getTime();
  if (ms <= 0) return 0;
  return Math.min(Math.floor(ms / 60_000) + 1, 95);
}

export function formatCountdown(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "Locked";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
