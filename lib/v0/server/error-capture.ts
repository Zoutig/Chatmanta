// DB-sink: schrijft fout-voorvallen naar admin_error_groups. De twin van
// logQuery() — fire-and-forget, NOOIT throwen, NOOIT awaiten op het kritieke
// request-pad. Registreert zichzelf als de observability-sink (sink.ts); de
// expliciete boot-import gebeurt in instrumentation.ts zodat actionTry's
// getSink() ook werkt op paden die error-capture niet zelf importeren.

import 'server-only';

import { after } from 'next/server';

import { sb } from '@/lib/controlroom/server/db';
import { computeFingerprint, topFrameOf } from '@/lib/observability/fingerprint';
import { redactPii } from '@/lib/observability/redact';
import {
  registerSink,
  severityForCode,
  type ErrorContext,
  type ErrorEvent,
  type ErrorSeverity,
} from '@/lib/observability/sink';

const CARDINALITY_CAP = 5000; // max distinct OPEN groepen; daarboven → overflow-bucket per surface
const CAPTURE_TIMEOUT_MS = 800;
const STACK_CAP = 4000;
const INPUT_CAP = 2000;
const MESSAGE_CAP = 1000;
const URL_CAP = 500;

export type CaptureInput = ErrorEvent & {
  /** Ruwe Error om stack/topFrame/message uit te halen. */
  error?: unknown;
  /** Ruwe gebruikersinvoer — wordt server-side geredigeerd, nooit rauw opgeslagen. */
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
  const stack = rawStack ? rawStack.slice(0, STACK_CAP) : undefined;
  const topFrame = input.context?.topFrame ?? topFrameOf(rawStack);
  const rawMessage = input.message ?? (err instanceof Error ? err.message : undefined);
  const message = rawMessage ? redactPii(rawMessage).slice(0, MESSAGE_CAP) : null;
  const severity: ErrorSeverity = input.severity ?? severityForCode(input.code);
  const orgId = input.organizationId ?? null;

  // Server-side redactie aan deze trust-boundary (AVG, beslissing #4).
  const context: ErrorContext = { ...input.context };
  context.stack = stack;
  context.topFrame = topFrame || undefined;
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

  // Cardinaliteits-cap alleen op de untrusted publieke route: een fuzzer met
  // unieke stacks zou anders de tabel vullen. Boven de cap → één overflow-bucket
  // per surface (count++ blijft de volume-indicator).
  if (input.enforceCap) {
    const res = await sb()
      .from('admin_error_groups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    if ((res.count ?? 0) >= CARDINALITY_CAP) {
      row = {
        ...row,
        code: 'OVERFLOW',
        title: `Overflow-bucket (cardinaliteits-cap ${CARDINALITY_CAP} bereikt)`,
        fingerprint: computeFingerprint({ surface: input.surface, code: 'OVERFLOW', organizationId: null }),
      };
    }
  }

  const { error } = await sb().rpc('admin_error_capture', {
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
    // Alleen loggen — NOOIT opnieuw captureError aanroepen (geen recursie).
    console.error('[captureError] rpc error:', error.message);
  }
}

/** Capture een fout-voorval. Fire-and-forget, returnt void, throwt nooit, voegt
 *  geen latency toe aan het request-pad. Gebruikt after() in request-scope zodat
 *  de serverless-functie levend blijft tot de write klaar is; daarbuiten
 *  (cron/instrumentation) een gewone niet-awaited promise. */
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
      console.error('[captureError] failed:', e instanceof Error ? e.message : e);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

// Registreer de DB-sink zodat lib/errors/action.ts (via getSink()) hier niet
// rechtstreeks van hoeft af te hangen. Geladen bij boot via instrumentation.ts.
registerSink({ capture: (event: ErrorEvent) => captureError(event) });
