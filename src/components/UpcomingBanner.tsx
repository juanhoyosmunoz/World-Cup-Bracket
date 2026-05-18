// Horizontally-scrolling banner of every upcoming (not-yet-locked) fixture.
// Compact tiles are clickable → navigate to /picks for the actual picking UI.

import { Link } from "react-router-dom";
import clsx from "clsx";
import type { Fixture, GroupPrediction, Team } from "../types";
import { formatKickoff } from "../lib/locking";
import Countdown from "./Countdown";

interface Props {
  fixtures: Fixture[];
  teams: Record<string, Team>;
  predictionsByFixture: Record<string, GroupPrediction>;
  favoriteTeamId?: string | null;
}

export default function UpcomingBanner({
  fixtures,
  teams,
  predictionsByFixture,
  favoriteTeamId,
}: Props) {
  if (fixtures.length === 0) {
    return (
      <div className="card-padded text-center text-ink-600">
        <div className="font-bold text-base">No upcoming matches</div>
        <div className="text-sm">You're all caught up — new matches will appear here as the schedule rolls in.</div>
      </div>
    );
  }

  const openToPick = fixtures.filter((f) => !predictionsByFixture[f.id]).length;

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-ink-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-extrabold text-lg">Upcoming matches</h2>
          <p className="text-xs text-ink-500">
            {fixtures.length} match{fixtures.length === 1 ? "" : "es"} upcoming
            {openToPick > 0 && (
              <> · <span className="font-semibold text-ink-700">{openToPick} still need your pick</span></>
            )}
          </p>
        </div>
        <Link to="/picks" className="btn-primary">
          Make picks →
        </Link>
      </div>

      {/* Horizontal scroller. -mx pulls the scroller flush to the card edges
          so users see partial tiles at the edge as a scroll affordance. */}
      <div className="overflow-x-auto">
        <div className="flex gap-3 p-4 min-w-min">
          {fixtures.map((f) => (
            <UpcomingTile
              key={f.id}
              fixture={f}
              teams={teams}
              prediction={predictionsByFixture[f.id]}
              favoriteTeamId={favoriteTeamId ?? null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UpcomingTile({
  fixture,
  teams,
  prediction,
  favoriteTeamId,
}: {
  fixture: Fixture;
  teams: Record<string, Team>;
  prediction?: GroupPrediction;
  favoriteTeamId: string | null;
}) {
  const home = fixture.homeTeamId ? teams[fixture.homeTeamId] : undefined;
  const away = fixture.awayTeamId ? teams[fixture.awayTeamId] : undefined;
  const involvesFav =
    favoriteTeamId != null &&
    (fixture.homeTeamId === favoriteTeamId || fixture.awayTeamId === favoriteTeamId);
  const hasPick = !!prediction;
  const myPickLabel =
    !hasPick
      ? null
      : prediction.pickedOutcome === "DRAW"
        ? "Draw"
        : teams[prediction.pickedOutcome]?.shortName ?? prediction.pickedOutcome;

  return (
    <Link
      to="/picks"
      className={clsx(
        "shrink-0 w-[230px] rounded-xl border bg-white p-3.5 hover:bg-ink-50 transition",
        hasPick ? "border-ink-200" : "border-brand-500/40 ring-1 ring-brand-500/20"
      )}
    >
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="chip-yellow font-bold">Group {fixture.group}</span>
        {involvesFav && (
          <span className="chip-yellow text-[10px]" title="Favorite team — points doubled">
            ★ x2
          </span>
        )}
      </div>

      <div className="text-[11px] text-ink-500 mt-2 leading-tight">
        {formatKickoff(fixture.kickoff as any)}
      </div>

      <div className="mt-3 space-y-1.5">
        <Row team={home} />
        <Row team={away} />
      </div>

      <div className="mt-3 pt-2.5 border-t border-ink-100 flex items-center justify-between text-[11px]">
        <Countdown to={fixture.lockAt as any} className="text-ink-500" prefix="Locks in" />
        {hasPick ? (
          <span className="chip-green !py-0 !px-2 text-[10px]">
            ✓ {myPickLabel}
          </span>
        ) : (
          <span className="chip-yellow !py-0 !px-2 text-[10px]">Pick</span>
        )}
      </div>
    </Link>
  );
}

function Row({ team }: { team?: Team }) {
  if (!team) return <div className="text-ink-400 italic text-sm">TBD</div>;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-lg leading-none">{team.flag}</span>
      <span className="font-semibold truncate">{team.name}</span>
    </div>
  );
}
