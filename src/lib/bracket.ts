// Helpers for the knockout bracket UI/data.
// Slot ids: R32-1..R32-16, R16-1..R16-8, QF-1..QF-4, SF-1..SF-2, THIRD, FINAL.

import { feederSlots, stageOfSlot } from "./scoring";
import type { Stage } from "../types";

export const KO_SLOTS = (() => {
  const out: string[] = [];
  for (let i = 1; i <= 16; i++) out.push(`R32-${i}`);
  for (let i = 1; i <= 8; i++) out.push(`R16-${i}`);
  for (let i = 1; i <= 4; i++) out.push(`QF-${i}`);
  for (let i = 1; i <= 2; i++) out.push(`SF-${i}`);
  out.push("THIRD", "FINAL");
  return out;
})();

export const SLOTS_BY_STAGE: Record<Exclude<Stage, "GROUP">, string[]> = {
  R32: KO_SLOTS.filter((s) => s.startsWith("R32-")),
  R16: KO_SLOTS.filter((s) => s.startsWith("R16-")),
  QF: KO_SLOTS.filter((s) => s.startsWith("QF-")),
  SF: KO_SLOTS.filter((s) => s.startsWith("SF-")),
  THIRD: ["THIRD"],
  FINAL: ["FINAL"],
};

// -----------------------------------------------------------------------------
// Knockout schedule — official FIFA World Cup 2026 round windows (all UTC).
//   R32: Jun 28 – Jul 3 · R16: Jul 4 – 7 · QF: Jul 9 – 11 · SF: Jul 14 – 15
//   Third place: Jul 18 (21:00 UTC) · Final: Jul 19 (19:00 UTC)
// Individual kickoff times are spread within each published round window so
// every match has a deadline to count down to; an admin can fine-tune any of
// them later. Each match's pick locks LOCK_LEAD_MINUTES (1 hour) before kickoff.
// -----------------------------------------------------------------------------

export const KNOCKOUT_LOCK_LEAD_MINUTES = 60;

/** slot id -> kickoff time (ISO, UTC). */
export const KNOCKOUT_KICKOFFS: Record<string, string> = {
  // Round of 32 — 16 matches across Jun 28 – Jul 3
  "R32-1": "2026-06-28T16:00:00Z", "R32-2": "2026-06-28T19:00:00Z", "R32-3": "2026-06-28T22:00:00Z",
  "R32-4": "2026-06-29T16:00:00Z", "R32-5": "2026-06-29T19:00:00Z", "R32-6": "2026-06-29T22:00:00Z",
  "R32-7": "2026-06-30T19:00:00Z", "R32-8": "2026-06-30T22:00:00Z",
  "R32-9": "2026-07-01T19:00:00Z", "R32-10": "2026-07-01T22:00:00Z",
  "R32-11": "2026-07-02T16:00:00Z", "R32-12": "2026-07-02T19:00:00Z", "R32-13": "2026-07-02T22:00:00Z",
  "R32-14": "2026-07-03T16:00:00Z", "R32-15": "2026-07-03T19:00:00Z", "R32-16": "2026-07-03T22:00:00Z",
  // Round of 16 — 8 matches across Jul 4 – 7
  "R16-1": "2026-07-04T19:00:00Z", "R16-2": "2026-07-04T22:00:00Z",
  "R16-3": "2026-07-05T19:00:00Z", "R16-4": "2026-07-05T22:00:00Z",
  "R16-5": "2026-07-06T19:00:00Z", "R16-6": "2026-07-06T22:00:00Z",
  "R16-7": "2026-07-07T19:00:00Z", "R16-8": "2026-07-07T22:00:00Z",
  // Quarterfinals — 4 matches across Jul 9 – 11
  "QF-1": "2026-07-09T19:00:00Z", "QF-2": "2026-07-09T22:00:00Z",
  "QF-3": "2026-07-10T22:00:00Z", "QF-4": "2026-07-11T22:00:00Z",
  // Semifinals — Jul 14 & 15
  "SF-1": "2026-07-14T22:00:00Z", "SF-2": "2026-07-15T22:00:00Z",
  // Third place & Final
  "THIRD": "2026-07-18T21:00:00Z",
  "FINAL": "2026-07-19T19:00:00Z",
};

/** Returns {kickoffMs, lockMs} for a knockout slot, or null if unknown. */
export function knockoutSlotTimes(slot: string): { kickoffMs: number; lockMs: number } | null {
  const iso = KNOCKOUT_KICKOFFS[slot];
  if (!iso) return null;
  const kickoffMs = new Date(iso).getTime();
  return { kickoffMs, lockMs: kickoffMs - KNOCKOUT_LOCK_LEAD_MINUTES * 60_000 };
}

export function stageLabel(s: Exclude<Stage, "GROUP">): string {
  return {
    R32: "Round of 32",
    R16: "Round of 16",
    QF: "Quarterfinals",
    SF: "Semifinals",
    THIRD: "Third-Place Match",
    FINAL: "Final",
  }[s];
}

export { feederSlots, stageOfSlot };
