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
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✗ DATABASE_URL ontbreekt in env.');
  console.error('  Voeg toe aan .env.local — zie Supabase dashboard → Database → Connection string.');
  process.exit(1);
}

const mode = process.argv[2] === 'status'
  ? 'status'
  : process.argv[2] === 'bootstrap'
    ? 'bootstrap'
    : 'apply';

const migrationsDir = resolve('supabase/migrations');
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

// Tracking-tabel — geen org_id of RLS, dit is meta-laag (zoals
// pgmigrations / flyway_schema_history).
await client.query(`
  create table if not exists public._migrations (
    id          text        primary key,
    applied_at  timestamptz not null default now()
  );
`);

const { rows: applied } = await client.query(
  'select id from public._migrations order by id',
);
const appliedIds = new Set(applied.map((r) => r.id));
const pending = files.filter((f) => !appliedIds.has(f.replace(/\.sql$/, '')));

if (mode === 'status') {
  console.log('--- Migrations status ---');
  for (const f of files) {
    const id = f.replace(/\.sql$/, '');
    const tag = appliedIds.has(id) ? '✓ applied' : '· pending';
    console.log(`  ${tag}  ${id}`);
  }
  console.log('');
  console.log(`${appliedIds.size} applied / ${pending.length} pending / ${files.length} totaal.`);
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
    await client.query(
      'insert into public._migrations(id) values ($1) on conflict do nothing',
      [id],
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
      'insert into public._migrations(id) values ($1)',
      [id],
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
