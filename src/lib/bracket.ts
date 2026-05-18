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
