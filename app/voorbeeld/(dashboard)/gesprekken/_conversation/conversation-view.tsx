// Inhoud van één gesprek, gedeeld door de volledige pagina (gesprekken/[id]) en
// het zijpaneel (@drawer/(.)[id]). Server component; alleen de interactieve
// stukjes (bronnen, acties, ID kopiëren) zijn client components.
//
// Volgorde (spec 7.3 + bijlage A "Gesprek detail"): bij een onbeantwoorde vraag
// één regel bovenaan met "Antwoord geven"; dan de berichten als chatbubbels
// (bezoeker rechts, chatbot links) met per bot-antwoord ingeklapte bronnen;
// dan de afhandel-actie; het gesprek-ID klein onderaan.

import Link from 'next/link';
import { renderMarkdownLite } from '@/lib/widget/render-markdown-lite';
import { AttentionBlock } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import type { LoadedConversation } from './load';
import { formatLong, qaHref } from './format';
import { SourcesPanel } from './sources-panel';
import { ConversationActions } from './conversation-actions';
import { ConversationId } from './conversation-id';

export function ConversationView({ detail, isUnanswered, questionForQA }: LoadedConversation) {
  const { thread, messages } = detail;
  const count = messages.length;

  return (
    <div className="v1-gs-convo">
      <p className="v1-gs-meta">
        Gestart op {formatLong(thread.createdAt)} · {count} {count === 1 ? 'bericht' : 'berichten'}
      </p>

      {isUnanswered ? (
        <AttentionBlock
          level="attention"
          title="Je chatbot kon deze vraag niet beantwoorden"
          actions={
            questionForQA ? (
              <Link href={qaHref(questionForQA)} className={buttonClass({ size: 'sm' })}>
                Antwoord geven
              </Link>
            ) : undefined
          }
        />
      ) : null}

      <ol className="v1-gs-chat" aria-label="Berichten">
        {messages.map((m) => {
          const isUser = m.role === 'user';
          return (
            <li key={m.id} className="v1-gs-msg" data-role={isUser ? 'user' : 'bot'}>
              <div className="v1-gs-bubble" data-flagged={m.kind === 'fallback' ? '' : undefined}>
                <span className="v1-sr-only">{isUser ? 'Bezoeker: ' : 'Chatbot: '}</span>
                {/* Bot-antwoorden via dezelfde XSS-veilige lite-renderer als de widget. */}
                {isUser ? m.content : renderMarkdownLite(m.content, undefined, false)}
              </div>
              {!isUser && m.sources ? <SourcesPanel sources={m.sources} /> : null}
            </li>
          );
        })}
      </ol>

      <ConversationActions threadId={thread.id} suggestedQuestion={questionForQA} isUnanswered={isUnanswered} />

      <ConversationId id={thread.id} />
    </div>
  );
}
