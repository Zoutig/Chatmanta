// V1 DB-sink: schrijft fout-voorvallen naar admin_error_groups.
// Faithful port van lib/v0/server/error-capture.ts — enige wijzigingen:
//   * db-client = getV1ServiceRoleClient() (RLS-bypass, V1 tabel heeft RLS AAN zonder
//     leesbeleid — alleen service-role kan schrijven).
//   * Registreert GEEN global sink (in V1 is er geen lib/errors/action.ts die getSink()
//     gebruikt op hetzelfde code-pad — de V1 RAG-laag roept captureError direct aan).
//     Wil je de global sink ook in V1 activeren: voeg registerSink aan toe in
//     instrumentation.ts (boot-import). Buiten scope van deze port.

import 'server-only';

import { after } from 'next/server';

import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { computeFingerprint, topFrameOf } from '@/lib/observability/fingerprint';
import { redactPii } from '@/lib/observability/redact';
import {
  severityForCode,
  type ErrorContext,
  type ErrorEvent,
  type ErrorSeverity,
} from '@/lib/observability/sink';

const CARDINALITY_CAP = 5000;
const CAPTURE_TIMEOUT_MS = 800;
const STACK_CAP = 4000;
const INPUT_CAP = 2000;
const MESSAGE_CAP = 1000;
const URL_CAP = 500;

export type CaptureInput = ErrorEvent & {
  error?: unknown;
  /** Ruwe gebruikersinvoer — server-side geredigeerd vóór opslag. */
  inputRaw?: string;
  /** Publiek endpoint: dwing de cardinaliteits-cap af (untrusted bron). */
  enforceCap?: boolean;
};

function commitSha(): string | undefined {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : undefined;
}

type Row = {
  fingerprint: string;
  orgId: string | null;
  surface: ErrorEvent['surface'];
  severity: ErrorSeverity;
  code: string;
  title: string;
  message: string | null;
  context: ErrorContext;
};

function buildRow(input: CaptureInput): Row {
  const err = input.error;
  const rawStack = err instanceof Error ? err.stack : input.context?.stack;
  const stack = rawStack ? redactPii(rawStack).slice(0, STACK_CAP) : undefined;
  const topFrame = redactPii(input.context?.topFrame ?? topFrameOf(rawStack)) || undefined;
  const rawMessage = input.message ?? (err instanceof Error ? err.message : undefined);
  const message = rawMessage ? redactPii(rawMessage).slice(0, MESSAGE_CAP) : null;
  const severity: ErrorSeverity = input.severity ?? severityForCode(input.code);
  const orgId = input.organizationId ?? null;

  const context: ErrorContext = { ...input.context };
  context.stack = stack;
  context.topFrame = topFrame;
  context.breadcrumbs = input.context?.breadcrumbs?.map((b) => redactPii(b));
  context.commit = context.commit ?? commitSha();
  context.env = context.env ?? process.env.NODE_ENV;
  const rawInput = input.inputRaw ?? context.inputRedacted;
  context.inputRedacted = rawInput ? redactPii(rawInput).slice(0, INPUT_CAP) : undefined;
  if (context.url) context.url = redactPii(context.url).slice(0, URL_CAP);

  const title = (input.title ?? message ?? input.code).slice(0, 200);
  const fingerprint = computeFingerprint({
    surface: input.surface,
    code: input.code,
    organizationId: orgId,
    route: context.route,
    topFrame,
    message,
  });
  return { fingerprint, orgId, surface: input.surface, severity, code: input.code, title, message, context };
}

async function doCapture(input: CaptureInput): Promise<void> {
  let row = buildRow(input);
  const svc = getV1ServiceRoleClient();

  if (input.enforceCap) {
    const open = await svc
      .from('admin_error_groups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    if ((open.count ?? 0) >= CARDINALITY_CAP) {
      const existing = await svc
        .from('admin_error_groups')
        .select('id', { count: 'exact', head: true })
        .eq('fingerprint', row.fingerprint);
      if ((existing.count ?? 0) === 0) {
        row = {
          ...row,
          code: 'OVERFLOW',
          severity: 'info',
          orgId: null,
          message: null,
          title: `Overflow-bucket (cardinaliteits-cap ${CARDINALITY_CAP} bereikt)`,
          fingerprint: computeFingerprint({ surface: input.surface, code: 'OVERFLOW', organizationId: null }),
        };
      }
    }
  }

  const { error } = await svc.rpc('admin_error_capture', {
    p_fingerprint: row.fingerprint,
    p_organization_id: row.orgId,
    p_surface: row.surface,
    p_severity: row.severity,
    p_code: row.code,
    p_title: row.title,
    p_message: row.message,
    p_context: row.context,
  });
  if (error) {
    console.error('[v1/captureError] rpc error:', error.message);
  }
}

/** Fire-and-forget — throwt nooit, voegt geen latency toe aan het request-pad. */
export function captureError(input: CaptureInput): void {
  const run = async () => {
    try {
      await Promise.race([
        doCapture(input),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('capture timeout')), CAPTURE_TIMEOUT_MS),
        ),
      ]);
    } catch (e) {
      console.error('[v1/captureError] failed:', e instanceof Error ? e.message : e);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
