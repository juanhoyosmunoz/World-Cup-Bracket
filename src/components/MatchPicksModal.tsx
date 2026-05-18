// Modal that lists every participant's pick for a given fixture.
// Security: Firestore rules only return other users' predictions once the
// fixture is locked (kickoff − 1h or status != SCHEDULED), so this query
// returns nothing useful before lock by design.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { watchPredictionsForFixture } from "../lib/firestore";
import { scoreGroupPrediction } from "../lib/scoring";
import { formatKickoff } from "../lib/locking";
import { DEMO_MODE } from "../lib/demo";
import type { Fixture, GroupPrediction, MatchResult, Team, UserProfile } from "../types";
import clsx from "clsx";

interface Props {
  fixtureId: string;
  fixture: Fixture;
  teams: Record<string, Team>;
  result?: MatchResult;
  onClose: () => void;
}

export default function MatchPicksModal({ fixtureId, fixture, teams, result, onClose }: Props) {
  const [picks, setPicks] = useState<GroupPrediction[]>([]);
  const [users, setUsers] = useState<Record<string, UserProfile>>({});

  useEffect(() => watchPredictionsForFixture(fixtureId, setPicks), [fixtureId]);

  useEffect(() => {
    if (DEMO_MODE) {
      // demo users are baked into the picks; profile fields are sourced from
      // the demo leaderboard entries which the parent already loaded.
      return;
    }
    return onSnapshot(collection(db, "users"), (snap) => {
      const m: Record<string, UserProfile> = {};
      snap.docs.forEach((d) => (m[d.id] = d.data() as UserProfile));
      setUsers(m);
    });
  }, []);

  // Lock body scroll while the modal is open so the page underneath
  // doesn't scroll behind the backdrop and shift content.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Close on Escape key.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const home = fixture.homeTeamId ? teams[fixture.homeTeamId] : undefined;
  const away = fixture.awayTeamId ? teams[fixture.awayTeamId] : undefined;

  const rows = useMemo(() => {
    return picks
      .map((p) => {
        const score = scoreGroupPrediction(p, fixture, result, null);
        const u = users[p.uid];
        const displayName =
          u?.displayName ??
          (p as any)._demoName ??
          p.uid.slice(0, 6);
        const photoURL = u?.photoURL ?? (p as any)._demoPhoto;
        const pickLabel =
          p.pickedOutcome === "DRAW"
            ? "Draw"
            : teams[p.pickedOutcome]?.name ?? p.pickedOutcome;
        const exact =
          p.homeGoals != null && p.awayGoals != null
            ? `${p.homeGoals}–${p.awayGoals}`
            : null;
        return {
          uid: p.uid,
          displayName,
          photoURL,
          pickLabel,
          exact,
          awarded: score.awarded,
          isCorrect: score.awarded > 0,
          hasResult: !!result,
        };
      })
      .sort((a, b) => {
        if (a.hasResult && a.awarded !== b.awarded) return b.awarded - a.awarded;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [picks, users, teams, fixture, result]);

  const correctCount = rows.filter((r) => r.isCorrect).length;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-end md:items-center justify-center p-3 md:p-6 overflow-y-auto"
         onClick={onClose}>
      <div
        className="card w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-ink-100 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide font-bold text-ink-500">
              {fixture.group ? `Group ${fixture.group}` : fixture.bracketSlot ?? "Match"}
            </div>
            <h3 className="text-lg font-extrabold mt-0.5 flex items-center gap-2">
              <span>{home?.flag}</span>
              <span>{home?.name ?? "TBD"}</span>
              <span className="text-ink-400 mx-1">vs</span>
              <span>{away?.flag}</span>
              <span>{away?.name ?? "TBD"}</span>
            </h3>
            <div className="text-xs text-ink-500 mt-1">{formatKickoff(fixture.kickoff as any)}</div>
            {result && (
              <div className="text-sm font-bold mt-2 chip-green">
                Final: {result.homeGoals} – {result.awayGoals}
              </div>
            )}
          </div>
          <button onClick={onClose} className="btn-ghost !px-2 !py-1" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="px-6 py-2 bg-ink-50 text-xs text-ink-600 flex justify-between">
          <span>{rows.length} pick{rows.length === 1 ? "" : "s"}</span>
          {result && (
            <span>
              {correctCount} / {rows.length} got the winner ({rows.length ? Math.round((correctCount / rows.length) * 100) : 0}%)
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 ? (
            <div className="px-6 py-10 text-center text-ink-500 text-sm">
              No picks recorded for this match.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-ink-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-6 py-2 font-semibold">Participant</th>
                  <th className="text-left px-2 py-2 font-semibold">Pick</th>
                  <th className="text-left px-2 py-2 font-semibold">Exact</th>
                  <th className="text-right px-6 py-2 font-semibold">{result ? "Pts" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid} className="border-t border-ink-100">
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {r.photoURL ? (
                          <img src={r.photoURL} alt="" className="w-7 h-7 rounded-full border border-ink-200" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-ink-200" />
                        )}
                        <span className="font-semibold">{r.displayName}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={clsx(
                        "chip",
                        r.hasResult && r.isCorrect && "chip-green",
                        r.hasResult && !r.isCorrect && "chip-red",
                        !r.hasResult && "chip-gray"
                      )}>
                        {r.pickLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-ink-600 tabular-nums">
                      {r.exact ?? <span className="text-ink-300">—</span>}
                    </td>
                    <td className="px-6 py-2.5 text-right tabular-nums font-bold">
                      {r.hasResult ? (r.awarded > 0 ? `+${r.awarded}` : "0") : <span className="text-ink-400 font-normal">pending</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
