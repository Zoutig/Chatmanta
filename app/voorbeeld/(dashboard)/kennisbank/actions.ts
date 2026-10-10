// Voorbeeld-dashboard: Kennisbank-acties zonder server.
//
// Zelfde exports, signaturen en return-vormen als de V1-server-actions. Er wordt
// niets gecrawld, geüpload of ge-ingest: de website-bronnen leven in het geheugen
// van deze pagina-sessie (zodat aan/uit en verwijderen zichtbaar blijven), uploads
// en crawls "doen alsof" met een korte pauze en een geloofwaardig resultaat.

import type { ActionFail, ActionResult } from '@/lib/errors/action';
import { pretendDelay } from '@/lib/voorbeeld/fixtures/contact';
import {
  DEMO_DOCUMENTS,
  demoDocText,
  demoDiscoverUrls,
  demoPageFromUrl,
  demoPageText,
  getDemoWebsiteSources,
} from '@/lib/voorbeeld/fixtures/kennisbank';
import type { WebsiteSource } from './types';

const MAX_CRAWL_PAGES = 50;
const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = ['pdf', 'docx', 'txt', 'md'];

let sources: WebsiteSource[] | null = null;
function current(): WebsiteSource[] {
  if (!sources) sources = getDemoWebsiteSources();
  return sources;
}

/** Kale invoer ("jouwsite.nl") → geldig http(s)-schema. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function invalidUrl(): ActionFail {
  return { ok: false, error: 'Dit is geen geldig webadres.', code: 'CRAWL_FAILED' };
}

export type DiscoverResult = { rootUrl: string; urls: string[] };

/** "Ontdek" de pagina's: voor elk adres de pagina's van de voorbeeldwebsite. */
export async function discoverPagesAction(rawUrl: string): Promise<ActionResult<DiscoverResult>> {
  const url = normalizeUrl(rawUrl);
  if (!hostOf(url)) return invalidUrl();
  await pretendDelay(700, 1200);
  return { ok: true, rootUrl: url, urls: demoDiscoverUrls(url) };
}

/** "Crawl" de geselecteerde pagina's: direct klaar, pagina's staan meteen in de lijst. */
export async function startSelectedCrawlAction(
  rootUrl: string,
  selectedUrls: string[],
  maxPages: number = MAX_CRAWL_PAGES,
): Promise<ActionResult> {
  const root = normalizeUrl(rootUrl);
  const host = hostOf(root);
  if (!host) return invalidUrl();
  const cap = Math.min(Math.max(1, Math.floor(maxPages)), MAX_CRAWL_PAGES);
  const picked = selectedUrls.slice(0, cap);
  if (picked.length === 0) {
    return { ok: false, error: 'Geen geldige pagina’s geselecteerd.', code: 'CRAWL_FAILED' };
  }
  await pretendDelay(600, 1000);

  const now = new Date().toISOString();
  const existing = current().find((s) => s.source.host === host);
  const sourceId = existing?.source.id ?? `vb-src-${Date.now()}`;
  const known = new Map((existing?.pages ?? []).map((p) => [p.url, p]));
  for (const u of picked) {
    known.set(u, { ...(known.get(u) ?? demoPageFromUrl(u)), status: 'active', included: true, lastProcessedAt: now, errorMessage: null });
  }
  const next: WebsiteSource = {
    source: { id: sourceId, rootUrl: root, host, status: 'ready' },
    job: {
      status: 'completed',
      error: null,
      completed: picked.length,
      total: picked.length,
      events: [
        {
          eventType: 'complete',
          firecrawlStatus: 'completed',
          completed: picked.length,
          total: picked.length,
          dataCount: picked.length,
          hasNext: false,
          decision: 'ingested',
          message: `${picked.length} pagina's verwerkt.`,
          createdAt: now,
        },
      ],
    },
    pages: [...known.values()],
  };
  sources = existing ? current().map((s) => (s.source.id === sourceId ? next : s)) : [...current(), next];
  return { ok: true };
}

/** Verwijder de website-bron uit de lijst. */
export async function deleteWebsiteSourceAction(sourceId: string): Promise<ActionResult> {
  await pretendDelay();
  sources = current().filter((s) => s.source.id !== sourceId);
  return { ok: true };
}

/** Huidige website-bronnen. */
export async function refreshWebsiteSources(): Promise<WebsiteSource[]> {
  return current();
}

/** In het voorbeeld loopt er nooit een crawl: geeft gewoon de huidige lijst. */
export async function tickCrawlIngestAction(): Promise<WebsiteSource[]> {
  return current();
}

