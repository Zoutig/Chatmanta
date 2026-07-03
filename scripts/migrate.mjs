// V0 migration runner — voert SQL-bestanden in supabase/migrations/ uit tegen
// Postgres via een directe connection (vereist DATABASE_URL).
//
// Houdt bij welke migrations al gedraaid zijn in public._migrations zodat
// herhaalde runs alleen nieuwe migrations toepassen.
//
// Modes:
//   npm run migrate              → voer alle pending migrations uit
//   npm run migrate:status       → toon welke gedraaid zijn / pending
//   npm run migrate:bootstrap    → markeer ALLE bestaande migrations als
//                                  applied ZONDER te runnen (eenmalig op
//                                  een database waar 0001-N al handmatig
//                                  zijn toegepast)
//
// DATABASE_URL: te vinden in Supabase dashboard → Project Settings →
// Database → Connection string → URI mode. Format:
//   postgresql://postgres.<ref>:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
// of de directe variant op port 5432.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

// Content-vingerafdruk van een migratiebestand — basis voor drift-detectie.
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Doel-selectie. Default = V0 (`npm run migrate` draait byte-voor-byte als
// voorheen). Met `--v1` (zie `migrate:v1` in package.json) draait hij tegen de
// V1-stroom: supabase/migrations-v1/ + V1_DATABASE_URL. MIGRATE_DIR/MIGRATE_DB_URL
// overriden beide expliciet als je een ander doel wilt.
const isV1 = process.argv.includes('--v1');
const url =
  process.env.MIGRATE_DB_URL ||
  (isV1 ? process.env.V1_DATABASE_URL : process.env.DATABASE_URL);
if (!url) {
  const want = isV1 ? 'V1_DATABASE_URL' : 'DATABASE_URL';
  console.error(`✗ ${want} (of MIGRATE_DB_URL) ontbreekt in env.`);
  console.error('  Voeg toe aan .env.local — zie Supabase dashboard → Database → Connection string.');
  process.exit(1);
}

const mode = process.argv[2] === 'status'
  ? 'status'
  : process.argv[2] === 'bootstrap'
    ? 'bootstrap'
    : 'apply';

const migrationsDir = resolve(
  process.env.MIGRATE_DIR || (isV1 ? 'supabase/migrations-v1' : 'supabase/migrations'),
);
const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

if (files.length === 0) {
  console.log('(geen .sql bestanden in supabase/migrations/)');
  process.exit(0);
}

const client = new pg.Client({
  connectionString: url,
  // Supabase pooled connection requires SSL but cert is signed by their CA;
  // rejectUnauthorized false is safe here (we know we're talking to Supabase).
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
} catch (err) {
  console.error(`✗ Kan niet verbinden met database: ${err.message}`);
  console.error('  Controleer DATABASE_URL — wachtwoord, host, project-ref.');
  process.exit(1);
}

// Tracking-tabel — meta-laag (zoals pgmigrations / flyway_schema_history), geen
// org_id. RLS staat AAN zonder policies: anon/authenticated zien niets, de runner
// (owner-connection) en service-role bypassen RLS toch. Voorkomt de Supabase
// "RLS disabled in public"-advisor op een productieproject. Idempotent.
await client.query(`
  create table if not exists public._migrations (
    id          text        primary key,
    applied_at  timestamptz not null default now()
  );
  alter table public._migrations enable row level security;
`);
// checksum-kolom voor drift-detectie — additief, idempotent (rijen van vóór
// deze hardening houden checksum null en worden hieronder ge-backfilled).
await client.query(`
  alter table public._migrations add column if not exists checksum text;
`);

const { rows: applied } = await client.query(
  'select id, checksum from public._migrations order by id',
);
const appliedIds = new Set(applied.map((r) => r.id));
const pending = files.filter((f) => !appliedIds.has(f.replace(/\.sql$/, '')));

// --- Drift-detectie -------------------------------------------------------
// Vergelijk voor elke reeds-toegepaste migratie waarvan we nog een lokaal
// bestand hebben de opgeslagen checksum met de huidige file-hash. Een gemergde
// migratie is onveranderlijk; wie er achteraf in wijzigt krijgt hier een harde
// stop (verse DB draait de wijziging wél, bestaande DB niet → schema-divergentie).
const fileById = new Map(files.map((f) => [f.replace(/\.sql$/, ''), f]));
const drift = [];      // ids waarvan de inhoud is gewijzigd ná toepassing
const backfills = [];  // pre-hardening rijen (checksum null) → eenmalig invullen
for (const row of applied) {
  const file = fileById.get(row.id);
  if (!file) continue; // applied maar geen lokaal bestand — waarschuwing hieronder
  const hash = sha256(readFileSync(join(migrationsDir, file), 'utf8'));
  if (row.checksum == null) {
    // Aanname: een null-checksum-rij (van vóór deze hardening) is toegepast met
    // exact de huidige bestandsinhoud. Eenmalige backfill; bij twijfel over een
    // specifieke migratie kan de rij handmatig op NULL worden gezet.
    backfills.push({ id: row.id, hash });
  } else if (row.checksum !== hash) {
    drift.push(row.id);
  }
}

for (const { id, hash } of backfills) {
  await client.query(
    'update public._migrations set checksum = $2 where id = $1',
    [id, hash],
  );
  console.log(`  ~ checksum backfilled: ${id}`);
}

for (const id of appliedIds) {
  if (!fileById.has(id)) {
    console.warn(`  ! applied maar geen lokaal bestand: ${id} (verwijderde migratie?)`);
  }
}

// Drift is fataal voor muterende modes: stop vóór er iets aan de DB verandert.
// In status-mode wordt drift per rij gemarkeerd en volgt exit 1 aan het einde.
if (drift.length > 0 && mode !== 'status') {
  console.error('');
  console.error('✗ DRIFT — reeds-toegepaste migratie(s) zijn ná toepassing bewerkt:');
  for (const id of drift) console.error(`  !! ${id}`);
  console.error('  Een gemergde migratie is onveranderlijk: draai de wijziging terug');
  console.error('  of voeg de aanpassing toe als NIEUWE migratie. Niets toegepast.');
  await client.end();
  process.exit(1);
}

if (mode === 'status') {
  const driftSet = new Set(drift);
  console.log('--- Migrations status ---');
  for (const f of files) {
    const id = f.replace(/\.sql$/, '');
    const tag = driftSet.has(id)
      ? '!! DRIFT '
      : appliedIds.has(id)
        ? '✓ applied'
        : '· pending';
    console.log(`  ${tag}  ${id}`);
  }
  console.log('');
  console.log(`${appliedIds.size} applied / ${pending.length} pending / ${files.length} totaal.`);
  if (drift.length > 0) {
    console.error(`\n✗ ${drift.length} migratie(s) met drift — inhoud gewijzigd ná toepassing.`);
    await client.end();
    process.exit(1);
  }
  await client.end();
  process.exit(0);
}

if (mode === 'bootstrap') {
  console.log('--- Bootstrap: markeer alle bestaande als applied (geen SQL runnen) ---');
  for (const f of files) {
    const id = f.replace(/\.sql$/, '');
    if (appliedIds.has(id)) {
      console.log(`  ✓ ${id} (al gemarkeerd)`);
      continue;
    }
    const bsql = readFileSync(join(migrationsDir, f), 'utf8');
    await client.query(
      'insert into public._migrations(id, checksum) values ($1, $2) on conflict do nothing',
      [id, sha256(bsql)],
    );
    console.log(`  ✓ ${id} gemarkeerd als applied`);
  }
  console.log('\nDone. Volgende `npm run migrate` runt alleen NIEUWE migrations.');
  await client.end();
  process.exit(0);
}

// mode === 'apply'
if (pending.length === 0) {
  console.log('✓ Alle migrations zijn actueel — niets te doen.');
  await client.end();
  process.exit(0);
}

console.log(`--- Toepassen van ${pending.length} migration(s) ---`);
for (const file of pending) {
  const id = file.replace(/\.sql$/, '');
  const sql = readFileSync(join(migrationsDir, file), 'utf8');
  process.stdout.write(`→ ${id} ... `);
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query(
      'insert into public._migrations(id, checksum) values ($1, $2)',
      [id, sha256(sql)],
    );
    await client.query('commit');
    console.log('✓');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    console.log('✗');
    console.error(`  ${err.message}`);
    if (err.position) console.error(`  position: ${err.position}`);
    if (err.hint) console.error(`  hint: ${err.hint}`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log('\n✓ Klaar.');
