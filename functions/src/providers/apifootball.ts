// API-FOOTBALL provider implementation.
//
// Docs: https://www.api-football.com/documentation-v3
// Endpoints used:
//   GET /teams?league={id}&season={year}
//   GET /fixtures?league={id}&season={year}
//
// Stage / bracket-slot mapping for the World Cup 2026:
//   API "round" field looks like:
//     "Group Stage - 1", "Round of 32", "Round of 16",
//     "Quarter-finals", "Semi-finals", "3rd Place Final", "Final"
//   We map round + chronological order to our bracket slots
//   (R32-1..R32-16, R16-1..R16-8, QF-1..QF-4, SF-1..SF-2, THIRD, FINAL).
//
// IMPORTANT: actual round labels can shift between API versions. After running
// `syncFixtures` once, eyeball the Admin → Results tab and adjust the mapping
// here if any fixtures land in the wrong slot.

import axios from "axios";
import type { FixtureProvider, NormalizedFixture, NormalizedTeam } from "./types";

const BASE = "https://v3.football.api-sports.io";

interface Options {
  apiKey: string;
  leagueId: number;
  season: number;
}

export function apiFootballProvider(opts: Options): FixtureProvider {
  const client = axios.create({
    baseURL: BASE,
    headers: { "x-apisports-key": opts.apiKey },
    timeout: 15_000,
  });

  return {
    name: "api-football",

    async fetchTeams(): Promise<NormalizedTeam[]> {
      const { data } = await client.get("/teams", {
        params: { league: opts.leagueId, season: opts.season },
      });
      const items: any[] = data?.response ?? [];
      return items.map((it) => ({
        id: String(it.team.id),
        name: it.team.name,
        shortName: it.team.code ?? it.team.name.slice(0, 3).toUpperCase(),
        flag: it.team.logo ?? "",
      }));
    },

    async fetchFixtures(): Promise<NormalizedFixture[]> {
      const { data } = await client.get("/fixtures", {
        params: { league: opts.leagueId, season: opts.season },
      });
      const items: any[] = data?.response ?? [];
      // Sort chronologically so slot indices are deterministic per round.
      items.sort((a, b) => new Date(a.fixture.date).getTime() - new Date(b.fixture.date).getTime());

      const counters: Record<string, number> = {};
      function nextSlot(stage: string): string {
        counters[stage] = (counters[stage] ?? 0) + 1;
        if (stage === "FINAL" || stage === "THIRD") return stage;
        return `${stage}-${counters[stage]}`;
      }

      const out: NormalizedFixture[] = [];
      for (const it of items) {
        const round: string = it.league?.round ?? "";
        const stage = mapStage(round);
        const slot = stage === "GROUP" ? undefined : nextSlot(stage);

        const status = mapStatus(it.fixture?.status?.short ?? "NS");
        const homeId = it.teams?.home?.id ? String(it.teams.home.id) : null;
        const awayId = it.teams?.away?.id ? String(it.teams.away.id) : null;

        out.push({
          externalId: String(it.fixture.id),
          stage,
          group: stage === "GROUP" ? extractGroupLetter(round) : undefined,
          bracketSlot: slot,
          homeTeamId: homeId,
          awayTeamId: awayId,
          kickoffISO: it.fixture.date,
          venue: it.fixture?.venue?.name ?? undefined,
          status,
          homeGoals: it.goals?.home ?? undefined,
          awayGoals: it.goals?.away ?? undefined,
        });
      }
      return out;
    },
  };
}

function mapStage(round: string): NormalizedFixture["stage"] {
  const r = round.toLowerCase();
  if (r.includes("group")) return "GROUP";
  if (r.includes("round of 32")) return "R32";
  if (r.includes("round of 16")) return "R16";
  if (r.includes("quarter")) return "QF";
  if (r.includes("semi")) return "SF";
  if (r.includes("3rd") || r.includes("third")) return "THIRD";
  if (r.includes("final")) return "FINAL";
  return "GROUP";
}

function extractGroupLetter(round: string): string | undefined {
  // "Group Stage - 1" doesn't include the letter; API also returns groups via /standings.
  // Leave undefined here and let the seed script or admin set group letters from the teams response.
  const m = round.match(/Group ([A-L])/i);
  return m?.[1];
}

function mapStatus(s: string): NormalizedFixture["status"] {
  if (["FT", "AET", "PEN"].includes(s)) return "FINISHED";
  if (["1H", "HT", "2H", "ET", "P", "LIVE"].includes(s)) return "LIVE";
  if (["PST", "CANC", "ABD", "AWD", "WO"].includes(s)) return "POSTPONED";
  return "SCHEDULED";
}
