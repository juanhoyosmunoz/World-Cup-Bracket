// Seed the `teams` collection with the 48 nations from the 2026 FIFA World Cup
// official group draw (December 2025).
//
// Source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup (group stage tables)
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
//   FIREBASE_PROJECT_ID=<id> npm run seed:teams

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const f = (cc: string) =>
  cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)));

const TEAMS: { id: string; name: string; shortName: string; cc: string; group: string; flag?: string }[] = [
  // Group A
  { id: "MEX", name: "Mexico",             shortName: "MEX", cc: "mx", group: "A" },
  { id: "RSA", name: "South Africa",       shortName: "RSA", cc: "za", group: "A" },
  { id: "KOR", name: "South Korea",        shortName: "KOR", cc: "kr", group: "A" },
  { id: "CZE", name: "Czech Republic",     shortName: "CZE", cc: "cz", group: "A" },
  // Group B
  { id: "CAN", name: "Canada",             shortName: "CAN", cc: "ca", group: "B" },
  { id: "BIH", name: "Bosnia & Herzegovina", shortName: "BIH", cc: "ba", group: "B" },
  { id: "QAT", name: "Qatar",              shortName: "QAT", cc: "qa", group: "B" },
  { id: "SUI", name: "Switzerland",        shortName: "SUI", cc: "ch", group: "B" },
  // Group C
  { id: "BRA", name: "Brazil",             shortName: "BRA", cc: "br", group: "C" },
  { id: "MAR", name: "Morocco",            shortName: "MAR", cc: "ma", group: "C" },
  { id: "HAI", name: "Haiti",              shortName: "HAI", cc: "ht", group: "C" },
  { id: "SCO", name: "Scotland",           shortName: "SCO", cc: "gb", group: "C", flag: "🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}" },
  // Group D
  { id: "USA", name: "United States",      shortName: "USA", cc: "us", group: "D" },
  { id: "PAR", name: "Paraguay",           shortName: "PAR", cc: "py", group: "D" },
  { id: "AUS", name: "Australia",          shortName: "AUS", cc: "au", group: "D" },
  { id: "TUR", name: "Türkiye",            shortName: "TUR", cc: "tr", group: "D" },
  // Group E
  { id: "GER", name: "Germany",            shortName: "GER", cc: "de", group: "E" },
  { id: "CUW", name: "Curaçao",            shortName: "CUW", cc: "cw", group: "E" },
  { id: "CIV", name: "Ivory Coast",        shortName: "CIV", cc: "ci", group: "E" },
  { id: "ECU", name: "Ecuador",            shortName: "ECU", cc: "ec", group: "E" },
  // Group F
  { id: "NED", name: "Netherlands",        shortName: "NED", cc: "nl", group: "F" },
  { id: "JPN", name: "Japan",              shortName: "JPN", cc: "jp", group: "F" },
  { id: "SWE", name: "Sweden",             shortName: "SWE", cc: "se", group: "F" },
  { id: "TUN", name: "Tunisia",            shortName: "TUN", cc: "tn", group: "F" },
  // Group G
  { id: "BEL", name: "Belgium",            shortName: "BEL", cc: "be", group: "G" },
  { id: "EGY", name: "Egypt",              shortName: "EGY", cc: "eg", group: "G" },
  { id: "IRN", name: "Iran",               shortName: "IRN", cc: "ir", group: "G" },
  { id: "NZL", name: "New Zealand",        shortName: "NZL", cc: "nz", group: "G" },
  // Group H
  { id: "ESP", name: "Spain",              shortName: "ESP", cc: "es", group: "H" },
  { id: "CPV", name: "Cape Verde",         shortName: "CPV", cc: "cv", group: "H" },
  { id: "KSA", name: "Saudi Arabia",       shortName: "KSA", cc: "sa", group: "H" },
  { id: "URU", name: "Uruguay",            shortName: "URU", cc: "uy", group: "H" },
  // Group I
  { id: "FRA", name: "France",             shortName: "FRA", cc: "fr", group: "I" },
  { id: "SEN", name: "Senegal",            shortName: "SEN", cc: "sn", group: "I" },
  { id: "IRQ", name: "Iraq",               shortName: "IRQ", cc: "iq", group: "I" },
  { id: "NOR", name: "Norway",             shortName: "NOR", cc: "no", group: "I" },
  // Group J
  { id: "ARG", name: "Argentina",          shortName: "ARG", cc: "ar", group: "J" },
  { id: "ALG", name: "Algeria",            shortName: "ALG", cc: "dz", group: "J" },
  { id: "AUT", name: "Austria",            shortName: "AUT", cc: "at", group: "J" },
  { id: "JOR", name: "Jordan",             shortName: "JOR", cc: "jo", group: "J" },
  // Group K
  { id: "POR", name: "Portugal",           shortName: "POR", cc: "pt", group: "K" },
  { id: "COD", name: "DR Congo",           shortName: "COD", cc: "cd", group: "K" },
  { id: "UZB", name: "Uzbekistan",         shortName: "UZB", cc: "uz", group: "K" },
  { id: "COL", name: "Colombia",           shortName: "COL", cc: "co", group: "K" },
  // Group L
  { id: "ENG", name: "England",            shortName: "ENG", cc: "gb", group: "L", flag: "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}" },
  { id: "CRO", name: "Croatia",            shortName: "CRO", cc: "hr", group: "L" },
  { id: "GHA", name: "Ghana",              shortName: "GHA", cc: "gh", group: "L" },
  { id: "PAN", name: "Panama",             shortName: "PAN", cc: "pa", group: "L" },
];

async function main() {
  const batch = db.batch();
  for (const t of TEAMS) {
    batch.set(db.collection("teams").doc(t.id), {
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      flag: t.flag ?? f(t.cc),
      group: t.group ?? null,
    });
  }
  await batch.commit();
  console.log(`Seeded ${TEAMS.length} teams.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
