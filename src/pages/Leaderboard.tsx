import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { watchLeaderboard } from "../lib/firestore";
import type { LeaderboardEntry } from "../types";
import clsx from "clsx";

export default function Leaderboard() {
  const { user } = useAuth();
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  useEffect(() => watchLeaderboard(setBoard), []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Leaderboard</h1>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-500">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">#</th>
              <th className="text-left px-4 py-3 font-semibold">Participant</th>
              <th className="text-right px-4 py-3 font-semibold">Total</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Group</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Knockout</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Fav. bonus</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Exact bonus</th>
              <th className="text-right px-4 py-3 font-semibold hidden md:table-cell">Δ</th>
            </tr>
          </thead>
          <tbody>
            {board.length === 0 && (
              <tr><td colSpan={8} className="text-center px-4 py-10 text-ink-500">
                Leaderboard will appear after the first locked match.
              </td></tr>
            )}
            {board.map((row) => (
              <tr
                key={row.uid}
                className={clsx(
                  "border-t border-ink-100",
                  row.uid === user?.uid && "bg-brand-50/60"
                )}
              >
                <td className="px-4 py-3 font-bold tabular-nums">{row.rank}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {row.photoURL && <img src={row.photoURL} alt="" className="w-7 h-7 rounded-full border" />}
                    <div>
                      <div className="font-semibold">{row.displayName}</div>
                      <div className="text-xs text-ink-500">
                        {row.correctOutcomes} correct · {row.correctExactScores} exact
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-extrabold tabular-nums">{row.totalPoints}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{row.groupPoints}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">{row.knockoutPoints}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">+{row.favoriteBonusPoints}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">+{row.exactScoreBonusPoints}</td>
                <td className="px-4 py-3 text-right tabular-nums hidden md:table-cell">
                  <Movement prev={row.previousRank} cur={row.rank} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Movement({ prev, cur }: { prev: number | null; cur: number }) {
  if (prev == null) return <span className="text-ink-300">—</span>;
  if (prev === cur) return <span className="text-ink-400">·</span>;
  const up = cur < prev;
  return (
    <span className={clsx("font-bold", up ? "text-emerald-600" : "text-rose-600")}>
      {up ? "▲" : "▼"} {Math.abs(prev - cur)}
    </span>
  );
}