/** Zet één pagina aan/uit. */
export async function setPageIncludedAction(pageId: string, included: boolean): Promise<ActionResult> {
  await pretendDelay(250, 450);
  sources = current().map((s) => ({
    ...s,
    pages: s.pages.map((p) =>
      p.id === pageId ? { ...p, included, status: included ? 'active' : 'disabled' } : p,
    ),
  }));
  return { ok: true };
}

/** Herprobeer één mislukte pagina: lukt in het voorbeeld altijd. */
export async function retryPageAction(pageId: string): Promise<ActionResult> {
  await pretendDelay(800, 1300);
  const now = new Date().toISOString();
  sources = current().map((s) => ({
    ...s,
    pages: s.pages.map((p) =>
      p.id === pageId ? { ...p, status: 'active', included: true, errorMessage: null, lastProcessedAt: now } : p,
    ),
  }));
  return { ok: true };
}

// ─── Document-uploads (doet alsof; er gaat geen bestand de deur uit) ─────────

function docExtOf(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export async function createUploadUrlAction(
  filename: string,
  sizeBytes: number,
): Promise<ActionResult<{ signedUrl: string; token: string; path: string }>> {
  if (!ALLOWED_EXT.includes(docExtOf(filename))) {
    return { ok: false, error: 'Alleen PDF, DOCX, TXT of MD worden ondersteund.', code: 'INGEST_TYPE' };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: 'Ongeldige bestandsgrootte.', code: 'INPUT_INVALID' };
  }
  if (sizeBytes > MAX_DOC_BYTES) {
    return { ok: false, error: 'Bestand te groot (max 10 MB).', code: 'INGEST_TOO_LARGE' };
  }
  await pretendDelay(200, 400);
  const id = Math.random().toString(36).slice(2, 10);
  return { ok: true, signedUrl: '', token: 'voorbeeld', path: `voorbeeld/${id}-${filename}` };
}

export async function processUploadedDocAction(
  path: string,
  filename: string,
): Promise<ActionResult<{ documentId: string; chunks: number }>> {
  if (!ALLOWED_EXT.includes(docExtOf(filename))) {
    return { ok: false, error: 'Alleen PDF, DOCX, TXT of MD worden ondersteund.', code: 'INGEST_TYPE' };
  }
  await pretendDelay(1200, 2000);
  return { ok: true, documentId: `vb-doc-${path.split('/').pop()?.slice(0, 8) ?? Date.now()}`, chunks: 4 + Math.floor(Math.random() * 9) };
}

// ─── Losse pagina importeren ────────────────────────────────────────────────

export async function scrapeSinglePageAction(rawUrl: string): Promise<ActionResult> {
  const url = normalizeUrl(rawUrl);
  const host = hostOf(url);
  if (!host) return invalidUrl();
  await pretendDelay(900, 1400);
  const now = new Date().toISOString();
  const page = { ...demoPageFromUrl(url), lastProcessedAt: now };
  const existing = current().find((s) => s.source.host === host);
  if (existing) {
    sources = current().map((s) =>
      s === existing
        ? { ...s, pages: s.pages.some((p) => p.url === page.url) ? s.pages : [...s.pages, page] }
        : s,
    );
  } else {
    sources = [
      ...current(),
      {
        source: { id: `vb-src-${Date.now()}`, rootUrl: url, host, status: 'ready' },
        job: null,
        pages: [page],
      },
    ];
  }
  return { ok: true };
}

// ─── Document lezen (bronnen-viewer) ────────────────────────────────────────

export async function getDocContentAction(
  docId: string,
): Promise<ActionResult<{ title: string; text: string }>> {
  await pretendDelay(200, 400);
  const doc = DEMO_DOCUMENTS.find((d) => d.id === docId);
  if (!doc) {
    return {
      ok: true,
      title: 'Document',
      text: 'In het voorbeeld wordt een geüpload bestand niet echt gelezen. Bij een echte upload zie je hier de tekst die je chatbot gebruikt.',
    };
  }
  return { ok: true, title: doc.filename, text: demoDocText(docId) };
}

export async function getPageContentAction(
  pageId: string,
): Promise<ActionResult<{ title: string; url: string; text: string }>> {
  await pretendDelay(200, 400);
  const page = current().flatMap((s) => s.pages).find((p) => p.id === pageId);
  if (!page) return { ok: false, error: 'Pagina niet gevonden.', code: 'NOT_FOUND' };
  return { ok: true, title: page.title, url: page.url, text: demoPageText(page.url) };
}

// ─── Document verwijderen ────────────────────────────────────────────────────

export async function deleteDocumentAction(docId: string): Promise<ActionResult> {
  if (!docId) return { ok: false, error: 'Document niet gevonden.', code: 'NOT_FOUND' };
  await pretendDelay();
  return { ok: true };
}
