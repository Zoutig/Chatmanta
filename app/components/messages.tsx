'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { Icon } from './svg-icons';
import type { ChatResponse, PipelinePhase } from '@/lib/v0/server/rag';

const PHASE_LABELS: Record<PipelinePhase, string> = {
  cache: 'Geheugen raadplegen',
  preprocess: 'Vraag begrijpen',
  decompose: 'Vraag opdelen in onderdelen',
  hyde: 'Hypothetisch antwoord schetsen',
  expand: 'Zoekvragen genereren',
  embed: 'Vraag omzetten naar vector',
  retrieve: 'Documenten zoeken',
  rerank: 'Beste fragmenten kiezen',
  answer: 'Antwoord schrijven',
  reflect: 'Antwoord controleren',
  cascade: 'Sterker model raadplegen',
  followups: 'Vervolgvragen bedenken',
};

/** Mirror van parseV03Output uit lib/v0/server/rag.ts (server-only). */
function parseStreamingV03(raw: string): { thinking: string | null; answer: string } {
  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const answerMatch = raw.match(/<answer>([\s\S]*?)(?:<\/answer>|$)/i);
  let answer = answerMatch?.[1] ?? '';
  if (!answerMatch) {
    if (thinkingMatch) {
      answer = raw.slice(raw.indexOf('</thinking>') + 11);
    } else {
      answer = raw;
    }
  }
  answer = answer.replace(/<confidence>[\s\S]*$/i, '');
  return {
    thinking: thinkingMatch?.[1]?.trim() ?? null,
    answer: answer.trim(),
  };
}

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="msg-user slide-in">
      <div className="msg-user-bubble">{content}</div>
    </div>
  );
}

