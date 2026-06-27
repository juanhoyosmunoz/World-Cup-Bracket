// LOCKING — UTC-correct lock evaluation.
//
// All times are stored as ISO strings in UTC; we render in the user's local
// time at the UI layer.
//
//   - Group fixture lock: kickoff - 1 hour  (also locks if status != SCHEDULED)
//   - Knockout bracket lock: shared appConfig.knockoutLockAt
//   - Favorite team lock:    shared appConfig.favoriteLockAt

import type { AppConfig, Fixture } from "../types";

export const LOCK_LEAD_MINUTES = 60;

function toDate(ts: string | Date | undefined | null): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === "string") return new Date(ts);
  if (typeof (ts as any).toDate === "function") return (ts as any).toDate();
  return null;
}

export function fixtureLocked(fx: Fixture, now: Date = new Date()): boolean {
  if (fx.status !== "SCHEDULED") return true;
  const lock = toDate(fx.lockAt);
  if (!lock) {
    const k = toDate(fx.kickoff);
    if (!k) return false;
    return now.getTime() >= k.getTime() - LOCK_LEAD_MINUTES * 60_000;
  }
  return now.getTime() >= lock.getTime();
}

export function knockoutLocked(cfg: AppConfig | null, now: Date = new Date()): boolean {
  if (!cfg) return false;
  const t = toDate(cfg.knockoutLockAt);
  return t ? now.getTime() >= t.getTime() : false;
}

// Per-round knockout lock: each slot locks LOCK_LEAD_MINUTES (1 hour) before its
// match kicks off. The slot is matched to a fixture by bracketSlot. If no fixture
// exists yet for that slot (e.g. deeper rounds not scheduled), we fall back to the
// shared appConfig.knockoutLockAt deadline.
export function knockoutSlotLockAt(
  slot: string,
  fixtures: Fixture[],
  cfg: AppConfig | null
): Date | null {
  const fx = fixtures.find((f) => f.bracketSlot === slot);
  if (fx) {
    const k = toDate(fx.kickoff);
    if (k) return new Date(k.getTime() - LOCK_LEAD_MINUTES * 60_000);
  }
  return toDate(cfg?.knockoutLockAt);
}

export function knockoutSlotLocked(
  slot: string,
  fixtures: Fixture[],
  cfg: AppConfig | null,
  now: Date = new Date()
): boolean {
  const fx = fixtures.find((f) => f.bracketSlot === slot);
  if (fx && fx.status !== "SCHEDULED") return true;
  const lock = knockoutSlotLockAt(slot, fixtures, cfg);
  return lock ? now.getTime() >= lock.getTime() : false;
}

export function favoriteLocked(cfg: AppConfig | null, now: Date = new Date()): boolean {
  if (!cfg) return false;
  const t = toDate(cfg.favoriteLockAt);
  return t ? now.getTime() >= t.getTime() : false;
}

export function msUntil(date: string | Date | null | undefined, now: Date = new Date()): number {
  const d = toDate(date);
  if (!d) return Number.POSITIVE_INFINITY;
  return d.getTime() - now.getTime();
}

export function localTimezoneLabel(date: Date = new Date()): string {
  try {
    const short = new Intl.DateTimeFormat(undefined, {
      timeZoneName: "short",
    }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value;
    if (short) return short;
  } catch {}
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
}

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

export function formatKickoff(
  t: string | Date | null | undefined,
  opts: { withTz?: boolean } = { withTz: true }
): string {
  const d = toDate(t);
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

export function elapsedMatchMinute(kickoff: string | Date | null | undefined, now: Date = new Date()): number {
  const k = toDate(kickoff);
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
