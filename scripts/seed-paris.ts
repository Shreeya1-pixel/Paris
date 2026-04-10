/**
 * Insert curated Paris places into `public.paris_places`.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (RLS has no public INSERT on paris_places).
 *
 * Usage:
 *   npx tsx scripts/seed-paris.ts
 *
 * Idempotency: deletes rows whose name matches this catalog, then inserts fresh
 * (avoids duplicate runs). Adjust if you have user-added places with same names.
 */

import { createClient } from "@supabase/supabase-js";
import {
  PARIS_PLACES_CATALOG,
  seedRowToSupabaseInsert,
} from "../lib/data/parisPlacesCatalog";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const names = PARIS_PLACES_CATALOG.map((r) => r.name);

  const { error: delErr } = await supabase.from("paris_places").delete().in("name", names);
  if (delErr) {
    console.warn("Delete step (optional):", delErr.message);
  }

  const rows = PARIS_PLACES_CATALOG.map(seedRowToSupabaseInsert);
  const { data, error } = await supabase.from("paris_places").insert(rows).select("id, name");

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log(`Inserted ${data?.length ?? rows.length} rows into paris_places.`);
}

main();
