// Imports the CRICOS register (every provider, campus and course registered to
// teach international students in Australia) into the catalogue tables.
//
//   npm run import:cricos               download the register and save it
//   npm run import:cricos -- --dry-run  download and check it; write nothing
//
// Saving needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
// The secret key bypasses row level security, so only run this on a trusted
// machine. Safe to re-run: rows are matched on CRICOS codes and updated in
// place, and courses that leave the register are marked inactive, not deleted.

import { createClient } from "@supabase/supabase-js";

type Row = Record<string, string>;

const DATASET_URL = "https://data.gov.au/data/dataset/cricos";
const RESOURCE_URL =
  "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/resource";
const FILES = {
  institutions: "7f6941f3-5327-4db7-b556-5f16d77f63c1/download/cricos-institutions.csv",
  locations: "45d29535-1360-4486-8242-3850e61b5524/download/cricos-locations.csv",
  courses: "48cacf69-2082-415e-9595-f17d0c3a4af0/download/cricos-courses.csv",
  courseLocations: "4cd2de02-8ba3-4eb2-bac2-fe272cae3f5f/download/cricos-course-locations.csv",
};
const BATCH_SIZE = 1000;

const AU_STATES = new Set(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]);

const COURSE_LEVELS: Record<string, string> = {
  "Primary School Studies": "school",
  "Junior Secondary Studies": "school",
  "Senior Secondary Certificate of Education": "school",
  "Certificate I": "certificate_i",
  "Certificate II": "certificate_ii",
  "Certificate III": "certificate_iii",
  "Certificate IV": "certificate_iv",
  Diploma: "diploma",
  "Advanced Diploma": "advanced_diploma",
  "Associate Degree": "associate_degree",
  "Bachelor Degree": "bachelor",
  "Bachelor Honours Degree": "bachelor_honours",
  "Graduate Certificate": "graduate_certificate",
  "Graduate Diploma": "graduate_diploma",
  "Masters Degree (Coursework)": "masters_coursework",
  "Masters Degree (Research)": "masters_research",
  "Masters Degree (Extended)": "masters_extended",
  "Doctoral Degree": "doctorate",
  "Vocational Short Course": "other",
};

const HIGHER_ED_LEVELS = new Set([
  "associate_degree",
  "bachelor",
  "bachelor_honours",
  "graduate_certificate",
  "graduate_diploma",
  "masters_coursework",
  "masters_research",
  "masters_extended",
  "doctorate",
]);

const dryRun = process.argv.includes("--dry-run");
const now = new Date().toISOString();

// ---------------------------------------------------------------------------
// Download and parse
// ---------------------------------------------------------------------------

