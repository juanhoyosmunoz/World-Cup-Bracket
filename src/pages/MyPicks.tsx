import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { useAuth } from "../auth/AuthProvider";
import {
  saveBracket,
  saveFavorite,
  savePrediction,
  watchAppConfig,
  watchFixtures,
  watchMyBracket,
  watchMyFavorite,
  watchMyPredictions,
  watchResults,
  watchTeams,
} from "../lib/firestore";
import type { AppConfig, BracketPick, Fixture, GroupPrediction, KnockoutBracket, MatchResult, Team, FavoritePick } from "../types";
import MatchCard from "../components/MatchCard";
import Countdown from "../components/Countdown";
import MatchPicksModal from "../components/MatchPicksModal";
import FlagIcon from "../components/FlagIcon";
import { favoriteLocked, knockoutSlotLocked, knockoutSlotLockAt } from "../lib/locking";
import { KO_SLOTS, SLOTS_BY_STAGE, stageLabel, feederSlots } from "../lib/bracket";
import { computeGroupStandings } from "../lib/standings";

type Tab = "group" | "knockout" | "favorite";

export default function MyPicks() {
  const { user } = useAuth();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [teamsArr, setTeams] = useState<Team[]>([]);
  const [results, setResults] = useState<Record<string, MatchResult>>({});
  const [predictions, setPredictions] = useState<GroupPrediction[]>([]);
  const [favorite, setFavorite] = useState<FavoritePick | null>(null);
  const [bracket, setBracket] = useState<KnockoutBracket | null>(null);
  const [tab, setTab] = useState<Tab>("favorite");
  const [picksFixtureId, setPicksFixtureId] = useState<string | null>(null);

  useEffect(() => watchAppConfig(setCfg), []);
  useEffect(() => watchFixtures(setFixtures), []);
  useEffect(() => watchTeams(setTeams), []);
  useEffect(() => watchResults(setResults), []);
  useEffect(() => (user ? watchMyPredictions(user.uid, setPredictions) : undefined), [user]);
  useEffect(() => (user ? watchMyFavorite(user.uid, setFavorite) : undefined), [user]);
  useEffect(() => (user ? watchMyBracket(user.uid, setBracket) : undefined), [user]);

  const teams = useMemo(() => Object.fromEntries(teamsArr.map((t) => [t.id, t])), [teamsArr]);
  const predByFixture = useMemo(
    () => Object.fromEntries(predictions.map((p) => [p.fixtureId, p])),
    [predictions]
  );
  const groupFixtures = useMemo(
    () => fixtures.filter((f) => f.stage === "GROUP"),
    [fixtures]
  );
  // Group group-stage matches by user-local date so the picks page reads as
  // a daily fixture list (matches the way users think about the tournament).
  const byDay = useMemo(() => {
    const m = new Map<string, { label: string; sortKey: number; fixtures: Fixture[] }>();
    for (const f of groupFixtures) {
      const d = f.kickoff ? new Date(f.kickoff) : undefined;
      if (!d || isNaN(d.getTime())) continue;
      const key = d.toLocaleDateString(undefined, { year: "numeric", month: "2-digit", day: "2-digit" });
      const label = d.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      // Bucket start = start-of-day in local TZ
      const sortKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const cur = m.get(key) ?? { label, sortKey, fixtures: [] };
      cur.fixtures.push(f);
      m.set(key, cur);
    }
    // Inside each day, keep chronological by kickoff
    for (const v of m.values()) {
      v.fixtures.sort(
        (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
      );
    }
    return [...m.values()].sort((a, b) => a.sortKey - b.sortKey);
  }, [groupFixtures]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-extrabold">My Picks</h1>
        <div className="flex gap-1 rounded-full bg-ink-100 p-1">
          <TabBtn active={tab === "favorite"} onClick={() => setTab("favorite")}>Favorite Team</TabBtn>
          <TabBtn active={tab === "group"} onClick={() => setTab("group")}>Group Stage</TabBtn>
          <TabBtn active={tab === "knockout"} onClick={() => setTab("knockout")}>Knockout Bracket</TabBtn>
        </div>
      </div>

      {tab === "favorite" && (
        <FavoriteTab teams={teamsArr} favorite={favorite} locked={favoriteLocked(cfg)} cfg={cfg}
          fixtures={fixtures} results={results}
          onPick={async (teamId) => {
            if (!user) return;
            setFavorite({ uid: user.uid, teamId, setAt: new Date().toISOString() });
            await saveFavorite(user.uid, teamId);
          }}
        />
      )}

      {tab === "group" && (
        <div className="space-y-8">
          {byDay.length === 0 && (
            <div className="card-padded text-center text-ink-500">
              No group-stage matches scheduled yet.
            </div>
          )}
          {byDay.map((day) => {
            const openCount = day.fixtures.filter((f) => !predByFixture[f.id]).length;
            return (
              <section key={day.label}>
                <div className="flex items-end justify-between mb-3">
                  <h2 className="text-lg font-bold">{day.label}</h2>
                  <div className="text-xs text-ink-500">
                    {day.fixtures.length} match{day.fixtures.length === 1 ? "" : "es"}
                    {openCount > 0 && (
                      <span className="ml-2 chip-yellow">{openCount} to pick</span>
                    )}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {day.fixtures.map((f) => (
                    <MatchCard
                      key={f.id}
                      fixture={f}
                      teams={teams}
                      hideLive
                      myPrediction={predByFixture[f.id]}
                      result={results[f.id]}
                      favoriteTeamId={favorite?.teamId ?? null}
                      onSave={async ({ outcome, homeGoals, awayGoals }) => {
                        if (!user) return;
                        await savePrediction({
                          uid: user.uid,
                          fixtureId: f.id,
                          pickedOutcome: outcome,
                          homeGoals,
                          awayGoals,
                          updatedAt: "",
                        });
                      }}
                      onViewAllPicks={() => setPicksFixtureId(f.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {tab === "knockout" && (
        <KnockoutTab
          cfg={cfg}
          fixtures={fixtures}
          teams={teams}
          bracket={bracket}
          onSave={async (picks, submit) => {
            if (!user) return;
            await saveBracket(user.uid, {
              picks,
              submittedAt: submit ? new Date().toISOString() : bracket?.submittedAt,
            });
          }}
        />
      )}

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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "px-4 py-1.5 rounded-full text-sm font-semibold transition",
        active ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-white"
      )}
    >
      {children}
    </button>
  );
}

function FavoriteTab({
  teams,
  favorite,
  locked,
  cfg,
  fixtures,
  results,
  onPick,
}: {
  teams: Team[];
  favorite: FavoritePick | null;
  locked: boolean;
  cfg: AppConfig | null;
  fixtures: Fixture[];
  results: Record<string, MatchResult>;
  onPick: (teamId: string) => Promise<void>;
}) {
  const teamsMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t])), [teams]);
  const favTeam = favorite ? teamsMap[favorite.teamId] : null;

  const groupRows = useMemo(() => {
    if (!favTeam?.group) return [];
    return computeGroupStandings(favTeam.group, fixtures, results);
  }, [favTeam?.group, fixtures, results]);

  if (locked) {
    if (!favTeam) {
      return (
        <div className="card-padded text-center">
          <div className="text-4xl mb-2">😔</div>
          <h2 className="text-lg font-bold">No favorite team selected</h2>
          <p className="text-sm text-ink-500 mt-1">
            The deadline has passed. You won't receive the 2x bonus for any team.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="card-padded">
          <div className="flex items-center gap-4">
            <FlagIcon flag={favTeam.flag} className="w-16 h-11 object-cover rounded-md shadow-sm" />
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-500 font-bold">Your favorite team</div>
              <h2 className="text-2xl font-extrabold">{favTeam.name}</h2>
              {favTeam.group && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-ink-100 text-xs font-bold text-ink-700">
                  Group {favTeam.group}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 p-3 rounded-xl bg-brand-50 border border-brand-200">
            <div className="text-sm font-semibold text-brand-700">2x Point Bonus Active</div>
            <p className="text-xs text-brand-600 mt-0.5">
              Every correct prediction on a {favTeam.name} match earns double points.
            </p>
          </div>
        </div>

        {favTeam.group && groupRows.length > 0 && (
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-100 bg-gradient-to-r from-brand-50/60 to-transparent">
              <span className="font-bold text-ink-900">Group {favTeam.group} Standings</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-ink-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold">Team</th>
                  <th className="text-right px-1.5 py-2 font-semibold">P</th>
                  <th className="text-right px-1.5 py-2 font-semibold">W</th>
                  <th className="text-right px-1.5 py-2 font-semibold">D</th>
                  <th className="text-right px-1.5 py-2 font-semibold">L</th>
                  <th className="text-right px-1.5 py-2 font-semibold">GD</th>
                  <th className="text-right px-3 py-2 font-semibold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((r) => {
                  const t = teamsMap[r.teamId];
                  const isFav = r.teamId === favTeam.id;
                  return (
                    <tr key={r.teamId} className={clsx("border-t border-ink-100", isFav && "bg-brand-50/50")}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FlagIcon flag={t?.flag} className="w-6 h-4 object-cover rounded-sm" />
                          <span className={clsx("font-semibold", isFav && "text-brand-700")}>
                            {t?.name ?? r.teamId}
                            {isFav && <span className="ml-1.5 text-[10px] text-brand-500">★</span>}
                          </span>
                        </div>
                      </td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{r.played}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{r.wins}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{r.draws}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{r.losses}</td>
                      <td className="px-1.5 py-2 text-right tabular-nums">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                      <td className={clsx("px-3 py-2 text-right font-extrabold tabular-nums", isFav && "text-brand-700")}>{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return <FavoritePickerGrid teams={teams} favorite={favorite} cfg={cfg} onPick={onPick} />;
}

function FavoritePickerGrid({
  teams, favorite, cfg, onPick,
}: {
  teams: Team[];
  favorite: FavoritePick | null;
  cfg: AppConfig | null;
  onPick: (teamId: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const filtered = teams
    .filter((t) => t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="card-padded">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Pick your favorite team</h2>
          <p className="text-sm text-ink-500">
            Your favorite team doubles your group-stage points whenever they play and you predict correctly.
          </p>
        </div>
        {cfg?.favoriteLockAt && (
          <Countdown to={cfg.favoriteLockAt} className="chip-yellow" prefix="Locks in" />
        )}
      </div>

      <div className="mt-4">
        <input className="field-input max-w-sm" placeholder="Search teams..." value={q}
          onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {filtered.map((t) => (
          <button key={t.id} onClick={() => onPick(t.id)}
            className={clsx(
              "p-3 rounded-xl border text-left transition",
              favorite?.teamId === t.id
                ? "border-brand-500 bg-brand-50"
                : "border-ink-200 hover:bg-ink-50"
            )}>
            <FlagIcon flag={t.flag} className="w-8 h-6 object-cover rounded-sm" />
            <div className="font-semibold text-sm leading-tight mt-1">{t.name}</div>
            {t.group && <div className="text-xs text-ink-500">Group {t.group}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function KnockoutTab({
  cfg,
  fixtures,
  teams,
  bracket,
  onSave,
}: {
  cfg: AppConfig | null;
  fixtures: Fixture[];
  teams: Record<string, Team>;
  bracket: KnockoutBracket | null;
  onSave: (picks: KnockoutBracket["picks"], submit?: boolean) => Promise<void>;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const isSlotLocked = (slot: string) => knockoutSlotLocked(slot, fixtures, cfg, now);
  const allLocked = KO_SLOTS.every((s) => isSlotLocked(s));
  const nextLockAt = useMemo(() => {
    const upcoming = KO_SLOTS
      .map((s) => knockoutSlotLockAt(s, fixtures, cfg))
      .filter((d): d is Date => !!d && d.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());
    return upcoming[0] ?? null;
  }, [fixtures, cfg, now]);

  const [picks, setPicks] = useState<KnockoutBracket["picks"]>(bracket?.picks ?? {});
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  const serverPicksJson = useMemo(() => JSON.stringify(bracket?.picks ?? {}), [bracket?.picks]);
  useEffect(() => {
    setPicks(JSON.parse(serverPicksJson));
    setDirty(false);
  }, [serverPicksJson]);

  function getDownstream(slot: string): Set<string> {
    const result = new Set<string>();
    for (const s of KO_SLOTS) {
      const feeders = feederSlots(s);
      if (feeders?.includes(slot)) {
        result.add(s);
        for (const d of getDownstream(s)) result.add(d);
      }
    }
    return result;
  }

  function setPick(slot: string, teamId: string | null, score?: { h?: number | null; a?: number | null }) {
    setPicks((prev) => {
      const next = { ...prev, [slot]: {
        ...(prev[slot] ?? {}),
        teamId,
        homeGoals: score?.h !== undefined ? score.h : prev[slot]?.homeGoals ?? null,
        awayGoals: score?.a !== undefined ? score.a : prev[slot]?.awayGoals ?? null,
      } };
      const prevTeam = prev[slot]?.teamId ?? null;
      if (prevTeam && prevTeam !== teamId) {
        const downstream = getDownstream(slot);
        for (const s of downstream) {
          if (next[s]?.teamId === prevTeam) next[s] = { ...next[s], teamId: null };
        }
      }
      return next;
    });
    setDirty(true);
  }

  // For R32 slot S, the candidate teams are the actual teams the admin has
  // mapped in fixtures.bracketSlot=S. For deeper slots, the candidates are
  // the user's own picks for the two feeder slots.
  function candidatesFor(slot: string): (Team | undefined)[] {
    const fs = feederSlots(slot);
    if (!fs) {
      // R32 — read from the fixture that has bracketSlot == slot
      const fx = fixtures.find((f) => f.bracketSlot === slot);
      return [
        fx?.homeTeamId ? teams[fx.homeTeamId] : undefined,
        fx?.awayTeamId ? teams[fx.awayTeamId] : undefined,
      ];
    }
    if (slot === "THIRD") {
      // Third place: the two SF "losers" — i.e., for each SF slot, the
      // candidate is the OTHER team between the user's picks at that SF's
      // feeders.
      return ["SF-1", "SF-2"].map((sf) => {
        const fs2 = feederSlots(sf)!;
        const winnerPick = picks[sf]?.teamId;
        const candidates = fs2.map((f) => picks[f]?.teamId).filter(Boolean) as string[];
        const loser = candidates.find((c) => c !== winnerPick);
        return loser ? teams[loser] : undefined;
      });
    }
    return fs.map((f) => {
      const tid = picks[f]?.teamId;
      return tid ? teams[tid] : undefined;
    });
  }

  async function handleSave(submit = false) {
    setSaveStatus("saving");
    try {
      await onSave(picks, submit);
      setDirty(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
    } catch {
      setSaveStatus("error");
    } finally {
      setConfirming(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const totalSlots = KO_SLOTS.length;
  const filledCount = KO_SLOTS.filter((s) => picks[s]?.teamId).length;
  const allFilled = filledCount === totalSlots;

  const openSlot = (slot: string) => setActiveSlot(slot);

  const activeHome = activeSlot ? candidatesFor(activeSlot)[0] : undefined;
  const activeAway = activeSlot ? candidatesFor(activeSlot)[1] : undefined;

  const isSubmitted = !!bracket?.submittedAt;

  return (
    <div className="space-y-6">
      <div className="card-padded flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Knockout bracket</h2>
          <p className="text-sm text-ink-500">
            {isSubmitted
              ? `Submitted! You can still edit until the lock deadline. ${filledCount}/${totalSlots} picks.`
              : `Click any match to predict the score. ${filledCount}/${totalSlots} picks filled.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allLocked ? (
            <span className="chip-red">Bracket locked</span>
          ) : (
            nextLockAt && (
              <Countdown to={nextLockAt} className="chip-yellow" prefix="Next round locks in" />
            )
          )}
          {isSubmitted && !allLocked && <span className="chip-green">Submitted</span>}
          {!allLocked && !isSubmitted && (
            <>
              <button
                onClick={() => handleSave(false)}
                disabled={!dirty || saveStatus === "saving"}
                className="btn-ghost"
              >
                {saveStatus === "saving" ? "Saving..." : "Save draft"}
              </button>
              <button
                onClick={() => setConfirming(true)}
                disabled={!allFilled || saveStatus === "saving"}
                className="btn-primary"
              >
                Submit bracket
              </button>
            </>
          )}
          {!allLocked && isSubmitted && (
            <button
              onClick={() => setConfirming(true)}
              disabled={!dirty || saveStatus === "saving"}
              className="btn-primary"
            >
              Update bracket
            </button>
          )}
          {saveStatus === "saved" && <span className="chip-green">Saved</span>}
          {saveStatus === "error" && <span className="chip-red">Failed to save</span>}
        </div>
      </div>

      {/* Traditional bracket: left half -> Final <- right half */}
      <div className="card overflow-x-auto">
        <div className="flex items-stretch p-2 w-fit mx-auto min-h-[calc(100vh-220px)]">
          {/* ---- LEFT HALF ---- */}
          <BracketRound label="R32" slots={["R32-1","R32-2","R32-3","R32-4","R32-5","R32-6","R32-7","R32-8"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketConnector count={4} side="left" />
          <BracketRound label="R16" slots={["R16-1","R16-2","R16-3","R16-4"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketConnector count={2} side="left" />
          <BracketRound label="QF" slots={["QF-1","QF-2"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketConnector count={1} side="left" />
          <BracketRound label="SF" slots={["SF-1"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketLine />

          {/* ---- CENTER: FINAL + THIRD ---- */}
          <div className="flex flex-col w-32 shrink-0">
            <div className="h-5" />
            <div className="flex-1 flex flex-col items-center">
              <div className="flex-1" />
              <div className="px-1 text-center w-full">
                <div className="text-base mb-0.5">🏆</div>
                <div className="text-[9px] uppercase tracking-wide font-bold text-brand-500 mb-1">Champion</div>
                <BracketSlot
                  slot="FINAL" highlight
                  candidates={candidatesFor("FINAL")}
                  pick={picks["FINAL"]}
                  locked={isSlotLocked("FINAL")}
                  onClick={() => openSlot("FINAL")}
                />
              </div>
              <div className="flex-1 flex flex-col items-center px-1 w-full">
                <div className="mt-6 w-full">
                  <div className="text-[8px] uppercase tracking-wide font-bold text-ink-500 text-center mb-0.5">3rd Place</div>
                  <BracketSlot
                    slot="THIRD"
                    candidates={candidatesFor("THIRD")}
                    pick={picks["THIRD"]}
                    locked={isSlotLocked("THIRD")}
                    onClick={() => openSlot("THIRD")}
                  />
                </div>
              </div>
            </div>
          </div>

          <BracketLine />
          {/* ---- RIGHT HALF (mirrored) ---- */}
          <BracketRound label="SF" slots={["SF-2"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketConnector count={1} side="right" />
          <BracketRound label="QF" slots={["QF-3","QF-4"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketConnector count={2} side="right" />
          <BracketRound label="R16" slots={["R16-5","R16-6","R16-7","R16-8"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
          <BracketConnector count={4} side="right" />
          <BracketRound label="R32" slots={["R32-9","R32-10","R32-11","R32-12","R32-13","R32-14","R32-15","R32-16"]}
            picks={picks} candidatesFor={candidatesFor} onOpenSlot={openSlot} isLocked={isSlotLocked} />
        </div>
      </div>

      {activeSlot && activeHome && activeAway && (
        <BracketScoreModal
          slot={activeSlot}
          homeTeam={activeHome}
          awayTeam={activeAway}
          currentPick={picks[activeSlot]}
          locked={isSlotLocked(activeSlot)}
          lockAt={knockoutSlotLockAt(activeSlot, fixtures, cfg)}
          onSave={(teamId, hg, ag) => {
            setPick(activeSlot, teamId, { h: hg, a: ag });
            setActiveSlot(null);
          }}
          onClose={() => setActiveSlot(null)}
        />
      )}

      {confirming && (
        <ConfirmDialog
          onCancel={() => setConfirming(false)}
          onConfirm={() => handleSave(true)}
          title="Submit your bracket?"
          body="You can keep editing until the lock deadline, but please double-check your final score prediction — it's used as the tiebreaker."
        />
      )}
    </div>
  );
}

function BracketRound({
  label, slots, picks, candidatesFor, onOpenSlot, isLocked,
}: {
  label: string;
  slots: string[];
  picks: KnockoutBracket["picks"];
  candidatesFor: (slot: string) => (Team | undefined)[];
  onOpenSlot: (slot: string) => void;
  isLocked: (slot: string) => boolean;
}) {
  return (
    <div className="flex flex-col w-24 shrink-0">
      <div className="h-5 flex items-center justify-center shrink-0">
        <span className="text-[9px] uppercase tracking-wide font-bold text-ink-500 whitespace-nowrap">{label}</span>
      </div>
      <div className="flex-1 flex flex-col">
        {slots.map((slot) => (
          <div key={slot} className="flex-1 flex items-center">
            <BracketSlot
              slot={slot}
              candidates={candidatesFor(slot)}
              pick={picks[slot]}
              locked={isLocked(slot)}
              onClick={() => onOpenSlot(slot)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketConnector({ count, side }: { count: number; side: "left" | "right" }) {
  return (
    <div className="flex flex-col w-3 shrink-0">
      <div className="h-5" />
      <div className="flex-1 flex flex-col">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col">
            <div className="flex-1" />
            <div className="flex-[2] flex flex-col">
              <div className={clsx(
                "flex-1",
                side === "left" ? "border-t border-r rounded-tr-sm" : "border-t border-l rounded-tl-sm",
                "border-ink-300"
              )} />
              <div className={clsx(
                "flex-1",
                side === "left" ? "border-b border-r rounded-br-sm" : "border-b border-l rounded-bl-sm",
                "border-ink-300"
              )} />
            </div>
            <div className="flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketLine() {
  return (
    <div className="flex flex-col w-2 shrink-0">
      <div className="h-5" />
      <div className="flex-1 flex items-center">
        <div className="w-full border-t border-ink-300" />
      </div>
    </div>
  );
}

function BracketSlot({
  slot, candidates, pick, onClick, highlight, locked,
}: {
  slot: string;
  candidates: (Team | undefined)[];
  pick?: BracketPick;
  onClick: () => void;
  highlight?: boolean;
  locked?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={clsx(
        "w-full rounded px-1 py-0.5 text-left transition",
        locked
          ? "border border-ink-200 bg-ink-50 cursor-default"
          : highlight
            ? "border-2 border-brand-400 bg-brand-50/40 hover:bg-brand-50/60 cursor-pointer"
            : "border border-ink-200 bg-white hover:border-ink-300 cursor-pointer"
      )}>
      <div className={clsx(
        "text-[8px] font-bold uppercase mb-0.5 flex items-center justify-between gap-1",
        highlight ? "text-brand-600" : "text-ink-400"
      )}>
        <span>{slot}</span>
        {locked && <span className="text-ink-400" title="Locked">🔒</span>}
      </div>
      <div className="space-y-px">
        {candidates.map((team, i) => {
          const isWinner = team && pick?.teamId === team.id;
          const score = i === 0 ? pick?.homeGoals : pick?.awayGoals;
          return (
            <div key={team?.id ?? `_${i}`}
              className={clsx(
                "flex items-center gap-1 px-1 py-0.5 rounded text-[11px]",
                isWinner ? "bg-brand-100 font-bold" : ""
              )}>
              {team ? (
                <>
                  <FlagIcon flag={team.flag} className="w-4 h-3 object-cover rounded-[1px] shrink-0" />
                  <span className="truncate flex-1">{team.shortName || team.name}</span>
                  {score != null && <span className="text-[10px] tabular-nums text-ink-500 font-semibold">{score}</span>}
                </>
              ) : (
                <span className="italic text-[9px] text-ink-400">TBD</span>
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}

function slotDisplayLabel(slot: string): string {
  if (slot === "FINAL") return "Final";
  if (slot === "THIRD") return "Third-Place Match";
  const [stage, num] = slot.split("-");
  const names: Record<string, string> = { R32: "Round of 32", R16: "Round of 16", QF: "Quarterfinal", SF: "Semifinal" };
  return `${names[stage] ?? stage} · Match ${num}`;
}

function BracketScoreModal({
  slot, homeTeam, awayTeam, currentPick, locked, lockAt, onSave, onClose,
}: {
  slot: string;
  homeTeam: Team;
  awayTeam: Team;
  currentPick?: BracketPick;
  locked: boolean;
  lockAt?: string | Date | null;
  onSave: (teamId: string | null, hg: number | null, ag: number | null) => void;
  onClose: () => void;
}) {
  const [hg, setHg] = useState(currentPick?.homeGoals?.toString() ?? "");
  const [ag, setAg] = useState(currentPick?.awayGoals?.toString() ?? "");
  const [penWinner, setPenWinner] = useState<string | null>(currentPick?.teamId ?? null);

  const hNum = hg === "" ? null : parseInt(hg, 10);
  const aNum = ag === "" ? null : parseInt(ag, 10);
  const isDraw = hNum !== null && aNum !== null && hNum === aNum;
  const autoWinner =
    hNum !== null && aNum !== null
      ? hNum > aNum ? homeTeam.id : aNum > hNum ? awayTeam.id : null
      : null;
  const winner = isDraw ? penWinner : autoWinner;
  const canSave = winner !== null && hNum !== null && aNum !== null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card-padded max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs uppercase tracking-wider text-ink-500 font-bold">{slotDisplayLabel(slot)}</div>
          {locked ? (
            <span className="chip-red shrink-0">Locked</span>
          ) : (
            lockAt && <Countdown to={lockAt} className="chip-yellow shrink-0" />
          )}
        </div>

        <div className="mt-4 space-y-3">
          <div className={clsx("flex items-center gap-3 p-2 rounded-lg transition",
            winner === homeTeam.id && "bg-brand-50 ring-2 ring-brand-400")}>
            <FlagIcon flag={homeTeam.flag} className="w-8 h-6 object-cover rounded-sm shrink-0" />
            <span className="font-semibold flex-1">{homeTeam.name}</span>
            <input type="text" inputMode="numeric" disabled={locked}
              className="field-input w-14 text-center text-lg font-bold" placeholder="-"
              value={hg} onChange={(e) => setHg(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>

          <div className="text-center text-ink-400 text-xs font-bold">VS</div>

          <div className={clsx("flex items-center gap-3 p-2 rounded-lg transition",
            winner === awayTeam.id && "bg-brand-50 ring-2 ring-brand-400")}>
            <FlagIcon flag={awayTeam.flag} className="w-8 h-6 object-cover rounded-sm shrink-0" />
            <span className="font-semibold flex-1">{awayTeam.name}</span>
            <input type="text" inputMode="numeric" disabled={locked}
              className="field-input w-14 text-center text-lg font-bold" placeholder="-"
              value={ag} onChange={(e) => setAg(e.target.value.replace(/[^0-9]/g, ""))} />
          </div>

          {isDraw && (
            <div className="border-t border-ink-100 pt-3">
              <div className="text-xs font-bold text-ink-500 mb-2">Penalty shootout winner:</div>
              <div className="flex gap-2">
                {[homeTeam, awayTeam].map((t) => (
                  <button key={t.id} type="button" onClick={() => setPenWinner(t.id)}
                    className={clsx("flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition",
                      penWinner === t.id ? "border-brand-500 bg-brand-50 font-bold" : "border-ink-200 hover:bg-ink-50")}>
                    <FlagIcon flag={t.flag} className="w-5 h-4 rounded-sm" />
                    <span className="text-sm">{t.shortName || t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={!canSave || locked}
            onClick={() => onSave(winner, hNum, aNum)}
            className="btn-primary">
            Save pick
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({ onCancel, onConfirm, title, body }: { onCancel: () => void; onConfirm: () => void; title: string; body: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="card-padded max-w-md w-full">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="text-sm text-ink-600 mt-1">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} className="btn-primary">Submit</button>
        </div>
      </div>
    </div>
  );
}
