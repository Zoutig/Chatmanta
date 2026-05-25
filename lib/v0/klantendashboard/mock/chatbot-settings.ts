// Mock chatbot-settings (gedrag, taal, fallback) per V0 sandbox-org.
//
// In V0 leeft de echte system-prompt + persona-config per bot-versie in
// lib/v0/server/bots.ts en lib/v0/server/persona.ts. Voor het klantendashboard
// is het beter om een klantvriendelijke abstractie te tonen (tone-of-voice
// dropdown, fallback-bericht textarea) ipv de raw prompts. Deze mock geeft
// daarvoor de default state per org.

import type { OrgSlug } from '../../server/active-org';
import type { ChatbotSettings } from '../types';

const MOCK_SETTINGS: Record<OrgSlug, ChatbotSettings> = {
  'dev-org': {
    chatbotName: 'Demo Bot',
    companyDescription: 'Sandbox-org voor RAG-tuning en demo\'s.',
    welcomeMessage: 'Hoi! Stel je vraag, ik kijk wat ik kan vinden.',
    starterQuestions: [
      'Wat doen jullie?',
      'Hoe kan ik contact opnemen?',
      'Welke diensten bieden jullie aan?',
    ],
    primaryLanguage: 'nl',
    autoDetectLanguage: true,
    toneOfVoice: 'friendly',
    extraInstructions:
      'Antwoord vriendelijk en duidelijk. Houd antwoorden kort. Verwijs bij twijfel naar onze contactpagina.',
    answerLength: 'normal',
    mayMentionPrices: true,
    mayShareContact: true,
    sourceStrictness: 'normal',
    honestAboutUnknown: true,
    fallbackMessage:
      'Ik weet dit niet zeker op basis van de beschikbare informatie. Neem contact met ons op, dan helpen we je graag verder.',
    contactEmail: 'demo@chatmanta.nl',
    contactPhone: '+31 20 123 4567',
    contactPageUrl: 'https://demo.chatmanta.nl/contact',
    unknownAnswerMessage:
      'Daar kan ik niet zeker antwoord op geven. Wil je dat ik je doorverwijs naar een collega?',
  },
  'acme-corp': {
    chatbotName: 'Dakwerken-assistent',
    companyDescription:
      'Familiebedrijf voor dakreparaties, dakvervanging en lekkage-onderzoek in Noord-Holland.',
    welcomeMessage:
      'Welkom bij Dakwerken De Boer. Vraag het de chatbot — bel ons voor spoed.',
    starterQuestions: [
      'Wat kost een dakvervanging?',
      'Werken jullie in mijn regio?',
      'Hoe vraag ik een offerte aan?',
    ],
    primaryLanguage: 'nl',
    autoDetectLanguage: false,
    toneOfVoice: 'professional',
    extraInstructions:
      'Spreek de klant aan met "u". Verwijs voor concrete offertes altijd door naar onze contactpagina.',
    answerLength: 'normal',
    mayMentionPrices: true,
    mayShareContact: true,
    sourceStrictness: 'normal',
    honestAboutUnknown: true,
    fallbackMessage:
      'Ik weet dit niet zeker. Voor een betrouwbaar antwoord kunt u ons bellen op 020-1234567 of het contactformulier invullen.',
    contactEmail: 'info@dakwerkendeboer.nl',
    contactPhone: '+31 20 123 4567',
    contactPageUrl: 'https://dakwerkendeboer.nl/contact',
    unknownAnswerMessage:
      'Daarop kan ik niet betrouwbaar antwoord geven. Belt u ons even op 020-1234567?',
  },
  'globex-inc': {
    chatbotName: 'FysioPlus chat-assistent',
    companyDescription:
      'Fysiotherapie-praktijk in Utrecht-Oost. Algemene fysio, sportfysio en manuele therapie.',
    welcomeMessage:
      'Welkom bij FysioPlus Utrecht. Stel je vraag — ik help je graag verder.',
    starterQuestions: [
      'Hoe maak ik een afspraak?',
      'Wordt fysiotherapie vergoed?',
      'Wat zijn jullie openingstijden?',
    ],
    primaryLanguage: 'nl',
    autoDetectLanguage: true,
    toneOfVoice: 'friendly',
    extraInstructions:
      'Wees warm en geruststellend. Voor medische vragen altijd doorverwijzen naar een fysiotherapeut of huisarts.',
    answerLength: 'normal',
    mayMentionPrices: true,
    mayShareContact: true,
    sourceStrictness: 'strict',
    honestAboutUnknown: true,
    fallbackMessage:
      'Daar kan ik niet zeker antwoord op geven. Wil je een afspraak inplannen? Bel ons op 030-9876543.',
    contactEmail: 'info@fysioplus-utrecht.nl',
    contactPhone: '+31 30 987 6543',
    contactPageUrl: 'https://fysioplus-utrecht.nl/contact',
    unknownAnswerMessage:
      'Dat kan ik niet betrouwbaar beantwoorden. Onze fysiotherapeuten staan je graag persoonlijk te woord.',
  },
  initech: {
    chatbotName: 'Bakker & Vermeer · adviesbot',
    companyDescription:
      'Accountantskantoor voor MKB-ondernemers en particulieren. Administratie, belastingen en advies.',
    welcomeMessage:
      'Welkom bij Bakker & Vermeer. Stel je vraag over belastingen, administratie of onze diensten.',
    starterQuestions: [
      'Wat kost een MKB-administratie?',
      'Tot wanneer kan ik aangifte doen?',
      'Doen jullie ook particuliere aangifte?',
    ],
    primaryLanguage: 'nl',
    autoDetectLanguage: false,
    toneOfVoice: 'professional',
    extraInstructions:
      'Wees zakelijk en nauwkeurig. Geef geen fiscaal advies dat afhangt van persoonlijke situatie — verwijs door.',
    answerLength: 'normal',
    mayMentionPrices: true,
    mayShareContact: true,
    sourceStrictness: 'strict',
    honestAboutUnknown: true,
    fallbackMessage:
      'Ik kan dit niet zeker beantwoorden zonder uw specifieke situatie te kennen. Neem contact op met een van onze adviseurs.',
    contactEmail: 'info@bakkervermeer.nl',
    contactPhone: '+31 70 555 1234',
    contactPageUrl: 'https://bakkervermeer.nl/contact',
    unknownAnswerMessage:
      'Daar kan ik niet betrouwbaar antwoord op geven. Onze adviseurs helpen u graag persoonlijk.',
  },
  // Lege demo-org — neutrale defaults die een nieuwe klant nog mag invullen.
  // companyDescription bewust leeg: de layout leidt de chatbot-status hieruit af
  // (lege omschrijving → status 'concept'), wat klopt voor een verse org.
  'demo-nieuw': {
    chatbotName: 'Mijn assistent',
    companyName: 'Demo Nieuw',
    companyDescription: '',
    welcomeMessage: 'Hoi! Hoe kan ik je helpen?',
    starterQuestions: [
      'Wat doen jullie?',
      'Welke diensten bieden jullie aan?',
      'Hoe kan ik contact opnemen?',
    ],
    primaryLanguage: 'nl',
    autoDetectLanguage: true,
    extraLanguages: [],
    toneOfVoice: 'friendly',
    extraInstructions: '',
    answerLength: 'normal',
    mayMentionPrices: true,
    mayShareContact: true,
    sourceStrictness: 'normal',
    honestAboutUnknown: true,
    fallbackMessage:
      'Ik weet dit niet zeker op basis van de beschikbare informatie. Neem gerust contact met ons op, dan helpen we je graag verder.',
    contactEmail: '',
    contactPhone: '',
    contactPageUrl: '',
    unknownAnswerMessage:
      'Daar kan ik nu geen antwoord op geven. Wil je dat ik je doorverwijs naar een collega?',
  },
};

export function getMockChatbotSettings(orgSlug: OrgSlug): ChatbotSettings {
  return MOCK_SETTINGS[orgSlug] ?? MOCK_SETTINGS['dev-org'];
}