// data.gov.au can be slow to answer, so a failed download is tried again twice.
async function download(path: string): Promise<Row[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${RESOURCE_URL}/${path}`);
      if (!response.ok) throw new Error(`Download failed (${response.status}): ${path}`);
      return parseCsv(await response.text());
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`Download failed (${(error as Error).message}), trying again: ${path}`);
      await new Promise((resolve) => setTimeout(resolve, 5000 * attempt));
    }
  }
}

// CRICOS files are plain RFC 4180 CSV with a byte order mark and blank rows at
// the end.
function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field || record.length) records.push([...record, field]);

  const [header, ...rest] = records;
  const names = header.map((name) => name.replace(/^﻿/, "").trim());
  return rest
    .filter((values) => values[0]?.trim())
    .map((values) => Object.fromEntries(names.map((name, i) => [name, clean(values[i])])));
}

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Map CRICOS values onto the schema
// ---------------------------------------------------------------------------

function money(value: string): number | null {
  return value ? Number(value.replace(/[$,]/g, "")) : null;
}

// "090501 - Social Work" -> ["090501", "Social Work"]
function fieldOfEducation(value: string): [string, string] | null {
  const match = value.match(/^(\d{2}|\d{4}|\d{6}) - (.+)$/);
  return match ? [match[1], match[2]] : null;
}

function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s\-'])\p{L}/gu, (letter) => letter.toUpperCase());
}

function websiteUrl(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).href;
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isElicos(course: Row): boolean {
  return course["Field of Education 1 Detailed Field"].startsWith("091501");
}

function courseLevel(course: Row): string {
  if (course["Course Level"] === "Non AQF Award") {
    if (course["Foundation Studies"] === "Yes") return "foundation";
    return isElicos(course) ? "english_language" : "other";
  }
  return COURSE_LEVELS[course["Course Level"]] ?? "other";
}

function isVet(course: Row): boolean {
  return Boolean(course["VET National Code"]) || /^Certificate|^Vocational/.test(course["Course Level"]);
}

function isHigherEd(course: Row): boolean {
  const level = courseLevel(course);
  return (
    HIGHER_ED_LEVELS.has(level) ||
    ((level === "diploma" || level === "advanced_diploma") && !course["VET National Code"])
  );
}

// CRICOS only says whether a provider is "Government" or "Private", so the
// type is worked out from its name and the courses it offers. Checked against
// the register (September 2026): this finds every Australian university, RMIT
// and the merged Adelaide University included, as 44 registrations. Victoria
// University and Southern Queensland each hold a second one for campuses in
// other states.
function providerType(institution: Row, courses: Row[]): string | null {
  if (courses.length === 0) return null;
  const government = institution["Institution Type"] === "Government";
  const name = institution["Institution Name"];
  const offersDoctorate = courses.some((course) => courseLevel(course) === "doctorate");

  if (
    (government && (offersDoctorate || /\bUniversity\b/.test(name))) ||
    (offersDoctorate && /\bUniversity\b/.test(name) && !/\bCollege\b/.test(name))
  ) {
    return "university";
  }
  if (courses.filter((course) => courseLevel(course) === "school").length > courses.length / 2) {
    return "school";
  }
  if (government) return courses.some(isVet) ? "tafe" : "other";
  if (courses.some(isHigherEd)) return "private_higher_education";
  if (courses.some(isVet)) return "private_vet";
  if (courses.every(isElicos)) return "english_language";
  return "other";
}

function tradingNames(value: string): string | null {
  return /^(n\/?a|-)?$/i.test(value) ? null : value;
}

// Campuses are matched on provider, name and city (see the migration).
function campusKey(providerCode: string, name: string, city: string): string {
  return [providerCode, name, city.toUpperCase()].join("|");
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

function connect() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local (or use --dry-run).",
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type Client = ReturnType<typeof connect>;

async function upsert<T>(
  supabase: Client,
  table: string,
  rows: object[],
  onConflict: string,
  columns: string,
): Promise<T[]> {
  const saved: T[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + BATCH_SIZE), { onConflict })
      .select(columns);
    if (error) throw new Error(`Saving ${table} failed: ${error.message}`);
    saved.push(...(data as T[]));
  }
  return saved;
}

async function selectAll<T>(
  supabase: Client,
  table: string,
  columns: string,
  orderBy: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    let query = supabase.from(table).select(columns);
    for (const column of orderBy) query = query.order(column);
    const { data, error } = await query.range(from, from + BATCH_SIZE - 1);
    if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < BATCH_SIZE) return rows;
  }
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

console.log(`Downloading CRICOS from ${DATASET_URL} ...`);
const [institutionRows, locationRows, courseRows, courseLocationRows] = await Promise.all([
  download(FILES.institutions),
  download(FILES.locations),
  download(FILES.courses),
  download(FILES.courseLocations),
]);

const institutionsByCode = new Map(
  institutionRows.map((row) => [row["CRICOS Provider Code"], row]),
);
const coursesByProvider = new Map<string, Row[]>();
for (const course of courseRows) {
  const code = course["CRICOS Provider Code"];
  if (!coursesByProvider.has(code)) coursesByProvider.set(code, []);
  coursesByProvider.get(code)?.push(course);
}

const institutions = [...institutionsByCode.values()].map((row) => {
  const code = row["CRICOS Provider Code"];
  return {
    cricos_provider_code: code,
    name: row["Institution Name"],
    slug: `${slugify(row["Institution Name"])}-${code.toLowerCase()}`,
    trading_names: tradingNames(row["Trading Name"]),
    provider_type: providerType(row, coursesByProvider.get(code) ?? []),
  };
});

// A few locations leave out the city and state; fall back to the provider's
// postal address so the campus can still be saved.
function locationCity(providerCode: string, city: string): string {
  return titleCase(city || (institutionsByCode.get(providerCode)?.["Postal Address City"] ?? ""));
}

const campuses = new Map<string, { providerCode: string; row: Record<string, string | null> }>();
for (const location of locationRows) {
  const providerCode = location["CRICOS Provider Code"];
  const institution = institutionsByCode.get(providerCode);
  if (!institution) continue;
  const city = locationCity(providerCode, location["City"]);
  const state = location["State"] || institution["Postal Address State"];
  const key = campusKey(providerCode, location["Location Name"], city);
  if (campuses.has(key)) continue;
  campuses.set(key, {
    providerCode,
    row: {
      name: location["Location Name"],
      city,
      state: AU_STATES.has(state) ? state : null,
      address: ["Address Line 1", "Address Line 2", "Address Line 3", "Address Line 4"]
        .map((column) => location[column])
        .filter(Boolean)
        .join(", ") || null,
      postcode: location["Postcode"] || null,
    },
  });
}

const fields = new Map<string, string>();
const courses = courseRows
  .filter((row) => institutionsByCode.has(row["CRICOS Provider Code"]))
  .map((row) => {
    const codes = new Set<string>();
    for (const n of [1, 2]) {
      for (const depth of ["Broad", "Narrow", "Detailed"]) {
        const field = fieldOfEducation(row[`Field of Education ${n} ${depth} Field`]);
        if (!field) continue;
        codes.add(field[0]);
        fields.set(field[0], field[1]);
      }
    }
    const weeks = Number(row["Duration (Weeks)"]);
    return {
      providerCode: row["CRICOS Provider Code"],
      row: {
        cricos_course_code: row["CRICOS Course Code"],
        name: row["Course Name"],
        level: courseLevel(row),
        field_of_study: fieldOfEducation(row["Field of Education 1 Narrow Field"])?.[1] ?? null,
        field_of_education_codes: [...codes].sort(),
        vet_national_code: row["VET National Code"] || null,
        teaching_language: row["Course Language"] || null,
        has_work_component: row["Work Component"] ? row["Work Component"] === "Yes" : null,
        duration_weeks: weeks > 0 ? weeks : null,
        total_tuition_aud: money(row["Tuition Fee"]),
        estimated_total_cost_aud: money(row["Estimated Total Course Cost"]),
        is_active: row["Expired"] !== "Yes",
        source_url: DATASET_URL,
        last_checked: now,
      },
    };
  });

const courseLinks = new Map<string, { courseCode: string; campus: string }>();
let unmatchedLinks = 0;
for (const link of courseLocationRows) {
  const providerCode = link["CRICOS Provider Code"];
  const campus = campusKey(providerCode, link["Location Name"], locationCity(providerCode, link["Location City"]));
  if (!campuses.has(campus)) {
    unmatchedLinks++;
    continue;
  }
  courseLinks.set(`${link["CRICOS Course Code"]}|${campus}`, { courseCode: link["CRICOS Course Code"], campus });
}

function tally(values: (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value ?? "unknown", (counts.get(value ?? "unknown") ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([value, count]) => `${value} ${count}`).join(", ");
}

console.log(`Institutions: ${institutions.length}`);
console.log(`  by type: ${tally(institutions.map((row) => row.provider_type))}`);
console.log(`Campuses: ${campuses.size}`);
console.log(`Courses: ${courses.length} (${courses.filter((course) => !course.row.is_active).length} expired)`);
console.log(`  by level: ${tally(courses.map((course) => course.row.level))}`);
console.log(`Course-campus links: ${courseLinks.size}${unmatchedLinks ? ` (${unmatchedLinks} with no matching campus, skipped)` : ""}`);
console.log(`Fields of education: ${fields.size}`);

if (dryRun) {
  console.log("Dry run: nothing saved.");
  process.exit(0);
}

const supabase = connect();

await upsert(
  supabase,
  "fields_of_education",
  [...fields].map(([code, name]) => ({ code, name })),
  "code",
  "code",
);

// CRICOS fills in the website only for new institutions; after that staff own
// it, so a corrected address is not overwritten by the next import.
const existingCodes = new Set(
  (
    await selectAll<{ cricos_provider_code: string | null }>(
      supabase,
      "institutions",
      "cricos_provider_code",
      ["id"],
    )
  ).map((row) => row.cricos_provider_code),
);
const newInstitutions = institutions.filter((row) => !existingCodes.has(row.cricos_provider_code));
const savedInstitutions = [
  ...(await upsert<{ id: string; cricos_provider_code: string }>(
    supabase,
    "institutions",
    newInstitutions.map((row) => ({
      ...row,
      website_url: websiteUrl(institutionsByCode.get(row.cricos_provider_code)?.["Website"] ?? ""),
    })),
    "cricos_provider_code",
    "id, cricos_provider_code",
  )),
  ...(await upsert<{ id: string; cricos_provider_code: string }>(
    supabase,
    "institutions",
    institutions.filter((row) => existingCodes.has(row.cricos_provider_code)),
    "cricos_provider_code",
    "id, cricos_provider_code",
  )),
];
const institutionIds = new Map(savedInstitutions.map((row) => [row.cricos_provider_code, row.id]));
console.log(`Saved ${savedInstitutions.length} institutions (${newInstitutions.length} new).`);

const providerCodes = new Map(savedInstitutions.map((row) => [row.id, row.cricos_provider_code]));
const savedCampuses = await upsert<{ id: string; institution_id: string; name: string; city: string }>(
  supabase,
  "campuses",
  [...campuses.values()].map((campus) => ({
    institution_id: institutionIds.get(campus.providerCode),
    ...campus.row,
  })),
  "institution_id,name,city",
  "id, institution_id, name, city",
);
const campusIds = new Map(
  savedCampuses.map((row) => [
    campusKey(providerCodes.get(row.institution_id) ?? "", row.name, row.city),
    row.id,
  ]),
);
console.log(`Saved ${savedCampuses.length} campuses.`);

const savedCourses = await upsert<{ id: string; cricos_course_code: string }>(
  supabase,
  "courses",
  courses.map((course) => ({
    institution_id: institutionIds.get(course.providerCode),
    ...course.row,
  })),
  "cricos_course_code",
  "id, cricos_course_code",
);
const courseIds = new Map(savedCourses.map((row) => [row.cricos_course_code, row.id]));
console.log(`Saved ${savedCourses.length} courses.`);

// Courses that have left the register stay in the database (assessments may
// point at them) but are marked inactive.
const dropped = (
  await selectAll<{ id: string; cricos_course_code: string | null; is_active: boolean }>(
    supabase,
    "courses",
    "id, cricos_course_code, is_active",
    ["id"],
  )
).filter((row) => row.cricos_course_code && row.is_active && !courseIds.has(row.cricos_course_code));
for (let i = 0; i < dropped.length; i += BATCH_SIZE) {
  const { error } = await supabase
    .from("courses")
    .update({ is_active: false })
    .in("id", dropped.slice(i, i + BATCH_SIZE).map((row) => row.id));
  if (error) throw new Error(`Marking courses inactive failed: ${error.message}`);
}
console.log(`Marked ${dropped.length} courses no longer on CRICOS as inactive.`);

const links = [...courseLinks.values()].flatMap(({ courseCode, campus }) => {
  const course_id = courseIds.get(courseCode);
  const campus_id = campusIds.get(campus);
  return course_id && campus_id ? [{ course_id, campus_id }] : [];
});
await upsert(supabase, "course_campuses", links, "course_id,campus_id", "course_id");

// Remove links CRICOS no longer lists, for CRICOS courses only.
const currentLinks = new Set(links.map((link) => `${link.course_id}|${link.campus_id}`));
const cricosCourseIds = new Set(courseIds.values());
const staleLinks = (
  await selectAll<{ course_id: string; campus_id: string }>(
    supabase,
    "course_campuses",
    "course_id, campus_id",
    ["course_id", "campus_id"],
  )
).filter(
  (link) => cricosCourseIds.has(link.course_id) && !currentLinks.has(`${link.course_id}|${link.campus_id}`),
);
for (const link of staleLinks) {
  const { error } = await supabase
    .from("course_campuses")
    .delete()
    .eq("course_id", link.course_id)
    .eq("campus_id", link.campus_id);
  if (error) throw new Error(`Removing course-campus links failed: ${error.message}`);
}
console.log(`Saved ${links.length} course-campus links; removed ${staleLinks.length}.`);
console.log("CRICOS import finished.");
