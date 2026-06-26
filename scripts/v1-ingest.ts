// V1 document-ingest CLI: laadt een TXT/PDF/DOCX-document in voor een V1-org.
// run: node --env-file=.env.local --conditions=react-server --import tsx scripts/v1-ingest.ts \
//        --org <slug|id> --file <pad> [--name <label>]
// Systeem-write via de V1-service-role (SA-5). Resolveert-of-maakt-aan de chatbot van de org.

import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestDocument } from '../lib/rag/ingest';
import { extractDocText, isAllowedDocExt, ALLOWED_DOC_EXT } from '../lib/rag/doc-parse';
import { AppError } from '../lib/errors/app-error';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const orgArg = arg('org');
  const fileArg = arg('file');
  if (!orgArg || !fileArg) {
    console.error('Gebruik: v1:ingest --org <slug|id> --file <pad> [--name <label>]');
    process.exit(1);
  }
  const ext = extname(fileArg).slice(1).toLowerCase();
  if (!isAllowedDocExt(ext)) {
    console.error(`Niet-ondersteunde extensie ".${ext}". Toegestaan: ${ALLOWED_DOC_EXT.join(', ')}`);
    process.exit(1);
  }

  const client = getV1ServiceRoleClient();

  // org resolveren (by id of slug)
  const orgQ = client.from('organizations').select('id, name');
  const { data: org, error: orgErr } = await (
    UUID_RE.test(orgArg) ? orgQ.eq('id', orgArg) : orgQ.eq('slug', orgArg)
  ).maybeSingle();
  if (orgErr) {
    console.error(`org-lookup faalde: ${orgErr.message}`);
    process.exit(1);
  }
  if (!org) {
    console.error(`org niet gevonden: ${orgArg}`);
    process.exit(1);
  }
  const organizationId = org.id as string;

  // chatbot resolveren-of-aanmaken (één-per-org; ingest mag auto-createn — spec §6)
  const { data: existing } = await client
    .from('chatbots')
    .select('id')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  let chatbotId = existing?.id as string | undefined;
  if (!chatbotId) {
    const { data: newBot, error: be } = await client
      .from('chatbots')
      .insert({ organization_id: organizationId, name: `${org.name} chatbot`, bot_version: 'v1.0' })
      .select('id')
      .single();
    if (be) {
      console.error(`chatbot aanmaken faalde: ${be.message}`);
      process.exit(1);
    }
    chatbotId = newBot.id as string;
    console.log(`+ chatbot aangemaakt voor org ${organizationId}`);
  }

  // bestand lezen + parsen
  const buffer = await readFile(fileArg);
  const text = await extractDocText(buffer, ext);

  try {
    const res = await ingestDocument(client, {
      organizationId,
      chatbotId,
      filename: arg('name') ?? basename(fileArg),
      text,
      source: 'upload',
    });
    console.log(
      `✓ ingest klaar: doc ${res.documentId}, ${res.parents} parent(s), ${res.chunks} chunk(s), $${res.costUsd.toFixed(4)}`,
    );
    process.exit(0);
  } catch (e) {
    if (e instanceof AppError && e.code === 'INGEST_READ_FAILED') {
      console.error('✗ Geen tekst uit het document (lege/gescande PDF zonder tekstlaag?).');
    } else {
      console.error('✗ ingest mislukt:', e);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