export function PhaseLive({ phase }: { phase: PipelinePhase }) {
  return (
    <div
      className="pipeline-trail"
      style={{
        background: 'var(--accent-soft)',
        borderColor: 'color-mix(in oklab, var(--accent) 25%, transparent)',
        color: 'var(--accent)',
      }}
    >
      <span className="ripple-dot" />
      <span style={{ fontWeight: 500 }}>{PHASE_LABELS[phase]}…</span>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? 'high' : value >= 0.5 ? 'mid' : 'low';
  return <span className={`confidence-badge ${tone}`}>conf {pct}%</span>;
}

function CitedText({
  text,
  sourceCount,
  activeCite,
  onCiteClick,
}: {
  text: string;
  sourceCount: number;
  activeCite: number | null;
  onCiteClick?: (idx: number) => void;
}) {
  const parts = useMemo(() => {
    const out: { kind: 'text' | 'cite'; value: string | number; key: number }[] = [];
    const re = /\[(\d+)\]/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let key = 0;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index), key: key++ });
      out.push({ kind: 'cite', value: parseInt(m[1], 10), key: key++ });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', value: text.slice(last), key: key++ });
    return out;
  }, [text]);

  return (
    <>
      {parts.map((p) => {
        if (p.kind === 'text') {
          return <RichText key={p.key} baseKey={p.key} text={String(p.value)} />;
        }
        const num = p.value as number;
        const valid = num >= 1 && num <= sourceCount;
        return (
          <a
            key={p.key}
            className={`cite${activeCite === num ? ' active' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              if (valid) onCiteClick?.(num);
            }}
            style={!valid ? { opacity: 0.5, cursor: 'default' } : undefined}
            title={valid ? `Bron ${num}` : `chunk ${num}`}
          >
            {num}
          </a>
        );
      })}
    </>
  );
}

/** Mini-markdown: **bold** en `code` inline. */
function RichText({ text, baseKey }: { text: string; baseKey: number }) {
  const out: React.ReactNode[] = [];
  let buf = '';
  let i = 0;
  let k = 0;
  while (i < text.length) {
    if (text.slice(i, i + 2) === '**') {
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        if (buf) {
          out.push(<span key={`${baseKey}-${k++}`}>{buf}</span>);
          buf = '';
        }
        out.push(<strong key={`${baseKey}-${k++}`}>{text.slice(i + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        if (buf) {
          out.push(<span key={`${baseKey}-${k++}`}>{buf}</span>);
          buf = '';
        }
        out.push(
          <code
            key={`${baseKey}-${k++}`}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9em',
              background: 'var(--surface-2)',
              padding: '1px 5px',
              borderRadius: 4,
              color: 'var(--accent)',
            }}
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  if (buf) out.push(<span key={`${baseKey}-${k++}`}>{buf}</span>);
  return <>{out}</>;
}

function MessageBody({
  markdown,
  sourceCount,
  activeCite,
  onCiteClick,
}: {
  markdown: string;
  sourceCount: number;
  activeCite: number | null;
  onCiteClick?: (idx: number) => void;
}) {
  // Split op double-newlines voor paragrafen; bullets gedetecteerd op start.
  type Block =
    | { kind: 'p'; text: string }
    | { kind: 'h'; text: string }
    | { kind: 'ul'; items: string[] };
  const blocks = useMemo<Block[]>(() => {
    const lines = markdown.split('\n');
    const out: Block[] = [];
    let para: string[] = [];
    let bullets: string[] = [];
    const flushPara = () => {
      if (para.length) {
        out.push({ kind: 'p', text: para.join(' ') });
        para = [];
      }
    };
    const flushBullets = () => {
      if (bullets.length) {
        out.push({ kind: 'ul', items: bullets });
        bullets = [];
      }
    };
    for (const ln of lines) {
      if (/^[•\-*]\s/.test(ln.trim())) {
        flushPara();
        bullets.push(ln.trim().replace(/^[•\-*]\s/, ''));
      } else if (ln.trim() === '') {
        flushPara();
        flushBullets();
      } else if (/^\*\*[^*]+:?\*\*$/.test(ln.trim())) {
        flushPara();
        flushBullets();
        out.push({ kind: 'h', text: ln.trim().replace(/\*\*/g, '') });
      } else {
        flushBullets();
        para.push(ln);
      }
    }
    flushPara();
    flushBullets();
    return out;
  }, [markdown]);

  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === 'p') {
          return (
            <p key={i}>
              <CitedText
                text={b.text}
                sourceCount={sourceCount}
                activeCite={activeCite}
                onCiteClick={onCiteClick}
              />
            </p>
          );
        }
        if (b.kind === 'h') {
          return (
            <p key={i}>
              <strong>{b.text}</strong>
            </p>
          );
        }
        return (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>
                <CitedText
                  text={it}
                  sourceCount={sourceCount}
                  activeCite={activeCite}
                  onCiteClick={onCiteClick}
                />
              </li>
            ))}
          </ul>
        );
      })}
    </>
  );
}

export function AssistantMessage({
  response,
  streamingText,
  pending,
  livePhase,
  activeCite,
  onCiteClick,
  onFollowUp,
  onRegenerate,
}: {
  response: ChatResponse;
  streamingText: string | null;
  pending: boolean;
  livePhase: PipelinePhase | null;
  activeCite: number | null;
  onCiteClick: (idx: number) => void;
  onFollowUp: (q: string) => void;
  onRegenerate?: () => void;
}) {
  // V0.3: tijdens stream kan tekst <thinking>/<answer>/<confidence> bevatten.
  const parsedStreaming = streamingText !== null ? parseStreamingV03(streamingText) : null;
  const displayText = parsedStreaming !== null ? parsedStreaming.answer : response.answer;
  const stillThinking =
    parsedStreaming !== null &&
    parsedStreaming.thinking !== null &&
    parsedStreaming.answer.length === 0;

  const extras = response.kind === 'answer' ? response.extras : undefined;
  const sourceCount = response.kind === 'smalltalk' ? 0 : response.sources.length;
  const isStreaming = streamingText !== null;

  const rewriteToShow =
    response.kind !== 'smalltalk' &&
    response.rewrite &&
    response.rewrite.rewritten !== response.rewrite.original
      ? response.rewrite.rewritten
      : null;

  return (
    <div className="msg-assistant slide-in">
      <div className="msg-head">
        <div className="msg-avatar" aria-hidden="true">
          <Image src="/logo/mark.png" alt="" width={510} height={270} />
        </div>
        <div className="msg-meta">
          <span>ChatManta</span>
          <span style={{ color: 'var(--fg-faint)' }}>·</span>
          <span>{response.botVersion}</span>
          {response.kind === 'fallback' ? (
            <>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <span className="kind-chip fallback">Fallback</span>
            </>
          ) : null}
          {response.kind === 'smalltalk' ? (
            <>
              <span style={{ color: 'var(--fg-faint)' }}>·</span>
              <span className="kind-chip smalltalk">Smalltalk</span>
            </>
          ) : null}
          {extras?.fromCache ? <span className="kind-chip cache">Cache</span> : null}
          {extras?.cascadeUsed ? <span className="kind-chip cascade">Cascade</span> : null}
          {extras?.confidence !== undefined && !isStreaming ? (
            <ConfidenceBadge value={extras.confidence} />
          ) : null}
        </div>
      </div>

      {livePhase ? <PhaseLive phase={livePhase} /> : null}

      {rewriteToShow ? (
        <div className="rewrite-banner">
          <span className="label">Rewritten</span>
          <span style={{ fontStyle: 'italic' }}>{rewriteToShow}</span>
        </div>
      ) : null}

      {extras?.subQueries && extras.subQueries.length > 1 && !isStreaming ? (
        <details className="pipeline-detail" style={{ width: 'fit-content', maxWidth: '100%' }}>
          <summary
            style={{
              cursor: 'pointer',
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="caret" size={11} /> Sub-vragen · {extras.subQueries.length}
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            {extras.subQueries.map((q, i) => (
              <div key={i} className="pipeline-row" style={{ gridTemplateColumns: '14px 1fr' }}>
                <span className="step-dot" style={{ background: 'var(--accent-2)' }} />
                <span style={{ color: 'var(--fg-muted)' }}>{q}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="msg-body">
        {stillThinking ? (
          <p style={{ color: 'var(--fg-muted)', fontStyle: 'italic' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginRight: 6,
              }}
            >
              Denkt
            </span>
            aan het nadenken…
          </p>
        ) : (
          <>
            <MessageBody
              markdown={displayText}
              sourceCount={sourceCount}
              activeCite={activeCite}
              onCiteClick={onCiteClick}
            />
            {isStreaming && pending ? <span className="streaming-cursor" /> : null}
          </>
        )}
      </div>

      {!isStreaming ? (
        <>
          {extras?.followUps && extras.followUps.length > 0 ? (
            <div className="followups">
              {extras.followUps.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  className="followup-chip"
                  onClick={() => onFollowUp(q)}
                >
                  <span style={{ color: 'var(--accent)', marginRight: 6 }}>↗</span>
                  {q}
                </button>
              ))}
            </div>
          ) : null}

          <div className="msg-actions">
            <button
              type="button"
              className="msg-action"
              onClick={() => navigator.clipboard?.writeText(response.answer)}
              title="Kopieer antwoord"
            >
              <Icon name="copy" size={12} /> Kopieer
            </button>
            {onRegenerate ? (
              <button
                type="button"
                className="msg-action"
                onClick={onRegenerate}
                title="Vraag opnieuw stellen"
              >
                <Icon name="refresh" size={12} /> Regenereer
              </button>
            ) : null}
            <span style={{ flex: 1 }} />
            <span className="msg-action" style={{ cursor: 'default' }}>
              ${response.totalCostUsd.toFixed(6)}
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="msg-error slide-in">
      <span className="label">Fout</span>
      {message}
    </div>
  );
}
