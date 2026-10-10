'use client';

// ChatManta-widget voor de /widget demo-pagina.
//
// FAB rechtsonder → open/dicht-paneel met streaming-chat tegen /api/v0/chat.
// FAB toont het ChatManta brand-mark logo, pulseert subtiel als gesloten,
// en heeft een tooltip "Hoi! Heb je een vraag?" die ~4s na page-load
// éénmalig pop-upt en bij hover terugkomt. Suggested-questions chips bij
// eerste opening. "Powered by ChatManta"-footer.
//
// MVP-scope: alleen het kale chat-pad. Geen bronnen-view, geen claim-tabs,
// geen latency-snapshot — die zijn admintool-features. Sources/claims/etc.
// in StreamEvents worden bewust genegeerd.
//
// Streaming-pattern is overgenomen uit app/components/chat-shell.tsx:230-360.
// React 19 batched updates → flushSync per delta voor zichtbare streaming.

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ChatResponse } from '@/lib/v0/server/rag';
// Alleen het TYPE — het contact-offer event-payload (incl. consentText) komt via
// de stream binnen, géén runtime-import. Zie lib/v0/server/contact-offer.ts.
import type { ContactOfferPrefill } from '@/lib/v0/server/contact-offer';
// C4 (v0.10) — canonieke code→leesbare-NL-melding mapping. Pure modules (geen
// server-only), dus veilig in de client/embed-bundle.
import { fromWire } from '@/lib/errors/app-error';
import { userView } from '@/lib/errors/user-messages';
import { FeedbackButtons, type FeedbackState } from './feedback-buttons';
import { formatAccentText } from '@/lib/widget/format-accent';
import { cleanWidgetAnswer, renderMarkdownLite } from '@/lib/widget/render-markdown-lite';
import { bestForegroundOn } from '@/lib/widget/contrast';
import { LocalStorageThreadStore } from '@/lib/widget/thread-store';
import { getOrCreateVisitorId } from '@/lib/widget/visitor-id';
import type { Thread } from '@/lib/widget/thread-types';
import { ThreadDrawer } from './thread-drawer';

type Message =
  | { role: 'user'; content: string; id: string }
  | {
      role: 'assistant';
      content: string;
      id: string;
      streaming?: boolean;
      error?: string;
      // V0.7+ feedback: queryLogId komt binnen via het 'meta'-event vóór de
      // eerste delta; feedbackState start op 'idle' en wordt door FeedbackButtons-
      // callbacks gepromoot tot comment-open/submitting/sent-*/error.
      queryLogId?: string;
      feedbackState?: FeedbackState;
      feedbackComment?: string;
      // Contactverzoeken (M2): bij een 'contact-offer' stream-event zetten we dit
      // op de antwoord-bubble. Eerst tonen we een aanbod-bubble met "Ja"-knop;
      // bij "Ja" rendert ÉÉN ContactFormCard. BEWUST één variant — geen generieke
      // card-discriminator (scope-pin, zie SPEC "buiten scope").
      contactCard?: { prefill: ContactOfferPrefill; consentText: string };
    };

export type ChatMantaWidgetProps = {
  orgSlug: string;
  botVersion: string;
  companyName: string;
  primaryColor: string;
  suggested: string[];
  /**
   * Klantendashboard-overrides — komen via /widget/[slug]/layout.tsx uit
   * `v0_org_settings.widget`. Optioneel: ontbrekende velden vallen terug op
   * de skin- of widget-defaults.
   */
  position?: 'bottom-right' | 'bottom-left';
  /** Override de header-titel (default: companyName). */
  headerTitle?: string;
  /** Optionele subtitel onder de header-titel. */
  headerSubtitle?: string;
  /** Als false → render niets (klant heeft de widget gepauzeerd). */
  isActive?: boolean;
  /** Granulaire kleur-overrides — fallback op primaryColor wanneer ongezet. */
  logoColor?: string;
  widgetBgColor?: string; // FAB-knop achtergrond (default wit)
  pulseColor?: string;
  /**
   * Toggle voor de pulse-animatie. Default `true` — false verbergt de ring.
   */
  pulseEnabled?: boolean;
  headerColor?: string; // header + send-button + user-bubble
  /** Welk icoon op de FAB? */
  logoStyle?: 'brand-mark' | 'chat-bubble' | 'custom-logo';
  /** Base64 data-URL voor 'custom-logo'. */
  customLogoDataUrl?: string | null;
  /**
   * Naam waarmee de bot zich identificeert in de UI (klantendashboard
   * `chatbot-instellingen → chatbotName`). Wordt boven het welkomstbericht
   * gerenderd. Leeg/undefined → val terug op `companyName`.
   */
  chatbotName?: string;
  /**
   * Eerste bot-bubble bij een lege chat. Wanneer ingevuld vervangt het de
   * hardcoded "Hoi! Ik ben de digitale assistent van X. Stel je vraag…"-
   * tekst. Bij leeg/undefined valt de UI terug op die default-copy zodat
   * de demo zonder klantendashboard-data nog steeds prettig leest.
   */
  welcomeMessage?: string;
  /**
   * Tooltip-tekst boven de chat-knop (klantendashboard → widget →
   * "Tekst op chatknop"). Mag enkele-sterretjes-accenten bevatten:
   * `Hoi! *Stel je vraag*` → "Hoi! " plain + "Stel je vraag" bold in
   * accent-kleur. Leeg/undefined → terugval op de oude hardcoded copy
   * ("Hoi! Heb je een vraag?") zodat de demo zonder klant-data klopt.
   */
  launcherText?: string;
  /** Embedded in een iframe-loader → stuur resize-postMessage naar de parent. */
  embedded?: boolean;
  /** Origin van de parent-loader (voor de postMessage-target). Default '*'. */
  parentOrigin?: string;
  /** Kortlevend embed-token; meegestuurd als x-chatmanta-embed op chat-fetches. */
  embedToken?: string;
};

