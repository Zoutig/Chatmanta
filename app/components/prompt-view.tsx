'use client';

// Live render van de samengestelde system prompt. Gebruikt dezelfde
// buildSystemPrompt als de RAG-laag, dus geen drift mogelijk tussen wat hier
// staat en wat naar het model gaat.

import { useState } from 'react';
import { Icon } from './svg-icons';
import { buildStyleSuffix, buildSystemPrompt, type OutputStyleVersion } from '@/lib/v0/style';
import type { Length, Tone } from '@/lib/v0/style-types';
import { STYLE_LABELS } from './style-labels';

export function PromptView({
  botVersion,
  botSystemPrompt,
  tone,
  length,
  outputStyleVersion,
}: {
  botVersion: string;
  botSystemPrompt: string;
  tone: Tone;
  length: Length;
  outputStyleVersion?: OutputStyleVersion;
}) {
  const suffix = buildStyleSuffix({ tone, length }, outputStyleVersion);
  const final = buildSystemPrompt(botSystemPrompt, { tone, length }, outputStyleVersion);

  return (
    <div>
      <div className="settings-section">
        <div className="prompt-meta-row">
          <div className="prompt-meta">
            <span className="prompt-meta-label">Bot</span>
            <span className="prompt-meta-value">{botVersion}</span>
            <span className="prompt-meta-sep">·</span>
            <span className="prompt-meta-label">Toon</span>
            <span className="prompt-meta-value">{STYLE_LABELS.tone[tone]}</span>
            <span className="prompt-meta-sep">·</span>
            <span className="prompt-meta-label">Lengte</span>
            <span className="prompt-meta-value">{STYLE_LABELS.length[length]}</span>
          </div>
          <CopyButton text={final} />
        </div>
      </div>

      <PromptBlock title="Base prompt (uit bot-config)" body={botSystemPrompt} />
      <PromptBlock title="Stijl-suffix (live)" body={suffix} />
      <PromptBlock title="Final (wordt naar het model gestuurd)" body={final} />
    </div>
  );
}

function PromptBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="settings-section">
      <div className="settings-label">{title}</div>
      <pre className="prompt-block">{body}</pre>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="composer-tool"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          // browser blokkeert clipboard — silent
        }
      }}
      title="Kopieer final prompt"
    >
      <Icon name={copied ? 'check' : 'copy'} size={12} />
      {copied ? ' gekopieerd' : ' kopieer'}
    </button>
  );
}
