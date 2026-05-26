import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  watchAppConfig,
  watchFixtures,
  watchLeaderboard,
  watchMyFavorite,
  watchMyPredictions,
  watchResults,
  watchTeams,
} from "../lib/firestore";
import type { AppConfig, FavoritePick, Fixture, GroupPrediction, LeaderboardEntry, MatchResult, Team } from "../types";
import { fixtureLocked, knockoutLocked, favoriteLocked } from "../lib/locking";
import MatchCard from "../components/MatchCard";
import Countdown from "../components/Countdown";
import MatchPicksModal from "../components/MatchPicksModal";
import UpcomingBanner from "../components/UpcomingBanner";

export default function Dashboard() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [teamsArr, setTeams] = useState<Team[]>([]);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [predictions, setPredictions] = useState<GroupPrediction[]>([]);
  const [favorite, setFavorite] = useState<FavoritePick | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => watchAppConfig(setCfg), []);
  useEffect(() => watchFixtures(setFixtures), []);
  useEffect(() => watchTeams(setTeams), []);
  useEffect(() => watchResults(setResults), []);
  useEffect(() => watchLeaderboard(setLeaderboard), []);
  useEffect(() => (user ? watchMyPredictions(user.uid, setPredictions) : undefined), [user]);
  useEffect(() => (user ? watchMyFavorite(user.uid, setFavorite) : undefined), [user]);

  const teams = useMemo(() => Object.fromEntries(teamsArr.map((t) => [t.id, t])), [teamsArr]);
  const predByFixture = useMemo(
    () => Object.fromEntries(predictions.map((p) => [p.fixtureId, p])),
    [predictions]
  );

  const upcomingOpen = useMemo(
    () =>
      fixtures
        .filter((f) => f.stage === "GROUP" && !fixtureLocked(f))
        .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [fixtures]
  );
  const liveMatches = useMemo(
    () =>
      fixtures
        .filter((f) => f.status === "LIVE")
        .sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [fixtures]
  );

  const recentlyCompleted = useMemo(
    () =>
      fixtures
        .filter((f) => f.status !== "LIVE" && !!results[f.id])
        .sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime())
        .slice(0, 4),
    [fixtures, results]
  );

  const myLine = leaderboard.find((l) => l.uid === user?.uid);

  const koLocked = knockoutLocked(cfg);
  const favLocked = favoriteLocked(cfg);

  const [picksFixtureId, setPicksFixtureId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <section className="card-padded relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-brand-500/30 blur-2xl pointer-events-none" />
        <div className="relative">
          <div className="text-xs uppercase tracking-wider text-ink-500 font-bold">Welcome back</div>
          <h1 className="text-3xl font-extrabold mt-1">
            Hey {user?.displayName?.split(" ")[0]} 👋
          </h1>
          <p className="text-ink-600 mt-1">
            World Cup 2026 — 48 teams, 12 groups. Pick smart, climb the board.
          </p>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Your points" value={myLine?.totalPoints ?? 0} />
            <Stat label="Your rank" value={myLine ? `#${myLine.rank}` : "—"} />
            <Stat
              label="Favorite team"
              value={favorite ? teams[favorite.teamId]?.name ?? "—" : "Not set"}
              cta={
                !favLocked && (
                  <Link to="/picks" className="text-xs underline">
                    {favorite ? "Change" : "Pick"}
                  </Link>
                )
              }
            />
            <Stat
              label="Knockout bracket"
              value={koLocked ? "Locked" : "Open"}
              cta={
                !koLocked && cfg?.knockoutLockAt && (
                  <Countdown to={cfg.knockoutLockAt} className="text-xs text-ink-500" />
                )
              }
            />
          </div>
        </div>
      </section>

      {/* Live now — top priority, only rendered when something's in progress */}
      {liveMatches.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
            <span className="inline-flex w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
            Live now
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {liveMatches.map((f) => (
              <MatchCard
                key={f.id}
                fixture={f}
                teams={teams}
                myPrediction={predByFixture[f.id]}
                result={results[f.id]}
                favoriteTeamId={favorite?.teamId ?? null}
                onViewAllPicks={() => setPicksFixtureId(f.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Upcoming banner — horizontal scroll of every upcoming open match */}
      <UpcomingBanner
        fixtures={upcomingOpen}
        teams={teams}
        predictionsByFixture={predByFixture}
        favoriteTeamId={favorite?.teamId ?? null}
      />

      {/* Recently completed */}
      <section>
        <h2 className="text-xl font-bold mb-3">Recently completed</h2>
        {recentlyCompleted.length === 0 ? (
          <EmptyState title="No results yet" body="Match results show up here as they come in." />
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {recentlyCompleted.map((f) => (
              <MatchCard
                key={f.id}
                fixture={f}
                teams={teams}
                myPrediction={predByFixture[f.id]}
                result={results[f.id]}
                favoriteTeamId={favorite?.teamId ?? null}
                onViewAllPicks={() => setPicksFixtureId(f.id)}
              />
            ))}
          </div>
        )}
      </section>

      {picksFixtureId && (
        <MatchPicksModal
          fixtureId={picksFixtureId}
          fixture={fixtures.find((f) => f.id === picksFixtureId)!}
          teams={teams}
          result={results[picksFixtureId]}
          onClose={() => setPicksFixtureId(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, cta }: { label: string; value: React.ReactNode; cta?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-ink-500 font-bold">{label}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="card-padded text-center text-ink-600">
      <div className="text-base font-bold">{title}</div>
      <div className="text-sm">{body}</div>
    </div>
  );
}