export function ChatMantaWidget({
  orgSlug,
  botVersion,
  companyName,
  primaryColor,
  suggested,
  position = 'bottom-right',
  headerTitle,
  headerSubtitle,
  isActive = true,
  logoColor,
  widgetBgColor,
  pulseColor,
  pulseEnabled = true,
  headerColor,
  logoStyle = 'brand-mark',
  customLogoDataUrl,
  chatbotName,
  welcomeMessage,
  launcherText,
  embedded = false,
  parentOrigin = '*',
  embedToken,
}: ChatMantaWidgetProps) {
  // Side-aware positioning voor tooltip. FAB/panel-positie wordt verderop
  // berekend met safe-area-inset + mobile-fullscreen-detectie.
  const tooltipSideStyle = position === 'bottom-left' ? { left: 0 } : { right: 0 };
  // Het pijltje wijst naar de FAB → bij links-onder aan de linkerkant, bij
  // rechts-onder aan de rechterkant (zelfde patroon als fabSideStyle hieronder).
  const tooltipArrowStyle = position === 'bottom-left' ? { left: 22 } : { right: 22 };
  const displayTitle = headerTitle?.trim() || companyName;
  // Tooltip-tekst: klant-input (kan `*woord*`-accenten bevatten) of de
  // oude default met accent op het laatste deel — zelfde parser zodat de
  // render-paden niet uit elkaar lopen.
  const tooltipText = launcherText?.trim() || 'Hoi! *Heb je een vraag?*';

  // Granulaire kleur-resolutie met primaryColor als fallback. Eén plek om de
  // semantiek te lezen i.p.v. tien `?? primaryColor` ternaries verspreid in JSX.
  const c = {
    logo: logoColor || primaryColor,
    widgetBg: widgetBgColor || '#ffffff',
    pulse: pulseColor || primaryColor,
    header: headerColor || primaryColor,
  };
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [tooltipHovered, setTooltipHovered] = useState(false);
  // <640px = mobiel/smartphone-viewport; paneel rendert fullscreen i.p.v.
  // 380×560-bubbel. Default false zodat de SSR-render desktop-layout houdt;
  // mediaQuery wordt na hydration toegepast.
  const [isMobile, setIsMobile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Focus-beheer: FAB-knop om focus naar terug te zetten bij sluiten, dialog-
  // root voor de focus-trap, en een flag zodat de focus-return niet bij de
  // initiële mount (open=false) afgaat.
  const fabRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  // Huidige embed-token. Ref i.p.v. state: refresh mag de volgende fetch
  // beïnvloeden zonder re-render en zonder stale closure in `send`.
  const embedTokenRef = useRef(embedToken);
  // Stabiele, cookie-onafhankelijke visitor-id voor thread-grouping op externe
  // sites (zie lib/widget/visitor-id.ts). Lazy-geïnit in postChat — client-only.
  const visitorIdRef = useRef<string | null>(null);

  // Thread-state. `storeRef` is null tot na hydration zodat SSR niet probeert
  // localStorage te lezen. `activeThreadId` = null betekent "fresh chat" — pas
  // bij het eerste user-bericht wordt een thread écht aangemaakt, zodat we geen
  // lege spook-threads in de drawer-lijst krijgen.
  const storeRef = useRef<LocalStorageThreadStore | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Embedded: de iframe-viewport (~420px) zegt niets over het échte scherm.
    // De loader (public/widget.js) draait in de hostpagina, kent de hostbreedte
    // en stuurt 'm via postMessage. Init uit ?m=1 (anti-flits), daarna updates
    // via 'chatmanta:host'. We posten 'chatmanta:ready' zodat de loader meteen
    // de status terugstuurt (sluit de race met onze listener).
    if (embedded) {
      setIsMobile(new URLSearchParams(window.location.search).get('m') === '1');
      const onMsg = (e: MessageEvent) => {
        if (e.source !== window.parent) return;
        const d = e.data as { type?: string; mobile?: unknown } | null;
        if (!d || d.type !== 'chatmanta:host') return;
        setIsMobile(Boolean(d.mobile));
      };
      window.addEventListener('message', onMsg);
      try {
        window.parent.postMessage({ type: 'chatmanta:ready' }, parentOrigin);
      } catch {
        // parent niet bereikbaar — init uit ?m=1 blijft staan
      }
      return () => window.removeEventListener('message', onMsg);
    }
    // Niet-embedded (eigen /widget-omgeving): de eigen viewport klopt wél.
    const mq = window.matchMedia('(max-width: 639px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [embedded, parentOrigin]);

  // Init thread-store na hydration. localStorage is alleen client-side
  // beschikbaar — vandaar de useEffect-guard. Bij eerste mount:
  //   1. construct store voor (orgSlug, botVersion)
  //   2. lees alle threads in voor de drawer
  //   3. lees activeId; als het een bestaande thread is → laad messages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const store = new LocalStorageThreadStore(orgSlug, botVersion);
    storeRef.current = store;
    const all = store.list();
    setThreads(all);
    const id = store.getActiveId();
    const active = id ? store.get(id) : null;
    if (active) {
      setActiveThreadId(active.id);
      setMessages(active.messages.map((m) => ({ ...m, streaming: false })));
    }
  }, [orgSlug, botVersion]);

  // Auto-scroll naar onderkant bij nieuwe content.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // Focus-beheer rond open/dicht. Bij openen: focus het invoerveld. Bij
  // sluiten (alleen ná een open-sessie, niet bij de initiële mount): focus
  // terug naar de FAB-knop zodat toetsenbordgebruikers niet "verdwalen".
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      fabRef.current?.focus();
    }
  }, [open]);

  // Cleanup pending request bij unmount of org/bot-switch (key-prop reset).
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Tooltip auto-show: 1× verschijnen 4s na mount, dan 6s zichtbaar, dan weg.
  // Daarna alleen nog op hover. Zodra de chat opent worden de timers gewist
  // door de cleanup en gate `showTooltipNow` extra op `!open`.
  useEffect(() => {
    if (open) return;
    const showTimer = setTimeout(() => setTooltipVisible(true), 4000);
    const hideTimer = setTimeout(() => setTooltipVisible(false), 10000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [open]);

  // Embedded-modus: vertel de iframe-loader of we collapsed of open zijn,
  // zodat hij de iframe kan resizen. Side meegestuurd voor de hoek-positie.
  useEffect(() => {
    if (!embedded || typeof window === 'undefined' || window.parent === window) return;
    // 'peek' = ingeklapt mét zichtbare launcher-tooltip; de loader maakt de iframe
    // dan tijdelijk groter zodat de tooltip boven de knop niet wordt afgesneden.
    const peeking = !open && (tooltipVisible || tooltipHovered);
    const state = open ? 'open' : peeking ? 'peek' : 'collapsed';
    window.parent.postMessage(
      { type: 'chatmanta:resize', state, side: position },
      parentOrigin,
    );
  }, [embedded, open, tooltipVisible, tooltipHovered, position, parentOrigin]);

  // Submit-handler voor de duim-knoppen onder een bot-bubble. Werkt voor
  // beide ratings; bij 'up' is de comment altijd null (geen disclosure-flow),
  // bij 'down' kan de bezoeker een toelichting hebben getypt of "Sla over"
  // hebben geklikt. Idempotent server-side (UNIQUE-conflict → 200).
  const submitFeedback = useCallback(
    async (messageId: string, rating: 'up' | 'down') => {
      // Lees de huidige state ten tijde van submit; useState-functioneel
      // update voorkomt stale closures wanneer de bezoeker snel achter elkaar
      // klikt.
      let queryLogId: string | undefined;
      let comment = '';
      flushSync(() => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx < 0) return prev;
          const cur = prev[idx];
          if (cur.role !== 'assistant' || !cur.queryLogId) return prev;
          queryLogId = cur.queryLogId;
          comment = cur.feedbackComment ?? '';
          const next = prev.slice();
          next[idx] = { ...cur, feedbackState: 'submitting' };
          return next;
        });
      });
      if (!queryLogId) return;

      try {
        const res = await fetch(
          `/api/v0/feedback?org=${encodeURIComponent(orgSlug)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Embed-token zodat feedback ook op een externe site door de
              // dual-auth van de feedback-route komt (zelfde model als chat).
              ...(embedTokenRef.current
                ? { 'x-chatmanta-embed': embedTokenRef.current }
                : {}),
            },
            body: JSON.stringify({
              queryLogId,
              rating,
              comment: rating === 'down' && comment.trim().length > 0 ? comment.trim() : null,
            }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx < 0) return prev;
          const cur = prev[idx];
          if (cur.role !== 'assistant') return prev;
          const next = prev.slice();
          next[idx] = {
            ...cur,
            feedbackState: rating === 'up' ? 'sent-up' : 'sent-down',
          };
          return next;
        });
      } catch {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === messageId);
          if (idx < 0) return prev;
          const cur = prev[idx];
          if (cur.role !== 'assistant') return prev;
          const next = prev.slice();
          next[idx] = { ...cur, feedbackState: 'error' };
          return next;
        });
      }
    },
    [],
  );

  // Haal een vers embed-token op (zelfde origin-lock als de chat-route). Wordt
  // alleen aangeroepen wanneer een chat-request 401/403 geeft — typisch een
  // verlopen token op een lang-open tabblad. null = niet gelukt → caller toont
  // alsnog een nette foutmelding.
  const refreshEmbedToken = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `/api/v0/widget/token?org=${encodeURIComponent(orgSlug)}`,
        { method: 'GET' },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: unknown };
      const token = typeof data.token === 'string' ? data.token : null;
      if (token) embedTokenRef.current = token;
      return token;
    } catch {
      return null;
    }
  }, [orgSlug]);

  // Contactverzoeken (M2): submit het formulier-kaartje naar de M3-route. Spiegelt
  // EXACT de chat-fetch: zelfde org-slug (?org=), zelfde headers x-chatmanta-embed
  // (token) + x-chatmanta-visitor (visitor-id), en dezelfde 401→token-refresh→1×-
  // retry zodat een verlopen 30-min-token een trage invuller niet de lead kost.
  // Geeft een grof resultaat terug; de ContactFormCard vertaalt het naar UI-state.
  const submitContactRequest = useCallback(
    async (payload: {
      name: string;
      email: string | null;
      phone: string | null;
      preferredContact: 'call' | 'email';
      subject: string | null;
      toelichting: string | null;
      // Honeypot — leeg bij echte bezoekers; gaat één-op-één mee naar de route.
      company_url: string;
    }): Promise<'ok' | 'error'> => {
      // Zelfde visitor-identiteit als de chat (zie runChat): cookie-onafhankelijk,
      // werkt in een third-party iframe waar de Lax-cookie geblokkeerd is.
      const visitorId =
        visitorIdRef.current ?? (visitorIdRef.current = getOrCreateVisitorId());

      // POST-helper — herbruikt voor de retry ná een token-refresh (idem runChat).
      const postRequest = (token: string | undefined) =>
        fetch(`/api/v0/contact-request?org=${encodeURIComponent(orgSlug)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-chatmanta-embed': token } : {}),
            ...(visitorId ? { 'x-chatmanta-visitor': visitorId } : {}),
          },
          body: JSON.stringify({
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            preferredContact: payload.preferredContact,
            subject: payload.subject,
            toelichting: payload.toelichting,
            consentGiven: true,
            visitorId,
            company_url: payload.company_url,
          }),
        });

      try {
        let res = await postRequest(embedTokenRef.current);
        // Verlopen embed-token (lang openstaand formulier) → eenmalig vers token +
        // herhalen. Zelfde flow als de chat-fetch.
        if ((res.status === 401 || res.status === 403) && embedTokenRef.current) {
          const fresh = await refreshEmbedToken();
          if (fresh) res = await postRequest(fresh);
        }
        // 200 (idempotent / honeypot-stil-ok) én 201 (nieuw) tellen als succes.
        return res.ok ? 'ok' : 'error';
      } catch {
        return 'error';
      }
    },
    [orgSlug, refreshEmbedToken],
  );

  // C9 (v0.10) — AVG-verwijderpad: de bezoeker wist zijn eigen gesprekken. De
  // visitor-id gaat als header mee (zelfde identiteit als de chat) zodat de server
  // alléén déze bezoeker zijn data verwijdert, org-gescoped. De lokale staat wordt
  // sowieso gewist (de bezoeker wil 'weg'), ook als de server-call faalt.
  const handleDeleteConversations = useCallback(async () => {
    if (typeof window !== 'undefined' &&
        !window.confirm('Weet je zeker dat je je gesprek wilt verwijderen? Dit kan niet ongedaan worden gemaakt.')) {
      return;
    }
    const visitorId =
      visitorIdRef.current ?? (visitorIdRef.current = getOrCreateVisitorId());
    try {
      await fetch(`/api/v0/widget/delete-conversations?org=${encodeURIComponent(orgSlug)}`, {
        method: 'POST',
        headers: {
          ...(embedTokenRef.current ? { 'x-chatmanta-embed': embedTokenRef.current } : {}),
          ...(visitorId ? { 'x-chatmanta-visitor': visitorId } : {}),
        },
      });
    } catch {
      // best-effort — lokaal toch wissen.
    }
    setMessages([]);
    setThreads([]);
    setActiveThreadId(null);
  }, [orgSlug]);

  // Kern van het chat-request: fetch + token-refresh-retry + stream-verwerking
  // voor een bestaande assistant-bubble. Gedeeld door `send` (nieuwe vraag) en
  // `retry` (mislukt bericht opnieuw). De caller zet `pending` aan en voegt de
  // bubble toe/reset 'm; runChat zet `pending` in de finally weer uit.
  const runChat = useCallback(
    async (
      question: string,
      assistantId: string,
      history: { role: 'user' | 'assistant'; content: string }[],
    ) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Stabiele visitor-id voor server-side thread-grouping. Lazy-geïnit zodat
      // localStorage pas client-side geraakt wordt. Cookie-onafhankelijk → werkt
      // ook in een third-party iframe waar de Lax-cookie geblokkeerd is.
      const visitorId =
        visitorIdRef.current ?? (visitorIdRef.current = getOrCreateVisitorId());

      // POST-helper — herbruikt voor de retry ná een token-refresh.
      const postChat = (token: string | undefined) =>
        fetch(`/api/v0/chat?org=${encodeURIComponent(orgSlug)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'x-chatmanta-embed': token } : {}),
            ...(visitorId ? { 'x-chatmanta-visitor': visitorId } : {}),
          },
          body: JSON.stringify({ question, version: botVersion, history }),
          signal: ctrl.signal,
        });

      try {
        let res = await postChat(embedTokenRef.current);

        // Het embed-token verloopt na 30 min (zie lib/v0/server/embed-token.ts).
        // Bij een 401/403 op het embed-pad halen we eenmalig een vers token op
        // en herhalen we de vraag — zo herstelt een lang-open tabblad zichzelf
        // i.p.v. een foutmelding te tonen.
        if ((res.status === 401 || res.status === 403) && embedTokenRef.current) {
          const fresh = await refreshEmbedToken();
          if (fresh) res = await postChat(fresh);
        }

        if (!res.ok || !res.body) {
          const status = res.status;
          // 401/403 op het embed-pad: token verlopen — visitor logt niet in, dus een
          // embed-specifieke melding (geen userView 'AUTH_REQUIRED'-inlog-tekst).
          if (status === 401 || status === 403) {
            updateAssistant(setMessages, assistantId, {
              content: 'Deze chat is even niet beschikbaar. Ververs de pagina en probeer het opnieuw.',
              error: `HTTP ${status}`,
              streaming: false,
            });
            return;
          }
          // C4: andere faalpaden (402 BUDGET_EXHAUSTED, 429 RATE_LIMIT, 5xx) → parse de
          // AppError-body en toon de canonieke leesbare melding i.p.v. een generieke zin.
          const wire = fromWire(await res.json().catch(() => ({})));
          const view = userView(wire.code, { retryAfterSec: wire.retryAfterSec });
          updateAssistant(setMessages, assistantId, {
            content: view.body,
            error: wire.code,
            streaming: false,
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;

            let event: unknown;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            handleEvent(event, setMessages, assistantId);
          }
        }

        // Markeer als niet meer streamend (voor het geval answer-done ontbrak).
        updateAssistant(setMessages, assistantId, { streaming: false });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        updateAssistant(setMessages, assistantId, {
          content: 'Verbinding viel weg — probeer het opnieuw.',
          error: String(err),
          streaming: false,
        });
      } finally {
        setPending(false);
        abortRef.current = null;
      }
    },
    [orgSlug, botVersion, refreshEmbedToken],
  );

  const send = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || pending) return;

      const userMsg: Message = { role: 'user', content: trimmed, id: makeId() };
      const assistantId = makeId();

      // History = alles wat we al hadden, gemapt naar {role, content}.
      // User-msgs gaan altijd mee; assistant-msgs alleen als ze afgerond zijn.
      const history = messages
        .filter((m) => m.role === 'user' || (!m.streaming && !m.error))
        .map((m) => ({ role: m.role, content: m.content }));

      flushSync(() => {
        setMessages((prev) => [
          ...prev,
          userMsg,
          { role: 'assistant', content: '', id: assistantId, streaming: true },
        ]);
        setPending(true);
        setInput('');
      });

      await runChat(trimmed, assistantId, history);
    },
    [messages, pending, runChat],
  );

  // Opnieuw proberen na een mislukt antwoord. Hergebruikt de bestaande
  // user→assistant-bubbels (geen dubbele vraag) en bouwt de history op uit de
  // afgeronde berichten vóór de mislukte beurt, zodat de mislukte poging zelf
  // niet in de context lekt.
  const retry = useCallback(
    async (assistantId: string) => {
      if (pending) return;
      const idx = messages.findIndex((m) => m.id === assistantId);
      if (idx < 0) return;
      const prevUser =
        idx > 0 && messages[idx - 1].role === 'user' ? messages[idx - 1] : null;
      const question = prevUser?.content.trim() ?? '';
      if (!question) return;

      const cutoff = prevUser ? idx - 1 : idx;
      const history = messages
        .slice(0, cutoff)
        .filter((m) => m.role === 'user' || (!m.streaming && !m.error))
        .map((m) => ({ role: m.role, content: m.content }));

      flushSync(() => {
        setMessages((prev) => {
          const i = prev.findIndex((m) => m.id === assistantId);
          if (i < 0) return prev;
          const cur = prev[i];
          if (cur.role !== 'assistant') return prev;
          const next = prev.slice();
          next[i] = { ...cur, content: '', streaming: true, error: undefined };
          return next;
        });
        setPending(true);
      });

      await runChat(question, assistantId, history);
    },
    [messages, pending, runChat],
  );

  // Persist messages → thread-store. Triggert na elke setMessages-flush,
  // inclusief streaming-delta's. Dat is goed: bij refresh midden in een
  // streaming-antwoord blijft de partial content bewaard zodat de bezoeker
  // niet "leeg" terugkomt. Eerste user-bericht zonder activeThreadId =
  // signaal om een nieuwe thread aan te maken (geen lege spook-threads).
  useEffect(() => {
    const store = storeRef.current;
    if (!store) return;
    if (messages.length === 0) return;

    let id = activeThreadId;
    if (!id) {
      const t = store.create();
      id = t.id;
      setActiveThreadId(id);
      store.setActiveId(id);
    }

    const plain = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    const updated = store.update(id, { messages: plain });
    if (updated) {
      setThreads((prev) => {
        const others = prev.filter((t) => t.id !== updated.id);
        return [updated, ...others];
      });
    }
  }, [messages, activeThreadId]);

  const toggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => {
      if (!prev) {
        const store = storeRef.current;
        if (store) setThreads(store.list());
      }
      return !prev;
    });
  }, []);

  const handleNewThread = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setActiveThreadId(null);
    storeRef.current?.setActiveId(null);
    setDrawerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSelectThread = useCallback((id: string) => {
    const store = storeRef.current;
    if (!store) return;
    const t = store.get(id);
    if (!t) return;
    abortRef.current?.abort();
    setActiveThreadId(id);
    store.setActiveId(id);
    setMessages(t.messages.map((m) => ({ ...m, streaming: false })));
    setDrawerOpen(false);
  }, []);

  const handleDeleteThread = useCallback(
    (id: string) => {
      const store = storeRef.current;
      if (!store) return;
      store.delete(id);
      setThreads(store.list());
      if (id === activeThreadId) {
        setMessages([]);
        setActiveThreadId(null);
      }
    },
    [activeThreadId],
  );

  // Toetsenbord-a11y voor het open paneel: Escape sluit (eerst de drawer, dan
  // het paneel); Tab/Shift+Tab blijft binnen het paneel (focus-trap). De FAB
  // staat buiten dialogRef en wordt dus niet meegevangen.
  const onDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (drawerOpen) setDrawerOpen(false);
        else setOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [drawerOpen],
  );

  // Mobiel: het schermtoetsenbord kan het invoerveld afdekken. Scroll het na
  // de toetsenbord-animatie weer in beeld.
  const handleInputFocus = useCallback(() => {
    if (!isMobile) return;
    setTimeout(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight });
      inputRef.current?.scrollIntoView({ block: 'nearest' });
    }, 300);
  }, [isMobile]);

  const showSuggested = !open ? false : messages.length === 0 && !pending;

  const showTooltipNow = (tooltipVisible || tooltipHovered) && !open;

  // Beleefde screenreader-tekst, puur afgeleid (geen state/effect). Tijdens
  // streaming één constante "bezig"-string → geen per-delta-spam; bij afronding
  // het volledige antwoord → één nette aankondiging. Een live-regio kondigt
  // alleen wijzigingen ná de eerste render aan, dus een geladen thread spamt niet.
  const lastMsg = messages[messages.length - 1];
  const srMsg =
    lastMsg?.role === 'assistant'
      ? lastMsg.streaming
        ? 'Bezig met antwoorden…'
        : lastMsg.error
          ? 'Er ging iets mis met het antwoord. Probeer het opnieuw.'
          : cleanWidgetAnswer(lastMsg.content)
      : '';

  // Klant heeft expliciet gepauzeerd — niets renderen, ook geen FAB. Late-
  // return moet ná alle hooks staan (rules-of-hooks).
  if (!isActive) return null;

  // Side-aware positie met iOS safe-area-inset zodat de FAB op iPhones niet
  // onder de home-indicator klemt. `calc()` is veilig binnen inline-style.
  const fabSideStyle =
    position === 'bottom-left'
      ? { left: 'calc(24px + env(safe-area-inset-left))' }
      : { right: 'calc(24px + env(safe-area-inset-right))' };

  // Op mobiel + open verbergen we de FAB; het fullscreen-paneel heeft een
  // eigen close-knop. Tooltip altijd via opacity (nooit unmount) i.v.m.
  // useEffect-cleanup.
  const fabHidden = open && isMobile;

  return (
    <>
      {/* FAB-container (links of rechts onder) — bevat pulse-ring, button en tooltip */}
      <div
        style={{
          position: 'fixed',
          ...fabSideStyle,
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          width: 56,
          height: 56,
          zIndex: 9999,
          display: fabHidden ? 'none' : 'block',
        }}
        onMouseEnter={() => setTooltipHovered(true)}
        onMouseLeave={() => setTooltipHovered(false)}
      >
        {/* Pulse-ring achter de FAB — alleen zichtbaar als chat gesloten is
            en de klant pulseEnabled niet expliciet uit heeft gezet.
            Per render gegenereerd met primaryColor zodat hij de org-context volgt. */}
        {!open && pulseEnabled && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: c.pulse,
              opacity: 0.45,
              animation: 'chatmanta-pulse 2.4s ease-out infinite',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Tooltip boven de FAB — state-driven, geen :hover (iOS Safari) */}
        <div
          role="status"
          aria-hidden={!showTooltipNow}
          style={{
            position: 'absolute',
            ...tooltipSideStyle,
            bottom: 'calc(100% + 12px)',
            background: '#0e1014',
            color: '#ffffff',
            padding: '8px 14px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.32)',
            opacity: showTooltipNow ? 1 : 0,
            transform: showTooltipNow ? 'translateY(0)' : 'translateY(6px)',
            pointerEvents: showTooltipNow ? 'auto' : 'none',
            transition: 'opacity 220ms ease, transform 220ms ease',
            fontFamily: 'var(--font-inter), system-ui, sans-serif',
          }}
        >
          {formatAccentText(tooltipText, c.header)}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              ...tooltipArrowStyle,
              bottom: -4,
              width: 8,
              height: 8,
              background: '#0e1014',
              transform: 'rotate(45deg)',
            }}
          />
        </div>

        <button
          ref={fabRef}
          type="button"
          aria-label={open ? 'Sluit chat' : 'Open chat'}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: 'relative',
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: c.widgetBg,
            border: `1px solid rgba(0,0,0,0.06)`,
            cursor: 'pointer',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.32), 0 4px 12px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 180ms ease, box-shadow 180ms ease',
            transform: open ? 'scale(0.9)' : 'scale(1)',
            padding: 0,
            overflow: 'hidden',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = open
              ? 'scale(0.94)'
              : 'scale(1.06)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = open
              ? 'scale(0.9)'
              : 'scale(1)';
          }}
        >
          {open ? <CloseIcon /> : <FabLogo style={logoStyle} color={c.logo} customDataUrl={customLogoDataUrl ?? null} />}
        </button>
      </div>

      {/* Keyframes — inline om de Tailwind v4 PostCSS-drop-quirk te omzeilen. */}
      <style>{`
        @keyframes chatmanta-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes chatmanta-blink {
          0%, 50% { opacity: 1; }
          50.01%, 100% { opacity: 0; }
        }
        @keyframes chatmanta-pulse {
          0% { transform: scale(1); opacity: 0.45; }
          80% { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>

      {/* Paneel */}
      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${displayTitle} chat`}
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          style={
            isMobile
              ? {
                  position: 'fixed',
                  inset: 0,
                  width: '100vw',
                  height: '100dvh',
                  background: '#ffffff',
                  color: '#0e1014',
                  borderRadius: 0,
                  boxShadow: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  zIndex: 9998,
                  fontFamily: 'var(--font-inter), system-ui, sans-serif',
                  paddingTop: 'env(safe-area-inset-top)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                  paddingLeft: 'env(safe-area-inset-left)',
                  paddingRight: 'env(safe-area-inset-right)',
                }
              : {
                  position: 'fixed',
                  ...(position === 'bottom-left'
                    ? { left: 'calc(24px + env(safe-area-inset-left))' }
                    : { right: 'calc(24px + env(safe-area-inset-right))' }),
                  bottom: 'calc(96px + env(safe-area-inset-bottom))',
                  width: 'min(440px, calc(100vw - 32px))',
                  height: 560,
                  maxHeight:
                    'calc(100dvh - 120px - env(safe-area-inset-bottom) - env(safe-area-inset-top))',
                  background: '#ffffff',
                  color: '#0e1014',
                  borderRadius: 16,
                  boxShadow:
                    '0 28px 72px -16px rgba(0,0,0,0.28), 0 10px 24px -8px rgba(0,0,0,0.16)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  zIndex: 9998,
                  fontFamily: 'var(--font-inter), system-ui, sans-serif',
                }
          }
        >
          {/* Verborgen live-regio: kondigt status + afgerond antwoord beleefd
              aan voor screenreaders, zonder elke streaming-delta voor te lezen. */}
          <div
            aria-live="polite"
            aria-atomic="true"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {srMsg}
          </div>

          {/* Header */}
          <div
            style={{
              background: c.header,
              color: bestForegroundOn(c.header),
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={toggleDrawer}
              aria-label={drawerOpen ? 'Sluit gesprekkenlijst' : 'Open gesprekkenlijst'}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                opacity: 0.85,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <MenuIcon size={16} />
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{displayTitle}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>
                {headerSubtitle?.trim() || 'Online · meestal binnen seconden antwoord'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluit"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                opacity: 0.85,
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>

          {/* Berichten-area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 18px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              background: '#f7f8fa',
            }}
          >
            {/* Welkomstbericht — klantendashboard-override (welcomeMessage) wint
                van de hardcoded default. Bot-naam (chatbotName) wordt boven het
                bericht getoond zodat de bezoeker direct ziet met wie hij praat;
                bij leeg fallback op companyName van de skin. */}
            {messages.length === 0 && (
              <BotBubble color={c.header} authorName={chatbotName?.trim() || companyName}>
                {welcomeMessage?.trim() ? (
                  welcomeMessage
                ) : (
                  <>
                    Hoi! Ik ben de digitale assistent van <strong>{companyName}</strong>.
                    Stel je vraag — ik zoek het op in onze content.
                  </>
                )}
              </BotBubble>
            )}

            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <UserBubble key={m.id} color={c.header}>
                    {m.content}
                  </UserBubble>
                );
              }
              // Streaming-veilige weergave. Bots met chainOfThought streamen
              // eerst <thinking>…</thinking> en pas daarna het antwoord. Tijdens
              // die denkfase is de zichtbare tekst leeg → toon de typ-indicator
              // i.p.v. de rauwe redenering (spiegelt het hoofd-chat-pad).
              const visible = cleanWidgetAnswer(m.content);
              return (
                <div
                  key={m.id}
                  style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                >
                  <BotBubble color={c.header}>
                    {m.streaming && !visible ? <TypingDots /> : renderMarkdownLite(m.content, c.header, !m.streaming)}
                    {m.streaming && visible ? <Caret /> : null}
                  </BotBubble>
                  {/* Mislukt antwoord → expliciete retry-affordance i.p.v. de
                      bezoeker laten herformuleren. Hergebruikt dezelfde beurt. */}
                  {!m.streaming && m.error && (
                    <button
                      type="button"
                      onClick={() => void retry(m.id)}
                      disabled={pending}
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        padding: '5px 10px',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#b91c1c',
                        cursor: pending ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      <RetryIcon />
                      Opnieuw proberen
                    </button>
                  )}
                  {/* Feedback-knoppen: alleen op afgeronde, niet-fouten messages
                      met een queryLogId (= meta-event al binnen). Welkomstbubble
                      zit niet in `messages`-array en wordt dus automatisch
                      overgeslagen. */}
                  {!m.streaming && !m.error && m.queryLogId && (
                    <FeedbackButtons
                      queryLogId={m.queryLogId}
                      state={m.feedbackState ?? 'idle'}
                      comment={m.feedbackComment ?? ''}
                      accentColor={c.header}
                      onCommentChange={(next) =>
                        updateAssistant(setMessages, m.id, { feedbackComment: next })
                      }
                      onSubmit={(rating) => void submitFeedback(m.id, rating)}
                      onOpenComment={() =>
                        updateAssistant(setMessages, m.id, { feedbackState: 'comment-open' })
                      }
                      onSkipComment={() => void submitFeedback(m.id, 'down')}
                    />
                  )}
                  {/* Contactverzoeken (M2): contact-offer event hing een kaartje aan
                      deze bubble. Het aanbod + formulier krijgen hun eigen "ja-
                      geklikt"-state ín ContactOffer (geen ephemerale vlag op het
                      Message-type). */}
                  {m.contactCard && (
                    <ContactOffer
                      headerColor={c.header}
                      companyName={companyName}
                      prefill={m.contactCard.prefill}
                      consentText={m.contactCard.consentText}
                      onSubmit={submitContactRequest}
                    />
                  )}
                </div>
              );
            })}

            {/* Suggested questions */}
            {showSuggested && suggested.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
                  Veelgestelde vragen
                </span>
                {suggested.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    style={{
                      textAlign: 'left',
                      background: '#ffffff',
                      color: '#0e1014',
                      border: `1px solid ${withAlpha(c.header, 0.32)}`,
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = withAlpha(c.header, 0.08);
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input-bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            style={{
              padding: '10px 12px 12px',
              borderTop: '1px solid #eaecef',
              background: '#ffffff',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={handleInputFocus}
              placeholder="Stel je vraag…"
              disabled={pending}
              style={{
                flex: 1,
                background: '#f3f4f6',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 14,
                color: '#0e1014',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={pending || !input.trim()}
              aria-label="Verstuur"
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: pending || !input.trim() ? '#d1d5db' : c.header,
                color: bestForegroundOn(c.header),
                border: 'none',
                cursor: pending || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SendIcon />
            </button>
          </form>

          {/* Footer: Powered by ChatManta */}
          <div
            style={{
              padding: '8px 14px 10px',
              borderTop: '1px solid #f0f1f3',
              background: '#ffffff',
              fontSize: 11,
              color: '#9ca3af',
              textAlign: 'center',
            }}
          >
            Powered by{' '}
            <a
              href="/home"
              style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600 }}
              target="_blank"
              rel="noopener noreferrer"
            >
              ChatManta
            </a>
            {/* C9 (v0.10) — AVG-disclosure + verwijderpad */}
            <div style={{ marginTop: 4, fontSize: 10.5, color: '#9ca3af', lineHeight: 1.5 }}>
              Je gesprek wordt tijdelijk opgeslagen om je beter te helpen.{' '}
              <a
                href="/privacy"
                style={{ color: '#6b7280', textDecoration: 'underline' }}
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy
              </a>
              {' · '}
              <button
                type="button"
                onClick={() => void handleDeleteConversations()}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: '#6b7280',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Verwijder mijn gesprek
              </button>
            </div>
          </div>

          {/* Thread-drawer als overlay binnen het paneel. Hij zit boven de
              messages-area maar onder de header (zIndex: 2 vs 9998 paneel-zelf).
              `position: absolute; inset: 0` binnen het paneel zorgt dat de
              header + footer zichtbaar blijven. */}
          {drawerOpen && (
            <ThreadDrawer
              threads={threads}
              activeId={activeThreadId}
              headerColor={c.header}
              onClose={() => setDrawerOpen(false)}
              onSelect={handleSelectThread}
              onNew={handleNewThread}
              onDelete={handleDeleteThread}
            />
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Stream-event handler — knip out van handle-loop voor leesbaarheid.
// ---------------------------------------------------------------------------
function handleEvent(
  event: unknown,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  assistantId: string,
) {
  if (!event || typeof event !== 'object') return;
  const e = event as { kind?: string };

  // Meta-event = eerste in de stream. Hangt de query_log-id aan de actieve
  // assistant-message; feedback-knoppen worden zo gekoppeld vóór de gebruiker
  // ze kan klikken.
  if (e.kind === 'meta') {
    const queryLogId = (e as { queryLogId?: string }).queryLogId;
    if (queryLogId) {
      updateAssistant(setMessages, assistantId, {
        queryLogId,
        feedbackState: 'idle',
        feedbackComment: '',
      });
    }
    return;
  }

  if (e.kind === 'smalltalk' || e.kind === 'fallback') {
    const resp = (e as { response?: ChatResponse }).response;
    if (resp && (resp.kind === 'smalltalk' || resp.kind === 'fallback' || resp.kind === 'answer')) {
      updateAssistant(setMessages, assistantId, {
        content: resp.answer,
        streaming: false,
      });
    }
    return;
  }

  if (e.kind === 'answer-start') {
    updateAssistant(setMessages, assistantId, { content: '', streaming: true });
    return;
  }

  if (e.kind === 'answer-delta') {
    const text = (e as { text?: string }).text ?? '';
    if (!text) return;
    // flushSync per delta zodat React 19 niet meerdere tokens in één commit batcht.
    flushSync(() => {
      setMessages((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((m) => m.id === assistantId);
        if (idx < 0) return prev;
        const cur = next[idx];
        if (cur.role !== 'assistant') return prev;
        next[idx] = { ...cur, content: cur.content + text, streaming: true };
        return next;
      });
    });
    return;
  }

  if (e.kind === 'answer-done') {
    const resp = (e as { response?: ChatResponse }).response;
    if (resp && resp.kind === 'answer') {
      updateAssistant(setMessages, assistantId, {
        content: resp.answer,
        streaming: false,
      });
    } else {
      updateAssistant(setMessages, assistantId, { streaming: false });
    }
    return;
  }

  if (e.kind === 'replacement') {
    const resp = (e as { response?: ChatResponse }).response;
    if (resp && resp.kind === 'answer') {
      updateAssistant(setMessages, assistantId, {
        content: resp.answer,
        streaming: false,
      });
    }
    return;
  }

  // Contactverzoeken (M2): yield ná answer-done (zie contact-offer.ts). Hangt het
  // formulier-aanbod aan de zojuist afgeronde antwoord-bubble. consentText + prefill
  // komen kant-en-klaar uit het event — alleen platte-tekst, nooit als HTML.
  if (e.kind === 'contact-offer') {
    const ev = e as { prefill?: ContactOfferPrefill; consentText?: unknown };
    const consentText = typeof ev.consentText === 'string' ? ev.consentText : '';
    if (!consentText) return; // zonder consent-zin geen formulier (fail-closed)
    const p = ev.prefill ?? {};
    const prefill: ContactOfferPrefill = {
      name: typeof p.name === 'string' ? p.name : undefined,
      subject: typeof p.subject === 'string' ? p.subject : undefined,
      toelichting: typeof p.toelichting === 'string' ? p.toelichting : undefined,
    };
    updateAssistant(setMessages, assistantId, { contactCard: { prefill, consentText } });
    return;
  }

  if (e.kind === 'error') {
    // C4: map de echte AppError-code op een leesbare NL-melding (fromWire normaliseert
    // onbekende codes → INTERNAL). Vangt RATE_LIMIT (was de dode 'RATE_LIMITED'-tak),
    // LLM_TIMEOUT, BUDGET_EXHAUSTED, NOT_FOUND, etc. — geen generieke blob meer.
    const wire = fromWire(e);
    const view = userView(wire.code, { retryAfterSec: wire.retryAfterSec });
    updateAssistant(setMessages, assistantId, {
      content: view.body,
      error: wire.code,
      streaming: false,
    });
  }
}

function updateAssistant(
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
  id: string,
  patch: Partial<Extract<Message, { role: 'assistant' }>>,
) {
  setMessages((prev) => {
    const next = prev.slice();
    const idx = next.findIndex((m) => m.id === id);
    if (idx < 0) return prev;
    const cur = next[idx];
    if (cur.role !== 'assistant') return prev;
    next[idx] = { ...cur, ...patch };
    return next;
  });
}

// ---------------------------------------------------------------------------
// Contactverzoeken (M2) — aanbod-bubble + formulier-kaartje.
//
// BEWUST inline-gestyled met de widget-kleurtokens (c.header / bestForegroundOn /
// withAlpha) — NIET via klant.css / var(--klant-*), want die bestaan niet in de
// embed-iframe (zie feedback-form.tsx → kapotte kaart). Eén vaste vorm, geen
// generieke card-infra.
// ---------------------------------------------------------------------------

// Client-side spiegels van de server-validatie in /api/v0/contact-request:
//   email: dezelfde EEN-@-EEN-punt-regel; phone: /^[\d+\s()\/.-]{5,20}$/.
// Lokale kopie i.p.v. een import uit lib/notifications (server-module → embed-
// bundle vies). De server blijft sowieso de hard-gate; dit is alleen UX.
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_PHONE_RE = /^[\d+\s()\/.-]{5,20}$/;

// Het contact-aanbod: eerst een nette bot-bubble met een "Ja"-knop. Bij "Ja"
// verschijnt ÉÉN ContactFormCard; geen klik = de bezoeker chat gewoon verder.
function ContactOffer({
  headerColor,
  companyName,
  prefill,
  consentText,
  onSubmit,
}: {
  headerColor: string;
  companyName: string;
  prefill: ContactOfferPrefill;
  consentText: string;
  onSubmit: (payload: {
    name: string;
    email: string | null;
    phone: string | null;
    preferredContact: 'call' | 'email';
    subject: string | null;
    toelichting: string | null;
    company_url: string;
  }) => Promise<'ok' | 'error'>;
}) {
  // 'offer' = aanbod-bubble met Ja-knop; 'form' = formulier open; 'done' = verstuurd.
  const [phase, setPhase] = useState<'offer' | 'form' | 'done'>('offer');
  const naam = companyName.trim() || 'dit bedrijf';

  if (phase === 'done') {
    return (
      <div style={{ marginTop: 8 }}>
        <BotBubble color={headerColor}>
          Bedankt! {naam} neemt zo snel mogelijk contact met je op.
        </BotBubble>
      </div>
    );
  }

  if (phase === 'form') {
    return (
      <div style={{ marginTop: 8 }}>
        <ContactFormCard
          headerColor={headerColor}
          prefill={prefill}
          consentText={consentText}
          onSubmit={onSubmit}
          onDone={() => setPhase('done')}
        />
      </div>
    );
  }

  // phase === 'offer'
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <BotBubble color={headerColor}>
        Wil je dat we contact met je opnemen? Laat je gegevens achter, dan neemt {naam}{' '}
        contact met je op.
      </BotBubble>
      <button
        type="button"
        onClick={() => setPhase('form')}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: headerColor,
          color: bestForegroundOn(headerColor),
          border: 'none',
          borderRadius: 10,
          padding: '8px 14px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Ja, neem contact op
      </button>
    </div>
  );
}

// Het formulier-kaartje zelf. Exact 5 zichtbare velden (naam, voorkeur-radio,
// e-mail, telefoon, onderwerp/toelichting) + consent-checkbox + verborgen
// honeypot. prefill vult naam/onderwerp/toelichting voor (platte tekst, value=…
// → nooit als HTML/markdown). De bezoeker kan alles aanpassen.
function ContactFormCard({
  headerColor,
  prefill,
  consentText,
  onSubmit,
  onDone,
}: {
  headerColor: string;
  prefill: ContactOfferPrefill;
  consentText: string;
  onSubmit: (payload: {
    name: string;
    email: string | null;
    phone: string | null;
    preferredContact: 'call' | 'email';
    subject: string | null;
    toelichting: string | null;
    company_url: string;
  }) => Promise<'ok' | 'error'>;
  onDone: () => void;
}) {
  const [name, setName] = useState(prefill.name ?? '');
  const [preferred, setPreferred] = useState<'call' | 'email'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  // Onderwerp + toelichting samengevoegd tot één veld in de UI (Q4: "onderwerp/
  // toelichting"); we sturen de waarde als `toelichting` mee. Onderwerp uit de
  // prefill prependen we als context zodat de bot-voorvulling niet verloren gaat.
  const initialToelichting =
    [prefill.subject?.trim(), prefill.toelichting?.trim()].filter(Boolean).join('\n').trim();
  const [toelichting, setToelichting] = useState(initialToelichting);
  const [consent, setConsent] = useState(false);
  // Honeypot — leeg laten; alleen bots vullen 'm. Echte hidden-techniek (off-screen
  // + aria-hidden + tabIndex -1), NIET display:none-only, zodat bots 'm wél zien.
  const [companyUrl, setCompanyUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const emailOk = CONTACT_EMAIL_RE.test(email.trim());
  const phoneOk = CONTACT_PHONE_RE.test(phone.trim());
  // Client-side spiegel van de server-validatie: naam verplicht; voorkeur bepaalt
  // welk contactveld verplicht + geldig moet zijn; consent verplicht aangevinkt.
  const canSubmit =
    name.trim().length > 0 &&
    consent &&
    (preferred === 'call' ? phoneOk : emailOk) &&
    !pending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setPending(true);
    const result = await onSubmit({
      name: name.trim(),
      // Stuur beide velden mee indien ingevuld; de route filtert een ongeldig
      // niet-voorkeursveld zelf weg (DB eist alleen ÉÉN van e-mail/telefoon).
      email: email.trim() || null,
      phone: phone.trim() || null,
      preferredContact: preferred,
      subject: null,
      toelichting: toelichting.trim() || null,
      company_url: companyUrl,
    });
    setPending(false);
    if (result === 'ok') {
      onDone();
    } else {
      setError('Versturen is niet gelukt. Probeer het zo nog eens.');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: `1px solid ${withAlpha(headerColor, 0.28)}`,
    fontSize: 13,
    fontFamily: 'inherit',
    color: '#0e1014',
    background: '#ffffff',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: '#374151',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: '#ffffff',
        border: `1px solid ${withAlpha(headerColor, 0.2)}`,
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        maxWidth: '92%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle} htmlFor="cm-cr-name">Naam *</label>
        <input
          id="cm-cr-name"
          style={inputStyle}
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          autoComplete="name"
          placeholder="Je naam"
          required
        />
      </div>

      {/* Voorkeur-radio: bepaalt welk veld verplicht is (bellen→telefoon,
          mailen→e-mail). Spiegelt de server-side dynamische validatie. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={labelStyle}>Hoe wil je dat we contact opnemen? *</span>
        <div role="radiogroup" aria-label="Voorkeur contact" style={{ display: 'flex', gap: 8 }}>
          {([
            { value: 'email', label: 'Mailen' },
            { value: 'call', label: 'Bellen' },
          ] as const).map((o) => {
            const active = preferred === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setPreferred(o.value)}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${active ? headerColor : withAlpha(headerColor, 0.28)}`,
                  background: active ? withAlpha(headerColor, 0.1) : '#ffffff',
                  color: active ? headerColor : '#6b7280',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle} htmlFor="cm-cr-email">
          E-mailadres{preferred === 'email' ? ' *' : ' (optioneel)'}
        </label>
        <input
          id="cm-cr-email"
          type="email"
          inputMode="email"
          style={inputStyle}
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          autoComplete="email"
          placeholder="jij@voorbeeld.nl"
          required={preferred === 'email'}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle} htmlFor="cm-cr-phone">
          Telefoonnummer{preferred === 'call' ? ' *' : ' (optioneel)'}
        </label>
        <input
          id="cm-cr-phone"
          type="tel"
          inputMode="tel"
          style={inputStyle}
          value={phone}
          onChange={(ev) => setPhone(ev.target.value)}
          autoComplete="tel"
          placeholder="06 12 34 56 78"
          required={preferred === 'call'}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={labelStyle} htmlFor="cm-cr-toel">Waar gaat het over?</label>
        <textarea
          id="cm-cr-toel"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 64, lineHeight: 1.45 }}
          rows={3}
          value={toelichting}
          onChange={(ev) => setToelichting(ev.target.value)}
          placeholder="Korte toelichting (optioneel)"
        />
      </div>

      {/* Verborgen honeypot — off-screen + aria-hidden + niet-focusbaar. NIET
          display:none, zodat bots het invullen en wij ze kunnen weren. */}
      <input
        type="text"
        name="company_url"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={companyUrl}
        onChange={(ev) => setCompanyUrl(ev.target.value)}
        style={{
          position: 'absolute',
          left: '-9999px',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#374151', lineHeight: 1.4 }}>
        <input
          type="checkbox"
          checked={consent}
          onChange={(ev) => setConsent(ev.target.checked)}
          style={{ marginTop: 2, flexShrink: 0 }}
          required
        />
        <span>{consentText}</span>
      </label>

      {error && (
        <div role="alert" style={{ fontSize: 12.5, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          alignSelf: 'flex-end',
          background: canSubmit ? headerColor : withAlpha(headerColor, 0.4),
          color: bestForegroundOn(headerColor),
          border: 'none',
          borderRadius: 10,
          padding: '8px 16px',
          fontSize: 13,
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
        }}
      >
        {pending ? 'Bezig…' : 'Versturen'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Mini-presentation components
// ---------------------------------------------------------------------------
function UserBubble({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          background: color,
          color: bestForegroundOn(color),
          padding: '8px 12px',
          borderRadius: '14px 14px 4px 14px',
          maxWidth: '78%',
          fontSize: 14,
          lineHeight: 1.45,
          whiteSpace: 'pre-wrap',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function BotBubble({
  children,
  color,
  authorName,
}: {
  children: React.ReactNode;
  color: string;
  /**
   * Optioneel: bot-identiteit boven de bubble (klantendashboard chatbotName).
   * Bij undefined → geen header — gebruikt door de streaming/normale antwoord-
   * bubbles waar we het minimal willen houden. Welkomstbubble vult dit altijd.
   */
  authorName?: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div
        style={{
          background: '#ffffff',
          color: '#0e1014',
          padding: '8px 12px',
          borderRadius: '14px 14px 14px 4px',
          maxWidth: '88%',
          fontSize: 14,
          lineHeight: 1.5,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          border: `1px solid ${withAlpha(color, 0.14)}`,
          whiteSpace: 'pre-wrap',
        }}
      >
        {authorName && (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#6b7280',
              marginBottom: 4,
              letterSpacing: '0.01em',
            }}
          >
            {authorName}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
      <Dot delay={0} />
      <Dot delay={150} />
      <Dot delay={300} />
    </span>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: '#9ca3af',
        animation: 'chatmanta-bounce 1.1s infinite ease-in-out',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// FAB-logo — kiest tussen drie varianten op basis van `logoStyle`. Voor de
// twee mask-varianten gebruiken we CSS `mask-image` + `background-color`
// zodat de klant z'n eigen `logoColor` ziet doorkomen. Custom-uploads
// renderen we als `<img>` zonder color-treatment.
function FabLogo({
  style,
  color,
  customDataUrl,
}: {
  style: 'brand-mark' | 'chat-bubble' | 'custom-logo';
  color: string;
  customDataUrl: string | null;
}) {
  if (style === 'custom-logo' && customDataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- runtime base64 data-URL, niet door next/image te optimizen.
      <img
        src={customDataUrl}
        alt=""
        style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6 }}
      />
    );
  }

  if (style === 'chat-bubble') {
    return (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 5.5C4 4.67 4.67 4 5.5 4h13c.83 0 1.5.67 1.5 1.5v9c0 .83-.67 1.5-1.5 1.5H9.5l-4 4v-4H5.5c-.83 0-1.5-.67-1.5-1.5v-9z"
          fill={color}
        />
      </svg>
    );
  }

  // Default: ChatManta brand-mark als CSS-mask zodat `color` doorkomt.
  return (
    <span
      role="img"
      aria-label=""
      style={{
        display: 'inline-block',
        width: 36,
        height: 22,
        backgroundColor: color,
        WebkitMaskImage: "url('/logo/mono-mark.png')",
        maskImage: "url('/logo/mono-mark.png')",
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

function Caret() {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 6,
        height: 14,
        marginLeft: 2,
        background: '#9ca3af',
        verticalAlign: 'text-bottom',
        animation: 'chatmanta-blink 1s infinite step-end',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG — geen extra dep). De FAB toont nu het ChatManta brand-
// mark logo i.p.v. een generieke chat-bubble, dus alleen Close + Send blijven.
// ---------------------------------------------------------------------------
function CloseIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function MenuIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Color utilities. `bestForegroundOn` komt uit lib/widget/contrast.ts (gedeeld
// met thread-drawer + feedback-buttons); `withAlpha` blijft lokaal.
// ---------------------------------------------------------------------------
function withAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
