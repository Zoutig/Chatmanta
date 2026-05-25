// V0 eval relabel — past gerichte ideal_source_filenames-correcties toe op de
// live eval_questions-tabel vanuit eval-fixtures/label-corrections.json.
//
// Waarom dit naast eval:seed bestaat: eval:seed upsert't op (org_id, slug) vanuit
// de fixtures en raakt dus geen rijen die wél in de DB staan en geëvalueerd
// worden maar níét (meer) in een fixture voorkomen ('orphans', bv. dev-org
// vragen van vóór de slim-down). Die corrigeren we hier direct.
//
// Idempotent: een tweede run is een no-op (waarden zijn dan al gelijk).
// Niet-destructief: raakt alléén eval_questions.ideal_source_filenames, en
// alleen voor de slugs in de corrections-map. Geen LLM-calls, $0.
//
// Usage:
//   npm run eval:relabel            (past toe)
//   npm run eval:relabel -- --dry   (toont diff, schrijft niets)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ORG_SLUG_BY_ID: Readonly<Record<string, string>> = Object.freeze({
  '00000000-0000-0000-0000-0000000000d0': 'dev-org',
  '00000000-0000-0000-0000-0000000000a1': 'acme-corp',
  '00000000-0000-0000-0000-0000000000a2': 'globex-inc',
  '00000000-0000-0000-0000-0000000000a3': 'initech',
});
function orgSlug(id: string): string {
  return ORG_SLUG_BY_ID[id] ?? id.slice(-4);
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) fail('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

const dryRun = process.argv.includes('--dry');

function eqFilenames(a: string[] | null, b: string[]): boolean {
  const aa = a ?? [];
  if (aa.length !== b.length) return false;
  return aa.every((v, i) => v === b[i]);
}

async function main(): Promise<void> {
  const sb = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const path = resolve('eval-fixtures/label-corrections.json');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`Kon ${path} niet lezen/parsen: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Org-blokken = alle top-level keys behalve _meta en _legacy (die laatste is
  // een aparte slug-lijst die een tag zet, geen ideal_source_filenames-correctie).
  const orgIds = Object.keys(raw).filter((k) => k !== '_meta' && k !== '_legacy');
  let updated = 0;
  let unchanged = 0;
  let notFound = 0;
  let total = 0;

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Eval Relabel${dryRun ? '  (DRY RUN — schrijft niets)' : ''}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  for (const orgId of orgIds) {
    const block = raw[orgId];
    if (typeof block !== 'object' || block === null) {
      fail(`Org-blok ${orgId} is geen object`);
    }
    const corrections = block as Record<string, string[]>;
    for (const [slug, files] of Object.entries(corrections)) {
      total++;
      if (!Array.isArray(files) || !files.every((f) => typeof f === 'string')) {
        fail(`Correctie ${orgSlug(orgId)}/${slug} is geen string-array`);
      }

      const { data: rows, error: selErr } = await sb
        .from('eval_questions')
        .select('id, ideal_source_filenames')
        .eq('organization_id', orgId)
        .eq('slug', slug);
      if (selErr) fail(`select ${orgSlug(orgId)}/${slug}: ${selErr.message}`);

      if (!rows || rows.length === 0) {
        console.log(`  ⚠ niet gevonden: ${orgSlug(orgId)}/${slug} (geen rij in eval_questions)`);
        notFound++;
        continue;
      }

      for (const row of rows) {
        const current = (row.ideal_source_filenames as string[] | null) ?? null;
        if (eqFilenames(current, files)) {
          unchanged++;
          continue;
        }
        console.log(
          `  ${dryRun ? '→' : '✓'} ${orgSlug(orgId)}/${slug}: ` +
            `${JSON.stringify(current ?? [])} → ${JSON.stringify(files)}`,
        );
        if (!dryRun) {
          const { error: updErr } = await sb
            .from('eval_questions')
            .update({ ideal_source_filenames: files })
            .eq('id', row.id as string);
          if (updErr) fail(`update ${orgSlug(orgId)}/${slug}: ${updErr.message}`);
        }
        updated++;
      }
    }
  }

  // --- Legacy-tag pass --------------------------------------------------------
  // Markeert dev-org pre-slim-down cruft (off-topic / algemene-kennis /
  // multi-turn-baseline) met de 'legacy'-tag zodat reports + gate defaulten op
  // de active corpus. Idempotent; niet-destructief (rijen blijven staan, alleen
  // eval_questions.tags krijgt 'legacy' erbij). Zie _legacy in label-corrections.json.
  let tagged = 0;
  let tagUnchanged = 0;
  let tagNotFound = 0;
  const legacyBlock = raw['_legacy'];
  if (legacyBlock && typeof legacyBlock === 'object') {
    for (const [orgId, slugs] of Object.entries(legacyBlock as Record<string, unknown>)) {
      if (orgId === '_doc') continue;
      if (!Array.isArray(slugs) || !slugs.every((s) => typeof s === 'string')) {
        fail(`_legacy/${orgId} is geen string-array`);
      }
      for (const slug of slugs as string[]) {
        const { data: rows, error: selErr } = await sb
          .from('eval_questions')
          .select('id, tags')
          .eq('organization_id', orgId)
          .eq('slug', slug);
        if (selErr) fail(`legacy select ${orgSlug(orgId)}/${slug}: ${selErr.message}`);
        if (!rows || rows.length === 0) {
          console.log(`  ⚠ legacy niet gevonden: ${orgSlug(orgId)}/${slug} (geen rij in eval_questions)`);
          tagNotFound++;
          continue;
        }
        for (const row of rows) {
          const tags = (row.tags as string[] | null) ?? [];
          if (tags.includes('legacy')) {
            tagUnchanged++;
            continue;
          }
          const next = [...tags, 'legacy'];
          console.log(
            `  ${dryRun ? '→' : '✓'} legacy-tag ${orgSlug(orgId)}/${slug}: ` +
              `[${tags.join(', ')}] → [${next.join(', ')}]`,
          );
          if (!dryRun) {
            const { error: updErr } = await sb
              .from('eval_questions')
              .update({ tags: next })
              .eq('id', row.id as string);
            if (updErr) fail(`legacy update ${orgSlug(orgId)}/${slug}: ${updErr.message}`);
          }
          tagged++;
        }
      }
    }
  }

  console.log('');
  console.log('───────────────────────────────────────────────────────────');
  console.log(
    `${total} correcties · ${updated} ${dryRun ? 'zou wijzigen' : 'gewijzigd'} · ` +
      `${unchanged} al goed · ${notFound} niet gevonden`,
  );
  console.log(
    `legacy-tag: ${tagged} ${dryRun ? 'zou taggen' : 'getagd'} · ` +
      `${tagUnchanged} al legacy · ${tagNotFound} niet gevonden`,
  );
  if (dryRun) console.log('DRY RUN — niets geschreven. Run zonder --dry om toe te passen.');
  console.log('───────────────────────────────────────────────────────────');
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
