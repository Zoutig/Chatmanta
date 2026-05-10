'use client';

// Claims-tab in de RightPanel + gedeelde ClaimsList die ook in de inline
// breakdown onder een AssistantMessage gebruikt wordt.

import type { ChatResponse, ChatSource, ClaimVerificationData } from '@/lib/v0/server/rag';
import {
  CLAIM_STATUS_LABEL,
  classifyClaim,
  summarizeClaims,
  type ClaimStatus,
} from '@/lib/v0/claim-display';
import { Icon } from './svg-icons';

export function ClaimsView({
  response,
  onCiteClick,
}: {
  response: ChatResponse | null;
  onCiteClick: (idx: number) => void;
}) {
  if (!response || response.kind !== 'answer') {
    return <EmptyState message="Stel een vraag — claim-verificatie verschijnt hier." />;
  }

  const extras = response.extras;
  const claims = extras?.claims;
  const threshold = extras?.claimVerificationThreshold ?? 0.7;

  if (!claims) {
    return (
      <EmptyState message="Claim-verificatie staat uit voor deze bot-versie. Schakel naar v0.4 voor per-claim grounding." />
    );
  }
  if (claims.length === 0) {
    return (
      <EmptyState message="Antwoord bevat geen verifieerbare claims (te kort, alleen smalltalk, of alleen citaties)." />
    );
  }

  const summary = summarizeClaims(claims, threshold);

  return (
    <div>
      <div className="claims-header">
        <div className="claims-header-row">
          <span className="claims-header-label">Grounding</span>
          <span className={`claims-header-tone ${summary.tone}`}>
            {summary.verified}/{summary.total}
            <span className="claims-header-pct">
              {Number.isFinite(summary.ratio) ? ` · ${Math.round(summary.ratio * 100)}%` : ''}
            </span>
          </span>
        </div>
        <div className="claims-header-meta">
          {summary.partial > 0 ? `${summary.partial} deels · ` : ''}
          {summary.unverified > 0 ? `${summary.unverified} ongegrond · ` : ''}
          drempel {threshold.toFixed(2)} · {response.botVersion}
        </div>
      </div>

      <ClaimsList claims={claims} threshold={threshold} sources={response.sources} onCiteClick={onCiteClick} />
    </div>
  );
}

/**
 * Gedeelde lijst-renderer. Wordt zowel door de full Claims-tab als door de
 * inline breakdown onder een AssistantMessage gebruikt — één bron voor de
 * styling en interaction.
 */
export function ClaimsList({
  claims,
  threshold,
  sources,
  onCiteClick,
}: {
  claims: ClaimVerificationData[];
  threshold: number;
  sources: ChatSource[];
  onCiteClick: (idx: number) => void;
}) {
  // Map chunk-id → 1-based source index voor de "→ bron N" link.
  const idToSourceIdx = new Map<string, number>();
  sources.forEach((s, i) => {
    if (s.id) idToSourceIdx.set(s.id, i + 1);
  });

  return (
    <div className="claims-list">
      {claims.map((c) => {
        const status = classifyClaim(c.bestSimilarity, threshold);
        const sourceIdx = c.bestChunkId ? idToSourceIdx.get(c.bestChunkId) ?? null : null;
        const bestSource = sourceIdx !== null ? sources[sourceIdx - 1] : null;
        return (
          <div key={c.index} className={`claim-row claim-${status}`}>
            <div className="claim-row-head">
              <StatusIcon status={status} />
              <p className="claim-text">{c.text}</p>
            </div>
            <SimBar similarity={c.bestSimilarity} threshold={threshold} status={status} />
            {bestSource ? (
              <button
                type="button"
                className="claim-source-link"
                onClick={() => onCiteClick(sourceIdx!)}
                title="Open deze bron in de Bronnen-tab"
              >
                <span className="claim-source-num">→ bron {sourceIdx}</span>
                <span className="claim-source-snippet">
                  {bestSource.contentExcerpt.slice(0, 140)}
                  {bestSource.contentExcerpt.length > 140 ? '…' : ''}
                </span>
              </button>
            ) : (
              <div className="claim-source-link claim-source-none">
                <span className="claim-source-num">geen bron in retrieval</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusIcon({ status }: { status: ClaimStatus }) {
  if (status === 'verified') {
    return (
      <span className="claim-status claim-status-verified" title={CLAIM_STATUS_LABEL[status]}>
        <Icon name="check" size={12} />
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="claim-status claim-status-partial" title={CLAIM_STATUS_LABEL[status]}>
        ~
      </span>
    );
  }
  return (
    <span className="claim-status claim-status-unverified" title={CLAIM_STATUS_LABEL[status]}>
      <Icon name="x" size={12} />
    </span>
  );
}

function SimBar({
  similarity,
  threshold,
  status,
}: {
  similarity: number;
  threshold: number;
  status: ClaimStatus;
}) {
  const pct = Math.max(0, Math.min(1, similarity)) * 100;
  const thresholdPct = Math.max(0, Math.min(1, threshold)) * 100;
  return (
    <div className="claim-sim-bar" aria-label={`similarity ${similarity.toFixed(3)}`}>
      <div className={`claim-sim-fill claim-sim-${status}`} style={{ width: `${pct}%` }} />
      <div
        className="claim-sim-threshold"
        style={{ left: `${thresholdPct}%` }}
        title={`drempel ${threshold.toFixed(2)}`}
      />
      <span className="claim-sim-value">{similarity.toFixed(2)}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="claims-empty">
      <p>{message}</p>
    </div>
  );
}
