// V1-herindexering naar een andere index-versie (migr 0030, chatbots.index_version).
// Bouwt per document de tekst opnieuw op uit de opgeslagen parent_chunks (het origineel
// wordt na upload niet bewaard), knipt + embedt volgens de doel-versie, en wisselt per
// chatbot in één snelle schrijfronde: oude chunks weg → nieuwe erin → index_version om →
// answer-cache purgen. Alles wordt eerst in het geheugen voorbereid (incl. embeddings),
// zodat de gemengde toestand maar enkele seconden duurt.
//
//   npm run v1:reindex -- --chatbot=<id>          (proefdraai: alleen tellingen)
//   npm run v1:reindex -- --chatbot=<id> --apply
//   npm run v1:reindex -- --all [--apply]         (alle chatbots die nog niet op --to staan)
//   --to=v2 (default) | --to=v1 (terugdraaien)
//
// Reconstructie-check: voor v1-documenten wordt de herbouwde tekst opnieuw met de v1-knipper
// geknipt en vergeleken met de opgeslagen parents. Klopt dat niet exact, dan wordt het
// document overgeslagen en de chatbot niet gewisseld (tenzij --force).

import { getV1ServiceRoleClient } from '../lib/supabase/v1/service-role';
import { chunkForIndex, purgeAnswerCache } from '../lib/rag/ingest';
import { chunkParentsAndChildren } from '../lib/rag/chunker';
import { embedTexts } from '../lib/rag/embeddings';
import { embedModelFor, isIndexVersion, type IndexVersion } from '../lib/rag/index-version';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const ALL = process.argv.includes('--all');
const ONLY = arg('chatbot');
const TO = arg('to') ?? 'v2';
if (!isIndexVersion(TO)) throw new Error(`--to moet v1 of v2 zijn, niet ${TO}`);
const target: IndexVersion = TO;
if (!ALL && !ONLY) {
  console.error('✗ geef --chatbot=<id> of --all');
  process.exit(1);
}

type Sb = ReturnType<typeof getV1ServiceRoleClient>;

