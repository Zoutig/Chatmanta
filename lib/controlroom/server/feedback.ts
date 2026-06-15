// Control Room — read/mutatie-laag voor admin_feedback + admin_feedback_events
// (de Feedback-tab). Service-role via sb(); org-filters worden tegen KNOWN_ORGS
// gevalideerd door de caller. Lees-functies gooien nooit → []/null; mutaties
// gooien wel zodat actionTry ze als fout afhandelt.

import 'server-only';

import type {
  FeedbackCreateInput,
  FeedbackEvent,
  FeedbackEventAuthor,
  FeedbackEventKind,
  FeedbackFilter,
  FeedbackItem,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackSummary,
} from '@/lib/controlroom/types';
import { FEEDBACK_PRIORITY_LABELS } from '@/lib/controlroom/types';
import { sb } from './db';

const TABLE = 'admin_feedback';
const EVENTS = 'admin_feedback_events';
const BUCKET = 'feedback-attachments';

type Row = {
  id: string;
  organization_id: string;
  source: string;
  type: string;
  urgency: string;
  priority: string | null;
  status: string;
  description: string;
  submitter_name: string | null;
  submitter_email: string | null;
  chat_id: string | null;
  question: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  privacy_accepted_at: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function mapRow(r: Row): FeedbackItem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    source: r.source as FeedbackItem['source'],
    type: r.type as FeedbackItem['type'],
    urgency: r.urgency as FeedbackItem['urgency'],
    priority: (r.priority as FeedbackItem['priority']) ?? null,
    status: r.status as FeedbackStatus,
    description: r.description,
    submitterName: r.submitter_name,
    submitterEmail: r.submitter_email,
    chatId: r.chat_id,
    question: r.question,
    attachmentPath: r.attachment_path,
    attachmentName: r.attachment_name,
    privacyAcceptedAt: r.privacy_accepted_at,
    context: r.context ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type EventRow = {
  id: string;
  feedback_id: string;
  kind: string;
  from_status: string | null;
  to_status: string | null;
  body: string | null;
  author: string;
  created_at: string;
};

function mapEvent(r: EventRow): FeedbackEvent {
  return {
    id: r.id,
    feedbackId: r.feedback_id,
    kind: r.kind as FeedbackEventKind,
    fromStatus: (r.from_status as FeedbackStatus | null) ?? null,
    toStatus: (r.to_status as FeedbackStatus | null) ?? null,
    body: r.body,
    author: r.author as FeedbackEventAuthor,
    createdAt: r.created_at,
  };
}

/** Schrijf een history-event. Best-effort vanaf createFeedback (niet fataal),
 *  maar gooit wel zodat statuswijzigingen die hierop leunen falen-zichtbaar zijn. */
export async function addFeedbackEvent(
  feedbackId: string,
  ev: { kind: FeedbackEventKind; fromStatus?: FeedbackStatus | null; toStatus?: FeedbackStatus | null; body?: string | null; author?: FeedbackEventAuthor },
): Promise<void> {
  const { error } = await sb()
    .from(EVENTS)
    .insert({
      feedback_id: feedbackId,
      kind: ev.kind,
      from_status: ev.fromStatus ?? null,
      to_status: ev.toStatus ?? null,
      body: ev.body ?? null,
      author: ev.author ?? 'operator',
    });
  if (error) throw new Error(`addFeedbackEvent: ${error.message}`);
}

/** Insert een melding + 'created'-event. Org wordt door de caller server-side
 *  gezet (nooit client-payload). Gooit op insert-fout. */
export async function createFeedback(input: FeedbackCreateInput): Promise<FeedbackItem> {
  const { data, error } = await sb()
    .from(TABLE)
    .insert({
      organization_id: input.organizationId,
      source: input.source,
      type: input.type,
      urgency: input.urgency,
      description: input.description,
      submitter_name: input.submitterName ?? null,
      submitter_email: input.submitterEmail ?? null,
      chat_id: input.chatId ?? null,
      question: input.question ?? null,
      attachment_path: input.attachmentPath ?? null,
      attachment_name: input.attachmentName ?? null,
      privacy_accepted_at: input.privacyAcceptedAt ?? null,
      context: input.context ?? {},
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(`createFeedback: ${error?.message ?? 'no row'}`);
  const item = mapRow(data as Row);
  // 'created'-event is best-effort: een melding zonder history-rij is nog steeds
  // een geldige melding. Faal de hele insert niet als alleen het event misgaat.
  try {
    await addFeedbackEvent(item.id, { kind: 'created', toStatus: item.status, author: input.source === 'klantendashboard' ? 'klant' : 'operator' });
  } catch (e) {
    console.error('[createFeedback] created-event faalde', (e as Error).message);
  }
  return item;
}

/** Zet attachment-pad/naam op een bestaande melding (na geslaagde upload). */
export async function setFeedbackAttachment(id: string, path: string, name: string): Promise<void> {
  const { error } = await sb()
    .from(TABLE)
    .update({ attachment_path: path, attachment_name: name })
    .eq('id', id);
  if (error) throw new Error(`setFeedbackAttachment: ${error.message}`);
}

export async function listFeedback(filter: FeedbackFilter = {}): Promise<FeedbackItem[]> {
  let q = sb().from(TABLE).select('*').order('created_at', { ascending: false }).limit(200);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.statuses && filter.statuses.length) q = q.in('status', filter.statuses as string[]);
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.urgency) q = q.eq('urgency', filter.urgency);
  if (filter.source) q = q.eq('source', filter.source);
  if (filter.orgId) q = q.eq('organization_id', filter.orgId);
  if (filter.search) {
    // Sanitize: strip PostgREST/.or()-speciale tekens (komma, %, haakjes, *, backslash,
    // quotes) zodat de zoekterm de filtersyntax niet kan breken; cap op 120.
    const term = filter.search.slice(0, 120).replace(/[%,()*\\"']/g, ' ').trim();
    if (term) q = q.or(`description.ilike.%${term}%,question.ilike.%${term}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[listFeedback]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Row));
}

export async function getFeedback(id: string): Promise<FeedbackItem | null> {
  const { data, error } = await sb().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Row);
}

export async function listFeedbackEvents(feedbackId: string): Promise<FeedbackEvent[]> {
  const { data, error } = await sb()
    .from(EVENTS)
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[listFeedbackEvents]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapEvent(r as EventRow));
}

/** Open-count (nieuw + in_behandeling) voor de health-strip + sidebar-badge. */
export async function getFeedbackSummary(): Promise<FeedbackSummary> {
  const countStatus = async (status: FeedbackStatus): Promise<number> => {
    const { count } = await sb()
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('status', status);
    return count ?? 0;
  };
  const [nieuw, inBehandeling] = await Promise.all([
    countStatus('nieuw').catch(() => 0),
    countStatus('in_behandeling').catch(() => 0),
  ]);
  return { open: nieuw + inBehandeling, nieuw };
}

/** Zet de status + schrijf een status_change-event met from/to. */
export async function setFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const current = await getFeedback(id);
  if (!current) throw new Error(`setFeedbackStatus: feedback ${id} niet gevonden`);
  if (current.status === status) return; // no-op
  const { error } = await sb().from(TABLE).update({ status }).eq('id', id);
  if (error) throw new Error(`setFeedbackStatus: ${error.message}`);
  // Best-effort historie: de statuswijziging is al doorgevoerd, dus een
  // mislukt event mag de action niet als fout laten terugkomen (consistent met
  // het created-event in createFeedback). We loggen het gat hooguit.
  try {
    await addFeedbackEvent(id, {
      kind: 'status_change',
      fromStatus: current.status,
      toStatus: status,
      author: 'operator',
    });
  } catch (e) {
    console.error('[setFeedbackStatus] status_change-event faalde', (e as Error).message);
  }
}

/** Zet (of wist met null) de operator-prioriteit. Migratie-vrij: de wijziging
 *  wordt als internal_note in de historie gelogd (geen apart event-kind). */
export async function setFeedbackPriority(id: string, priority: FeedbackPriority | null): Promise<void> {
  const current = await getFeedback(id);
  if (!current) throw new Error(`setFeedbackPriority: feedback ${id} niet gevonden`);
  if ((current.priority ?? null) === priority) return; // no-op
  const { error } = await sb().from(TABLE).update({ priority }).eq('id', id);
  if (error) throw new Error(`setFeedbackPriority: ${error.message}`);
  const label = (p: FeedbackPriority | null) => (p ? FEEDBACK_PRIORITY_LABELS[p] : '—');
  // Best-effort audit, net als bij setFeedbackStatus.
  try {
    await addFeedbackEvent(id, {
      kind: 'internal_note',
      author: 'operator',
      body: `Prioriteit: ${label(current.priority)} → ${label(priority)}`,
    });
  } catch (e) {
    console.error('[setFeedbackPriority] event faalde', (e as Error).message);
  }
}

// ── Bijlagen (private bucket, service-role) ────────────────────────────────

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(-120) || 'bijlage';
}

/** Upload een bijlage naar de private bucket. Pad = org/feedback/naam. Gooit op
 *  fout zodat de caller de submit niet stilletjes zonder bijlage laat slagen. */
export async function uploadAttachment(
  orgId: string,
  feedbackId: string,
  file: File,
): Promise<{ path: string; name: string }> {
  const name = safeFileName(file.name);
  const path = `${orgId}/${feedbackId}/${name}`;
  const { error } = await sb()
    .storage.from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });
  if (error) throw new Error(`uploadAttachment: ${error.message}`);
  return { path, name };
}

/**
 * Upload een widget-preview-screenshot (PNG-bytes) naar dezelfde private bucket
 * onder een DETERMINISTISCH pad (widget-preview/<orgId>.png), upsert=true zodat
 * een refresh de oude screenshot overschrijft i.p.v. te stapelen. Geeft een
 * langlevende signed-URL terug die als sfeer-backdrop in de Preview-tab geladen
 * kan worden — de bucket is privé (geen publieke URL), dus we signen lang (1 jaar)
 * en bewaren die in de widget_preview-cache. Gooit op fout zodat de caller de
 * capture als mislukt kan afhandelen (best-effort → backdrop-mockup).
 */
const WIDGET_PREVIEW_DIR = 'widget-preview';
const WIDGET_PREVIEW_SIGN_TTL_SEC = 60 * 60 * 24 * 365; // 1 jaar

export async function uploadWidgetPreview(
  orgId: string,
  bytes: Uint8Array,
): Promise<{ url: string; path: string }> {
  const path = `${WIDGET_PREVIEW_DIR}/${orgId}.png`;
  const { error: upErr } = await sb()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: 'image/png', upsert: true });
  if (upErr) throw new Error(`uploadWidgetPreview: ${upErr.message}`);
  const { data, error: signErr } = await sb()
    .storage.from(BUCKET)
    .createSignedUrl(path, WIDGET_PREVIEW_SIGN_TTL_SEC);
  if (signErr || !data) throw new Error(`uploadWidgetPreview sign: ${signErr?.message ?? 'no url'}`);
  return { url: data.signedUrl, path };
}

/** Kortlevende signed-URL (60s) voor de operator-detailpagina. Null bij fout. */
export async function getAttachmentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    console.error('[getAttachmentSignedUrl]', error?.message);
    return null;
  }
  return data.signedUrl;
}

/** Hard delete (AVG): rij (cascade events) + bucket-object best-effort. */
export async function deleteFeedback(id: string): Promise<void> {
  const item = await getFeedback(id);
  const { error } = await sb().from(TABLE).delete().eq('id', id);
  if (error) throw new Error(`deleteFeedback: ${error.message}`);
  if (item?.attachmentPath) {
    const { error: rmErr } = await sb().storage.from(BUCKET).remove([item.attachmentPath]);
    if (rmErr) console.error('[deleteFeedback] bucket-object verwijderen faalde', rmErr.message);
  }
}
