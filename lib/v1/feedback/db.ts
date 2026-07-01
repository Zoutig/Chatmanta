// V1 service-role DB layer voor feedback-tickets (v1_feedback_ticket +
// v1_feedback_ticket_event). Port van lib/controlroom/server/feedback.ts.
//
// Verschillen t.o.v. V0:
// - Tabel: v1_feedback_ticket / v1_feedback_ticket_event
// - Bucket: v1-feedback-attachments
// - Client: getV1ServiceRoleClient() (V1-project)
// - listTickets / getTicket joinen organizations voor org_name (geen KNOWN_ORGS)
//
// Typen zijn hergebruikt van lib/controlroom/types (FeedbackItem etc.).
// RLS staat AAN, GEEN policy → alle reads/writes via service-role (dit bestand).

import 'server-only';

import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import type {
  FeedbackCreateInput,
  FeedbackEvent,
  FeedbackEventAuthor,
  FeedbackEventKind,
  FeedbackFilter,
  FeedbackItem,
  FeedbackPriority,
  FeedbackStatus,
} from '@/lib/controlroom/types';
import { FEEDBACK_PRIORITY_LABELS } from '@/lib/controlroom/types';

const TABLE = 'v1_feedback_ticket';
const EVENTS = 'v1_feedback_ticket_event';
const BUCKET = 'v1-feedback-attachments';

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

/** FeedbackItem uitgebreid met orgName (uit organizations-join). */
export type TicketWithOrg = FeedbackItem & { orgName: string };

// ─── events ────────────────────────────────────────────────────────────────

export async function addTicketEvent(
  feedbackId: string,
  ev: {
    kind: FeedbackEventKind;
    fromStatus?: FeedbackStatus | null;
    toStatus?: FeedbackStatus | null;
    body?: string | null;
    author?: FeedbackEventAuthor;
  },
): Promise<void> {
  const { error } = await getV1ServiceRoleClient()
    .from(EVENTS)
    .insert({
      feedback_id: feedbackId,
      kind: ev.kind,
      from_status: ev.fromStatus ?? null,
      to_status: ev.toStatus ?? null,
      body: ev.body ?? null,
      author: ev.author ?? 'operator',
    });
  if (error) throw new Error(`addTicketEvent: ${error.message}`);
}

// ─── tickets ───────────────────────────────────────────────────────────────

export async function createTicket(input: FeedbackCreateInput): Promise<FeedbackItem> {
  const { data, error } = await getV1ServiceRoleClient()
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
  if (error || !data) throw new Error(`createTicket: ${error?.message ?? 'no row'}`);
  const item = mapRow(data as Row);
  // created-event is best-effort; de ticket is al opgeslagen ook als dit faalt.
  try {
    await addTicketEvent(item.id, { kind: 'created', toStatus: item.status, author: 'klant' });
  } catch (e) {
    console.error('[createTicket] created-event faalde', (e as Error).message);
  }
  return item;
}

export async function setTicketAttachment(id: string, path: string, name: string): Promise<void> {
  const { error } = await getV1ServiceRoleClient()
    .from(TABLE)
    .update({ attachment_path: path, attachment_name: name })
    .eq('id', id);
  if (error) throw new Error(`setTicketAttachment: ${error.message}`);
}

export async function listTickets(filter: FeedbackFilter = {}): Promise<TicketWithOrg[]> {
  // ponytail: organizations-join geeft org_name inline; geen KNOWN_ORGS nodig.
  let q = getV1ServiceRoleClient()
    .from(TABLE)
    .select('*, organizations(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.statuses?.length) q = q.in('status', filter.statuses as string[]);
  if (filter.type) q = q.eq('type', filter.type);
  if (filter.urgency) q = q.eq('urgency', filter.urgency);
  if (filter.source) q = q.eq('source', filter.source);
  if (filter.orgId) q = q.eq('organization_id', filter.orgId);
  if (filter.search) {
    const term = filter.search.slice(0, 120).replace(/[%,()*\\"']/g, ' ').trim();
    if (term) q = q.or(`description.ilike.%${term}%,question.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) {
    console.error('[listTickets]', error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Row & { organizations: { name: string } | null };
    return { ...mapRow(row), orgName: row.organizations?.name ?? '—' };
  });
}

export async function getTicket(id: string): Promise<TicketWithOrg | null> {
  const { data, error } = await getV1ServiceRoleClient()
    .from(TABLE)
    .select('*, organizations(name)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Row & { organizations: { name: string } | null };
  return { ...mapRow(row), orgName: row.organizations?.name ?? '—' };
}

export async function listTicketEvents(feedbackId: string): Promise<FeedbackEvent[]> {
  const { data, error } = await getV1ServiceRoleClient()
    .from(EVENTS)
    .select('*')
    .eq('feedback_id', feedbackId)
    .order('created_at', { ascending: true });
  if (error) {
    console.error('[listTicketEvents]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapEvent(r as EventRow));
}

export async function getTicketSummary(): Promise<{ open: number; nieuw: number }> {
  const countStatus = async (status: FeedbackStatus): Promise<number> => {
    const { count } = await getV1ServiceRoleClient()
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

export async function setTicketStatus(id: string, status: FeedbackStatus): Promise<void> {
  const current = await getTicket(id);
  if (!current) throw new Error(`setTicketStatus: ticket ${id} niet gevonden`);
  if (current.status === status) return;
  const { error } = await getV1ServiceRoleClient().from(TABLE).update({ status }).eq('id', id);
  if (error) throw new Error(`setTicketStatus: ${error.message}`);
  try {
    await addTicketEvent(id, { kind: 'status_change', fromStatus: current.status, toStatus: status, author: 'operator' });
  } catch (e) {
    console.error('[setTicketStatus] status_change-event faalde', (e as Error).message);
  }
}

export async function setTicketPriority(id: string, priority: FeedbackPriority | null): Promise<void> {
  const current = await getTicket(id);
  if (!current) throw new Error(`setTicketPriority: ticket ${id} niet gevonden`);
  if ((current.priority ?? null) === priority) return;
  const { error } = await getV1ServiceRoleClient().from(TABLE).update({ priority }).eq('id', id);
  if (error) throw new Error(`setTicketPriority: ${error.message}`);
  const label = (p: FeedbackPriority | null) => (p ? FEEDBACK_PRIORITY_LABELS[p] : '—');
  try {
    await addTicketEvent(id, {
      kind: 'internal_note',
      author: 'operator',
      body: `Prioriteit: ${label(current.priority)} → ${label(priority)}`,
    });
  } catch (e) {
    console.error('[setTicketPriority] event faalde', (e as Error).message);
  }
}

// ─── storage ───────────────────────────────────────────────────────────────

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(-120) || 'bijlage';
}

export async function uploadTicketAttachment(
  orgId: string,
  feedbackId: string,
  file: File,
): Promise<{ path: string; name: string }> {
  const name = safeFileName(file.name);
  const path = `${orgId}/${feedbackId}/${name}`;
  const { error } = await getV1ServiceRoleClient()
    .storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: true });
  if (error) throw new Error(`uploadTicketAttachment: ${error.message}`);
  return { path, name };
}

/** Kortlevende signed-URL (60s) voor de operator-detailpagina. Null bij fout. */
export async function getTicketAttachmentSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await getV1ServiceRoleClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data) {
    console.error('[getTicketAttachmentSignedUrl]', error?.message);
    return null;
  }
  return data.signedUrl;
}
