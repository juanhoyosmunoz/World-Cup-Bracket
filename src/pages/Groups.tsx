import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  watchFixtures,
  watchMyFavorite,
  watchResults,
  watchTeams,
} from "../lib/firestore";
import type { FavoritePick, Fixture, MatchResult, Team } from "../types";
import { useAuth } from "../auth/AuthProvider";
import {
  bestThirdQualifiers,
  computeGroupStandings,
  type StandingsRow,
} from "../lib/standings";

export default function Groups() {
  const { user } = useAuth();
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [teamsArr, setTeams] = useState<Team[]>([]);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [favorite, setFavorite] = useState<FavoritePick | null>(null);

  useEffect(() => watchFixtures(setFixtures), []);
  useEffect(() => watchTeams(setTeams), []);
  useEffect(() => watchResults(setResults), []);
  useEffect(() => (user ? watchMyFavorite(user.uid, setFavorite) : undefined), [user]);

  const teams = useMemo(
    () => Object.fromEntries(teamsArr.map((t) => [t.id, t])),
    [teamsArr]
  );

  // List of groups that have at least one fixture/team.
  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const f of fixtures) if (f.stage === "GROUP" && f.group) s.add(f.group);
    return [...s].sort();
  }, [fixtures]);

  const standingsByGroup = useMemo(() => {
    const m: Record<string, StandingsRow[]> = {};
    for (const g of groups) m[g] = computeGroupStandings(g, fixtures, results);
    return m;
  }, [groups, fixtures, results]);

  const bestThirds = useMemo(
    () => bestThirdQualifiers(groups, fixtures, results),
    [groups, fixtures, results]
  );

  const anyMatchPlayed = Object.values(results).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Groups</h1>
          <p className="text-ink-500 text-sm">
            All 12 groups · top 2 advance · 8 best third-placed teams also advance to the Round of 32.
          </p>
        </div>
        <Legend bestThirdsActive={anyMatchPlayed} />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((g) => (
          <GroupCard
            key={g}
            group={g}
            rows={standingsByGroup[g] ?? []}
            teams={teams}
            favoriteTeamId={favorite?.teamId ?? null}
            bestThirds={bestThirds}
            anyMatchPlayed={anyMatchPlayed}
          />
        ))}
        {groups.length === 0 && (
          <div className="card-padded col-span-full text-center text-ink-500">
            No groups have been set up yet.
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ bestThirdsActive }: { bestThirdsActive: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Dot color="bg-emerald-500" /> <span className="text-ink-600">Advances</span>
      <Dot color="bg-brand-500" />
      <span className="text-ink-600">
        Best 3rd {bestThirdsActive ? "" : "(pending)"}
      </span>
      <Dot color="bg-ink-300" /> <span className="text-ink-600">Eliminated</span>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={clsx("inline-block w-2 h-2 rounded-full", color)} />;
}

function GroupCard({
  group,
  rows,
  teams,
  favoriteTeamId,
  bestThirds,
  anyMatchPlayed,
}: {
  group: string;
  rows: StandingsRow[];
  teams: Record<string, Team>;
  favoriteTeamId: string | null;
  bestThirds: Set<string>;
  anyMatchPlayed: boolean;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100 bg-gradient-to-r from-brand-50/60 to-transparent">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-ink-950 text-brand-500 font-black text-sm">
            {group}
          </span>
          <span className="font-bold text-ink-900">Group {group}</span>
        </div>
        <span className="text-xs text-ink-500">
          {rows.reduce((n, r) => n + r.played, 0) / 2 || 0} / 6 played
        </span>
      </div>

      <table className="w-full text-sm">
        <thead className="text-ink-500 text-[11px] uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2 font-semibold">Team</th>
            <th className="text-right px-1.5 py-2 font-semibold">P</th>
            <th className="text-right px-1.5 py-2 font-semibold">W</th>
            <th className="text-right px-1.5 py-2 font-semibold">D</th>
            <th className="text-right px-1.5 py-2 font-semibold">L</th>
            <th className="text-right px-1.5 py-2 font-semibold">GF</th>
            <th className="text-right px-1.5 py-2 font-semibold">GA</th>
            <th className="text-right px-1.5 py-2 font-semibold">GD</th>
            <th className="text-right px-3 py-2 font-semibold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const team = teams[r.teamId];
            const isFav = team?.id === favoriteTeamId;
            const status: "advance" | "best3" | "out" | "tbd" =
              i < 2
                ? "advance"
                : i === 2
                  ? bestThirds.has(r.teamId) ? "best3" : anyMatchPlayed ? "out" : "tbd"
                  : "out";
            return (
              <tr key={r.teamId} className="border-t border-ink-100">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "inline-block w-1.5 h-6 rounded-full",
                      status === "advance" && "bg-emerald-500",
                      status === "best3" && "bg-brand-500",
                      status === "out" && "bg-ink-200",
                      status === "tbd" && "bg-ink-200",
                    )} />
                    <span className="text-lg leading-none">{team?.flag ?? "·"}</span>
                    <span className="font-semibold">
                      {team?.name ?? r.teamId}
                      {isFav && <span className="ml-1.5 chip-yellow text-[10px]">★ favorite</span>}
                    </span>
                  </div>
                </td>
                <Cell v={r.played} />
                <Cell v={r.wins} />
                <Cell v={r.draws} />
                <Cell v={r.losses} />
                <Cell v={r.goalsFor} />
                <Cell v={r.goalsAgainst} />
                <Cell v={signed(r.goalDiff)} />
                <td className="px-3 py-2 text-right font-extrabold tabular-nums">{r.points}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={9} className="px-3 py-6 text-center text-ink-400 italic text-xs">No teams assigned</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ v }: { v: number | string }) {
  return <td className="px-1.5 py-2 text-right tabular-nums text-ink-700">{v}</td>;
}

function signed(n: number) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}
