// Plan 016 fase 1: maakt/actualiseert de eval-orgs in V1-prod (lib/evals/eval-orgs.ts) en
// vult ze via de echte V1-ingest met de eval-KB's (lib/evals/eval-orgs.ts) — elk corpus één keer op
// index v1 (vaste maat + 3-small) en één keer op v2 (kopjes + 3-large).
//
// Idempotent: staat de KB al met dezelfde hash + index-versie in de org, dan niets doen;
// anders chatbot (incl. documenten/chunks via FK-cascade) weg en opnieuw opbouwen.
// Veiligheidsgrens: raakt alleen orgs met slug `eval-…` en weigert als zo'n org members
// heeft (dan is het geen eval-org). Kosten: alleen OpenAI-embeddings (centen).
//
// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/evals-setup-orgs.ts [--dry-run]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { ingestDocument } from '../lib/rag/ingest';
import { EVAL_CORPORA, EVAL_INDEX_VERSIONS, companyOf, evalOrgSlug, loadEvalKb, privateKbDir } from '../lib/evals/eval-orgs';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const svc = getV1ServiceRoleClient();
  const manifest: unknown[] = [];

  for (const c of EVAL_CORPORA) {
    if (c.kind === 'snapshot' && !existsSync(join(privateKbDir(c.corpus), 'pages.json'))) {
      console.log(`- ${c.corpus}: geen snapshot (scripts/evals-snapshot-site.ts) — overgeslagen`);
      continue;
    }
    const { docs: files, kbHash } = loadEvalKb(c);
    const company = companyOf(c);
    for (const index of EVAL_INDEX_VERSIONS) {
      const slug = evalOrgSlug(c.corpus, index);
      if (!slug.startsWith('eval-')) throw new Error(`weiger: ${slug} is geen eval-slug`);

      // Org (upsert op slug)
      let orgId: string;
      const { data: existing, error: e1 } = await svc.from('organizations').select('id').eq('slug', slug).maybeSingle();
      if (e1) throw e1;
      if (existing) {
        orgId = existing.id as string;
      } else if (dryRun) {
        console.log(`[dry-run] zou org ${slug} aanmaken + ${files.length} docs ingesten (${index})`);
        continue;
      } else {
        const { data, error } = await svc
          .from('organizations')
          .insert({ name: `EVAL ${company} (index ${index})`, slug })
          .select('id')
          .single();
        if (error) throw error;
        orgId = data.id as string;
        console.log(`+ org ${slug} ${orgId}`);
      }

      // Geen members — anders is dit geen eval-org en raken we hem niet aan.
      const { count, error: e2 } = await svc
        .from('organization_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('organization_id', orgId);
      if (e2) throw e2;
      if ((count ?? 0) > 0) throw new Error(`weiger: ${slug} heeft ${count} member(s)`);

      // Al actueel?
      const { data: bots, error: e3 } = await svc
        .from('chatbots')
        .select('id, index_version, name')
        .eq('organization_id', orgId)
        .is('deleted_at', null);
      if (e3) throw e3;
      let upToDate = false;
      if (bots && bots.length === 1 && bots[0].index_version === index && bots[0].name === company) {
        const { data: docs, error: e4 } = await svc
          .from('documents')
          .select('metadata, status')
          .eq('chatbot_id', bots[0].id)
          .is('deleted_at', null);
        if (e4) throw e4;
        upToDate =
          (docs ?? []).length === files.length &&
          (docs ?? []).every(
            (d) => d.status === 'ready' && (d.metadata as { kb_hash?: string } | null)?.kb_hash === kbHash,
          );
      }
      if (upToDate) {
        console.log(`= ${slug}: actueel (kb ${kbHash}, ${files.length} docs)`);
        manifest.push({ slug, orgId, chatbotId: bots![0].id, index, kbHash, docs: files.length });
        continue;
      }
      if (dryRun) {
        console.log(`[dry-run] zou ${slug} opnieuw opbouwen (kb ${kbHash})`);
        continue;
      }

      // Opnieuw opbouwen: chatbot weg (FK-cascade → documenten/chunks), nieuwe chatbot met de
      // index-versie, daarna elk document via de echte ingest.
      const { error: e5 } = await svc.from('chatbots').delete().eq('organization_id', orgId);
      if (e5) throw e5;
      const { data: bot, error: e6 } = await svc
        .from('chatbots')
        .insert({ organization_id: orgId, name: company, bot_version: 'v1.0', index_version: index })
        .select('id')
        .single();
      if (e6) throw e6;
      const chatbotId = bot.id as string;
      let chunks = 0;
      for (const f of files) {
        const r = await ingestDocument(svc, {
          organizationId: orgId,
          chatbotId,
          filename: f.filename,
          text: f.text,
          source: f.source,
          indexVersion: index,
          metadata: { ...f.metadata, kb_hash: kbHash, eval_corpus: c.corpus },
        });
        chunks += r.chunks;
      }
      console.log(`✓ ${slug}: ${files.length} docs, ${chunks} chunks (index ${index}, kb ${kbHash})`);
      manifest.push({ slug, orgId, chatbotId, index, kbHash, docs: files.length, chunks });
    }
  }

  if (!dryRun) {
    mkdirSync('eval-out/evals-v2', { recursive: true });
    writeFileSync('eval-out/evals-v2/eval-orgs.json', JSON.stringify({ at: new Date().toISOString(), orgs: manifest }, null, 1));
    console.log('\nmanifest → eval-out/evals-v2/eval-orgs.json');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exit(1);
  });