/** v1-parents overlappen 400 tekens (getrimd); plak ze aan elkaar zonder dubbeling. */
function joinSlidingParents(parents: string[]): string | null {
  if (parents.length === 0) return '';
  let out = parents[0];
  for (let i = 1; i < parents.length; i++) {
    const next = parents[i];
    const head = next.slice(0, Math.min(60, next.length));
    const idx = out.indexOf(head, Math.max(0, out.length - 520));
    if (idx < 0) return null;
    out = out.slice(0, idx) + next;
  }
  return out;
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
async function all<T>(q: (from: number, to: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await q(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) return out;
  }
}

type Doc = { id: string; filename: string; metadata: Record<string, unknown> | null };
type Prepared = {
  doc: Doc;
  parents: string[];
  children: { parentIndex: number; content: string }[];
  vectors: number[][];
};

async function prepareChatbot(sb: Sb, orgId: string, chatbotId: string, from: IndexVersion) {
  const docs = await all<Doc>((a, b) =>
    sb
      .from('documents')
      .select('id, filename, metadata')
      .eq('organization_id', orgId)
      .eq('chatbot_id', chatbotId)
      .is('deleted_at', null)
      .order('created_at')
      .range(a, b),
  );
  const prepared: Prepared[] = [];
  const skipped: string[] = [];
  let cost = 0;
  for (const doc of docs) {
    const ps = await all<{ parent_index: number; content: string }>((a, b) =>
      sb
        .from('parent_chunks')
        .select('parent_index, content')
        .eq('organization_id', orgId)
        .eq('document_id', doc.id)
        .order('parent_index')
        .range(a, b),
    );
    if (ps.length === 0) {
      // Gefaalde/uitgesloten pagina's (status failed/excluded) hebben geen chunks: niets te doen.
      continue;
    }
    const metaVersion = doc.metadata?.index_version;
    const docVersion: IndexVersion = isIndexVersion(metaVersion) ? metaVersion : from;
    const parentsOld = ps.map((p) => p.content);
    let text: string | null;
    if (docVersion === 'v1') {
      text = joinSlidingParents(parentsOld);
      const exact = text !== null && JSON.stringify(chunkParentsAndChildren(text).parents) === JSON.stringify(parentsOld);
      if (!exact) {
        skipped.push(`${doc.filename}: reconstructie klopt niet exact`);
        if (!FORCE) continue;
        text = text ?? parentsOld.join('\n\n');
      }
    } else {
      // v2-parents zijn secties zonder overlap.
      text = parentsOld.join('\n\n');
    }
    const { parents, children } = chunkForIndex(text as string, doc.filename, doc.metadata ?? {}, target);
    if (children.length === 0) {
      skipped.push(`${doc.filename}: leeg na knippen`);
      continue;
    }
    const emb = await embedTexts(children.map((c) => c.embedText), embedModelFor(target));
    cost += emb.costUsd;
    prepared.push({
      doc,
      parents,
      children: children.map(({ parentIndex, content }) => ({ parentIndex, content })),
      vectors: emb.vectors,
    });
  }
  return { docs, prepared, skipped, cost };
}

async function swapDocument(sb: Sb, orgId: string, chatbotId: string, p: Prepared) {
  const { error: d1 } = await sb.from('document_chunks').delete().eq('organization_id', orgId).eq('document_id', p.doc.id);
  if (d1) throw new Error(`delete chunks ${p.doc.filename}: ${d1.message}`);
  const { error: d2 } = await sb.from('parent_chunks').delete().eq('organization_id', orgId).eq('document_id', p.doc.id);
  if (d2) throw new Error(`delete parents ${p.doc.filename}: ${d2.message}`);
  const { data: insP, error: pe } = await sb
    .from('parent_chunks')
    .insert(
      p.parents.map((content, parent_index) => ({
        organization_id: orgId,
        chatbot_id: chatbotId,
        document_id: p.doc.id,
        parent_index,
        content,
      })),
    )
    .select('id, parent_index');
  if (pe) throw new Error(`insert parents ${p.doc.filename}: ${pe.message}`);
  const pid = new Map((insP ?? []).map((r) => [r.parent_index as number, r.id as string]));
  const rows = p.children.map((c, i) => ({
    organization_id: orgId,
    chatbot_id: chatbotId,
    document_id: p.doc.id,
    content: c.content,
    embedding: p.vectors[i],
    parent_chunk_id: pid.get(c.parentIndex) ?? null,
    metadata: { chunk_index: i, parent_index: c.parentIndex },
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from('document_chunks').insert(rows.slice(i, i + 200));
    if (error) throw new Error(`insert chunks ${p.doc.filename}: ${error.message}`);
  }
  const { error: ue } = await sb
    .from('documents')
    .update({
      metadata: { ...(p.doc.metadata ?? {}), parent_count: p.parents.length, chunk_count: p.children.length, index_version: target },
    })
    .eq('id', p.doc.id)
    .eq('organization_id', orgId);
  if (ue) throw new Error(`update document ${p.doc.filename}: ${ue.message}`);
}

async function main() {
  const sb = getV1ServiceRoleClient();
  let q = sb.from('chatbots').select('id, organization_id, name, index_version').is('deleted_at', null);
  if (ONLY) q = q.eq('id', ONLY);
  const { data: bots, error } = await q;
  if (error) throw new Error(error.message);
  const todo = (bots ?? []).filter((b) => b.index_version !== target);
  console.log(
    `${APPLY ? 'APPLY' : 'PROEFDRAAI'} → ${target}: ${todo.length} chatbot(s) (${(bots ?? []).length - todo.length} staan al op ${target})`,
  );
  let totalCost = 0;
  for (const bot of todo) {
    const orgId = bot.organization_id as string;
    const chatbotId = bot.id as string;
    const from = bot.index_version as IndexVersion;
    const t0 = Date.now();
    const prep = await prepareChatbot(sb, orgId, chatbotId, from);
    totalCost += prep.cost;
    const newChildren = prep.prepared.reduce((s, p) => s + p.children.length, 0);
    const newParents = prep.prepared.reduce((s, p) => s + p.parents.length, 0);
    console.log(
      `\n• ${bot.name} (${chatbotId}) ${from} → ${target}: ${prep.docs.length} documenten, ${prep.prepared.length} met inhoud → ${newParents} parents / ${newChildren} chunks, embed $${prep.cost.toFixed(4)}`,
    );
    for (const s of prep.skipped) console.log(`  ! ${s}`);
    if (!APPLY) continue;
    if (prep.skipped.length && !FORCE) {
      console.log('  ✗ niet gewisseld: los de meldingen hierboven op of gebruik --force');
      continue;
    }
    const tSwap = Date.now();
    for (const p of prep.prepared) await swapDocument(sb, orgId, chatbotId, p);
    const { error: fe } = await sb.from('chatbots').update({ index_version: target }).eq('id', chatbotId).eq('organization_id', orgId);
    if (fe) throw new Error(`index_version flip: ${fe.message}`);
    await purgeAnswerCache(sb, orgId, chatbotId);
    console.log(
      `  ✓ gewisseld in ${((Date.now() - tSwap) / 1000).toFixed(1)} s (voorbereiding ${((tSwap - t0) / 1000).toFixed(1)} s); cache gepurged`,
    );
  }
  console.log(`\nklaar; embed-kosten totaal $${totalCost.toFixed(4)}`);
}

main().catch((e) => {
  console.error('✗', e instanceof Error ? e.message : e);
  process.exit(1);
});
