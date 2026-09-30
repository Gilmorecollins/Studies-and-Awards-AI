// Links the Studies and Awards partner list (from the website project) to the
// CRICOS institutions in the database.
//
//   npm run link:partners -- --suggest   add new partner names to
//                                        data/partner-links.json, with the
//                                        closest CRICOS providers, for review
//   npm run link:partners -- --dry-run   check the links file; save nothing
//   npm run link:partners                save the linked partners
//
// data/partner-links.json is the reviewed record of which provider(s) each
// partner name means. Each entry has a status: "linked" (saved), "review" (not
// decided yet, not saved) or "not_on_cricos" (no registered provider, not
// saved). Edit it by hand; --suggest only ever adds names it has not seen.
//
// The partner list path defaults to the website project next to this one; set
// PARTNER_LIST_PATH to use another copy. Needs NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SECRET_KEY in .env.local.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { connect, selectAll, upsert } from "./lib/supabase.mts";

const PARTNER_LIST_PATH =
  process.env.PARTNER_LIST_PATH ?? "../Studies-and-Awards-Limited/tools/data/partner-institutions.json";
const LINKS_PATH = "data/partner-links.json";
const SOURCE = "Studies and Awards partner list: tools/data/partner-institutions.json in the Studies-and-Awards-Limited website project";
const COUNTRY = "Australia";

// Partner list cities -> the state their campuses are in.
const CITY_STATES: Record<string, string> = {
  Adelaide: "SA",
  Brisbane: "QLD",
  Canberra: "ACT",
  Darwin: "NT",
  Hobart: "TAS",
  Melbourne: "VIC",
  Perth: "WA",
  Sydney: "NSW",
};

type Status = "linked" | "review" | "not_on_cricos";
type Provider = { code: string; name: string };
type Suggestion = Provider & { trading_names: string | null; states: string[]; score: number };
type LinkEntry = {
  name: string;
  status: Status;
  providers: Provider[];
  note?: string;
  suggestions?: Suggestion[];
};
type LinksFile = { _about: string; partners: LinkEntry[] };
type Partner = { name: string; cities: string[]; courses: string[] };
type Institution = {
  id: string;
  cricos_provider_code: string;
  name: string;
  trading_names: string | null;
  is_partner: boolean;
};

const suggest = process.argv.includes("--suggest");
const dryRun = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Read the partner list and the links file
// ---------------------------------------------------------------------------

// One entry per partner name, with every city it is listed under and all its
// courses (in list order, without repeats).
function readPartners(): Partner[] {
  const list = JSON.parse(readFileSync(PARTNER_LIST_PATH, "utf8"));
  const cities: Record<string, { name: string; courses: string[] }[]> = list.countries?.[COUNTRY];
  if (!cities) throw new Error(`${PARTNER_LIST_PATH} has no ${COUNTRY} section.`);

  const partners = new Map<string, Partner>();
  for (const [city, entries] of Object.entries(cities)) {
    for (const entry of entries) {
      const partner = partners.get(entry.name) ?? { name: entry.name, cities: [], courses: [] };
      partner.cities.push(city);
      for (const course of entry.courses) if (!partner.courses.includes(course)) partner.courses.push(course);
      partners.set(entry.name, partner);
    }
  }
  return [...partners.values()];
}

function readLinks(): LinksFile {
  if (!existsSync(LINKS_PATH)) {
    return {
      _about:
        "Which CRICOS provider(s) each name on the Studies and Awards partner list means. status: linked (saved to the database), review (not decided) or not_on_cricos (no registered provider). Written by npm run link:partners -- --suggest, then reviewed by hand.",
      partners: [],
    };
  }
  return JSON.parse(readFileSync(LINKS_PATH, "utf8"));
}

