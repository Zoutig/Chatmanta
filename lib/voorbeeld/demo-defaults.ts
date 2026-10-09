// Vaste waarden van de publieke demo (/voorbeeld): de begininstellingen van de
// chatbot van het fictieve vakantiepark. Pure module (geen React), dus bruikbaar
// in server-code (demo-chat-route, fixtures) én in de client (demo-store).

import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';

export type DemoSettings = V1ChatbotSettings;

export const DEMO_ORG_NAME = 'Vakantiepark De Duinhoeve';
export const DEMO_SITE_PATH = '/voorbeeld/website';

export const DEMO_DEFAULT_SETTINGS: DemoSettings = {
  chatbotName: 'De Duinhoeve',
  companyDescription:
    'Familievakantiepark in de duinen bij Westerduin aan de Zeeuwse kust, met strandhuisjes, lodges, boshuizen, glamping en kampeerplaatsen.',
  welcomeMessage: 'Hoi! Ik beantwoord je vragen over je verblijf op De Duinhoeve. Waar kan ik je mee helpen?',
  starterQuestions: [
    'Mag mijn hond mee?',
    'Hoe laat kan ik inchecken?',
    'Wat kost een week in de Duinlodge?',
    'Is het zwembad ook open in de winter?',
  ],
  showStarterQuestions: true,
  primaryLanguage: 'nl',
  autoDetectLanguage: true,
  toneOfVoice: 'personal',
  extraInstructions: '',
  answerLength: 'normal',
  mayMentionPrices: true,
  mayShareContact: true,
  sourceStrictness: 'normal',
  honestAboutUnknown: true,
  answerGeneralKnowledge: false,
  fallbackMessage:
    'Daar heb ik helaas geen informatie over. Bel of mail gerust met onze receptie, die helpt je graag verder.',
  contactEmail: 'info@duinhoeve.example',
  contactPhone: '0118 000 000',
  contactPageUrl: '/voorbeeld/website/contact',
  unknownAnswerMessage: '',
  accentColor: '#1F4E4A',
  position: 'bottom-right',
  headerTitle: 'De Duinhoeve',
  launcherText: 'Vragen over je verblijf?',
  logoStyle: 'chat-bubble',
  customLogoDataUrl: null,
  theme: 'light',
  subtitle: 'Meestal direct antwoord',
  contactRequestsEnabled: true,
  notificationEmail: '',
};

