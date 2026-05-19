import type {
  ChatbotStatus,
  WidgetStatus,
  WebsitePageStatus,
  DocumentStatus,
  ConversationStatus,
} from '@/lib/v0/klantendashboard/types';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

const CHATBOT_LABEL: Record<ChatbotStatus, { label: string; tone: Tone }> = {
  concept: { label: 'Concept', tone: 'neutral' },
  testing: { label: 'Testen', tone: 'info' },
  live: { label: 'Live', tone: 'success' },
  paused: { label: 'Gepauzeerd', tone: 'warning' },
};

const WIDGET_LABEL: Record<WidgetStatus, { label: string; tone: Tone }> = {
  not_installed: { label: 'Nog niet geplaatst', tone: 'warning' },
  detected: { label: 'Gevonden op website', tone: 'info' },
  active: { label: 'Actief', tone: 'success' },
};

const WEBPAGE_LABEL: Record<WebsitePageStatus, { label: string; tone: Tone }> = {
  active: { label: 'Actief', tone: 'success' },
  disabled: { label: 'Uitgeschakeld', tone: 'neutral' },
  error: { label: 'Fout', tone: 'danger' },
  processing: { label: 'Wordt verwerkt', tone: 'info' },
};

const DOC_LABEL: Record<DocumentStatus, { label: string; tone: Tone }> = {
  ready: { label: 'Verwerkt', tone: 'success' },
  processing: { label: 'Wordt verwerkt', tone: 'info' },
  error: { label: 'Fout', tone: 'danger' },
};

const CONV_LABEL: Record<ConversationStatus, { label: string; tone: Tone }> = {
  answered: { label: 'Beantwoord', tone: 'success' },
  unanswered: { label: 'Onbeantwoord', tone: 'warning' },
  feedback: { label: 'Feedback', tone: 'info' },
};

type StatusBadgeProps =
  | { status: ChatbotStatus; kind?: 'chatbot' }
  | { status: WidgetStatus; kind: 'widget' }
  | { status: WebsitePageStatus; kind: 'webpage' }
  | { status: DocumentStatus; kind: 'document' }
  | { status: ConversationStatus; kind: 'conversation' }
  | { label: string; tone: Tone; kind: 'custom' };

export function StatusBadge(props: StatusBadgeProps) {
  let label: string;
  let tone: Tone;

  if (props.kind === 'custom') {
    label = props.label;
    tone = props.tone;
  } else if (props.kind === 'widget') {
    ({ label, tone } = WIDGET_LABEL[props.status]);
  } else if (props.kind === 'webpage') {
    ({ label, tone } = WEBPAGE_LABEL[props.status]);
  } else if (props.kind === 'document') {
    ({ label, tone } = DOC_LABEL[props.status]);
  } else if (props.kind === 'conversation') {
    ({ label, tone } = CONV_LABEL[props.status]);
  } else {
    ({ label, tone } = CHATBOT_LABEL[props.status]);
  }

  return (
    <span className="klant-status" data-tone={tone}>
      {label}
    </span>
  );
}
