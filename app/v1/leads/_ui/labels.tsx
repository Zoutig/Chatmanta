import type { Lead } from '@/lib/leads/types';
import { LABEL_TEKST } from '@/lib/leads/types';

export function LeadLabels({ lead }: { lead: Pick<Lead, 'labels' | 'heeft_chatbot' | 'chatbot_naam' | 'score_voorlopig' | 'score'> }) {
  return (
    <>
      {lead.heeft_chatbot ? <span className="ld-label" data-tone="warn">Chatbot{lead.chatbot_naam ? `: ${lead.chatbot_naam}` : ''}</span> : null}
      {lead.labels.map((l) => (
        <span key={l} className="ld-label">
          {LABEL_TEKST[l] ?? l}
        </span>
      ))}
    </>
  );
}