function writeLinks(links: LinksFile) {
  links.partners.sort((a, b) => a.name.localeCompare(b.name, "en"));
  mkdirSync(dirname(LINKS_PATH), { recursive: true });
  writeFileSync(LINKS_PATH, `${JSON.stringify(links, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Suggestions: score every provider against a partner name
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "the", "of", "and", "pty", "ltd", "limited", "inc", "incorporated", "trust", "trustee",
  "for", "as", "australia", "australian", "college", "institute",
]);

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']s\b/g, "")
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value: string): string[] {
  return normalise(value).split(" ").filter((word) => word && !STOP_WORDS.has(word));
}

// "Australian Technical College (ATC)" -> ["atc"]
function acronyms(value: string): string[] {
  return [...value.matchAll(/\(([A-Za-z]{2,6})\)/g)].map((match) => match[1].toLowerCase());
}

function score(partner: Partner, institution: Institution, states: Set<string>): number {
  const names = [institution.name, ...(institution.trading_names ?? "").split(/[,;/]/)]
    .map(normalise)
    .filter(Boolean);
  const partnerName = normalise(partner.name);
  const partnerWords = words(partner.name);
  const candidateWords = new Set(names.flatMap((name) => name.split(" ")));
  const candidateText = ` ${names.join(" | ")} `;

  let total = 0;
  if (names.some((name) => name === partnerName || name.replace(/ pty ltd$| ltd$/, "") === partnerName)) total += 10;
  else if (partnerName.length > 3 && candidateText.includes(` ${partnerName} `)) total += 5;
  if (partnerWords.length) {
    total += (4 * partnerWords.filter((word) => candidateWords.has(word)).length) / partnerWords.length;
  }
  total -= 0.05 * Math.max(0, words(institution.name).length - partnerWords.length);
  if (acronyms(partner.name).some((acronym) => candidateWords.has(acronym))) total += 1;
  if (partner.cities.some((city) => states.has(CITY_STATES[city]))) total += 1;
  return Math.round(total * 10) / 10;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const supabase = connect("they are needed to read the CRICOS institutions");
const partners = readPartners();
const links = readLinks();
const institutions = await selectAll<Institution>(
  supabase,
  "institutions",
  "id, cricos_provider_code, name, trading_names, is_partner",
  ["id"],
);
const byCode = new Map(institutions.map((institution) => [institution.cricos_provider_code, institution]));
const entries = new Map(links.partners.map((entry) => [entry.name, entry]));
const listed = new Set(partners.map((partner) => partner.name));

console.log(`Partner list: ${partners.length} ${COUNTRY} names (${PARTNER_LIST_PATH})`);
console.log(`Links file: ${links.partners.length} names (${LINKS_PATH})`);

const gone = links.partners.filter((entry) => !listed.has(entry.name));
if (gone.length) {
  console.log(`No longer on the partner list (they will not be saved; remove them from ${LINKS_PATH}):`);
  for (const entry of gone) console.log(`  ${entry.name}`);
}

if (suggest) {
  const statesByInstitution = new Map<string, Set<string>>();
  for (const campus of await selectAll<{ institution_id: string; state: string | null }>(
    supabase,
    "campuses",
    "institution_id, state",
    ["id"],
  )) {
    if (!campus.state) continue;
    const states = statesByInstitution.get(campus.institution_id) ?? new Set<string>();
    states.add(campus.state);
    statesByInstitution.set(campus.institution_id, states);
  }

  const added = partners.filter((partner) => !entries.has(partner.name));
  for (const partner of added) {
    const suggestions = institutions
      .map((institution) => {
        const states = statesByInstitution.get(institution.id) ?? new Set<string>();
        return {
          code: institution.cricos_provider_code,
          name: institution.name,
          trading_names: institution.trading_names,
          states: [...states].sort(),
          score: score(partner, institution, states),
        };
      })
      .filter((suggestion) => suggestion.score > 1)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    links.partners.push({ name: partner.name, status: "review", providers: [], suggestions });
  }
  writeLinks(links);
  console.log(`Added ${added.length} names to review in ${LINKS_PATH}.`);
  process.exit(0);
}

// Check the links file before saving anything.
const problems: string[] = [];
for (const entry of links.partners) {
  if (!["linked", "review", "not_on_cricos"].includes(entry.status)) {
    problems.push(`${entry.name}: unknown status "${entry.status}"`);
  }
  if (entry.status === "linked" && entry.providers.length === 0) problems.push(`${entry.name}: linked but no providers`);
  for (const provider of entry.providers) {
    if (!byCode.has(provider.code)) problems.push(`${entry.name}: provider ${provider.code} is not in the database`);
  }
}
if (problems.length) {
  console.error(`Fix these in ${LINKS_PATH} first:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const count = (status: Status) => partners.filter((partner) => entries.get(partner.name)?.status === status).length;
const missing = partners.filter((partner) => !entries.has(partner.name));
console.log(
  `Linked ${count("linked")}, not on CRICOS ${count("not_on_cricos")}, to review ${count("review")}, not in the links file ${missing.length}${missing.length ? " (run with --suggest)" : ""}`,
);

const rows = partners.flatMap((partner) => {
  const entry = entries.get(partner.name);
  if (entry?.status !== "linked") return [];
  return entry.providers.map((provider) => ({
    institution_id: byCode.get(provider.code)!.id,
    partner_name: partner.name,
    cities: partner.cities,
    listed_courses: partner.courses,
    source: SOURCE,
  }));
});
const partnerIds = new Set(rows.map((row) => row.institution_id));
const flagOn = institutions.filter((institution) => partnerIds.has(institution.id) && !institution.is_partner);
const flagOff = institutions.filter((institution) => !partnerIds.has(institution.id) && institution.is_partner);
console.log(`Partner links: ${rows.length}, covering ${partnerIds.size} institutions`);
console.log(`Institutions to mark as partners: ${flagOn.length}; to unmark: ${flagOff.length}`);

if (dryRun) {
  console.log("Dry run: nothing saved.");
  process.exit(0);
}

await upsert(supabase, "partner_institutions", rows, "institution_id,partner_name", "institution_id");

// Remove links the file no longer has.
const current = new Set(rows.map((row) => `${row.institution_id}|${row.partner_name}`));
const stale = (
  await selectAll<{ institution_id: string; partner_name: string }>(
    supabase,
    "partner_institutions",
    "institution_id, partner_name",
    ["institution_id", "partner_name"],
  )
).filter((row) => !current.has(`${row.institution_id}|${row.partner_name}`));
for (const row of stale) {
  const { error } = await supabase
    .from("partner_institutions")
    .delete()
    .eq("institution_id", row.institution_id)
    .eq("partner_name", row.partner_name);
  if (error) throw new Error(`Removing partner links failed: ${error.message}`);
}

for (const [ids, value] of [
  [flagOn.map((institution) => institution.id), true],
  [flagOff.map((institution) => institution.id), false],
] as const) {
  if (!ids.length) continue;
  const { error } = await supabase.from("institutions").update({ is_partner: value }).in("id", ids);
  if (error) throw new Error(`Updating is_partner failed: ${error.message}`);
}
console.log(`Saved ${rows.length} partner links; removed ${stale.length}. Marked ${flagOn.length} partners, unmarked ${flagOff.length}.`);
