// Supabase helpers shared by the scripts in this folder. They use the secret
// key, which bypasses row level security, so only run the scripts on a trusted
// machine.

import { createClient } from "@supabase/supabase-js";

export const BATCH_SIZE = 1000;

export function connect(purpose: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local (${purpose}).`);
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Client = ReturnType<typeof connect>;

export async function upsert<T>(
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

export async function selectAll<T>(
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
