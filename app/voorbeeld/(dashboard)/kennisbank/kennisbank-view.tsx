'use client';

// V1 Kennisbank (spec §7.4): PageHeader met één hoofdknop "Toevoegen" (menu),
// kennisquiz-melding, tabs Documenten / Website / Q&A (via ?tab= in de URL) en
// slepen-en-neerzetten van bestanden op de hele pagina.
//
// Alle drie de tabs blijven gemount (verborgen met `hidden`): zo blijft o.a. de
// crawl-polling doorlopen en kloppen de tellers op de tabs. De upload-flow is
// in het voorbeeld zonder echte upload (createUploadUrlAction → processUploadedDocAction,
// beide doen alsof; er gaat geen bestand de deur uit).

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Globe, MessageSquarePlus, Plus, Upload, UploadCloud } from 'lucide-react';
import { ALLOWED_DOC_EXT } from '@/lib/rag/doc-ext';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { buttonClass } from '@/app/v1/_ui/button';
import { Menu } from '@/app/v1/_ui/menu';
import { Tabs } from '@/app/v1/_ui/tabs';
import { AttentionBlock } from '@/app/v1/_ui/feedback';
import { useToast } from '@/app/v1/_ui/toast';
import { createUploadUrlAction, processUploadedDocAction } from './actions';
import type { WebsiteSource } from './types';
import { parseKbTab, type KbTab } from './kb-tab';
import { V1Documents, extOf, type FailedUpload, type UploadedDoc } from './v1-documents';
import { WebsiteTab } from './components/website-tab';
import { QATab, type QAItem } from './qa/qa-tab';
import { readDemoQA, useDemoQA, writeDemoQA } from '@/lib/voorbeeld/demo-store';

const MAX_DOC_BYTES = 10 * 1024 * 1024;
const ACCEPT = ALLOWED_DOC_EXT.map((e) => `.${e}`).join(',');
const ID_PREFIX = 'kb';

/** Client-side voorcontrole (UX); de server blijft autoritatief. */
function precheck(file: File): string | null {
  if (!(ALLOWED_DOC_EXT as readonly string[]).includes(extOf(file.name))) {
    return 'Alleen PDF, DOCX, TXT of MD worden ondersteund.';
  }
  if (file.size === 0) return 'Leeg bestand.';
  if (file.size > MAX_DOC_BYTES) return 'Bestand te groot (max 10 MB).';
  return null;
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function KennisbankView({
  initialTab,
  initialDocs,
  initialSources,
  initialQA,
  prefillQuestion,
  quizOpen,
}: {
  initialTab: KbTab;
  initialDocs: UploadedDoc[];
  initialSources: WebsiteSource[];
  initialQA: QAItem[];
  prefillQuestion?: string;
  quizOpen: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [tab, setTabState] = useState<KbTab>(initialTab);
  const [docs, setDocs] = useState<UploadedDoc[]>(initialDocs);
  const [failures, setFailures] = useState<FailedUpload[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [sources, setSources] = useState<WebsiteSource[]>(initialSources);
  // Q&A leeft in de browser van de bezoeker (demo-store); zonder eigen wijziging de voorbeeldlijst.
  const storedQA = useDemoQA();
  const qa: QAItem[] = storedQA ?? initialQA;
  const setQa = useCallback<Dispatch<SetStateAction<QAItem[]>>>(
    (v) => writeDemoQA(typeof v === 'function' ? v(readDemoQA() ?? initialQA) : v),
    [initialQA],
  );
  const [crawlRequest, setCrawlRequest] = useState(0);
  const [qaRequest, setQaRequest] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Tab ↔ URL. Eigen wissels gaan via history.replaceState (geen server-rondje);
  // een externe navigatie naar ?tab=… (zijbalk, Overzicht) zet de tab hier.
  const urlTab = parseKbTab(searchParams.get('tab'));
  const [seenUrlTab, setSeenUrlTab] = useState(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    if (urlTab) setTabState(urlTab);
  }

  const setTab = useCallback(
    (next: KbTab) => {
      setTabState(next);
      window.history.replaceState(null, '', `${pathname}?tab=${next}`);
    },
    [pathname],
  );

  // ── Upload ──────────────────────────────────────────────────────────────
  const fail = useCallback(
    (filename: string, error: string) => {
      setFailures((f) => [{ id: `${Date.now()}-${Math.random()}`, filename, error }, ...f]);
      toast.error(`${filename}: ${error}`);
    },
    [toast],
  );

  const uploadOne = useCallback(
    async (file: File) => {
      const pre = precheck(file);
      if (pre) {
        fail(file.name, pre);
        return;
      }
      // Optimistisch rij toevoegen terwijl de upload bezig is.
      const tempId = `uploading-${Date.now()}-${file.name}`;
      setDocs((d) => [
        { id: tempId, filename: file.name, status: 'processing', createdAt: new Date().toISOString(), chunkCount: 0 },
        ...d,
      ]);
      const drop = () => setDocs((d) => d.filter((x) => x.id !== tempId));
      setUploadingCount((n) => n + 1);
      try {
        const urlRes = await createUploadUrlAction(file.name, file.size);
        if (!urlRes.ok) { drop(); fail(file.name, urlRes.error); return; }
        const proc = await processUploadedDocAction(urlRes.path, file.name);
        if (!proc.ok) { drop(); fail(file.name, proc.error); return; }
        // Vervang de temp-rij door de definitieve (met chunk-count + server-id).
        setDocs((d) => d.map((x) => (x.id === tempId
          ? { id: proc.documentId, filename: file.name, status: 'ready', createdAt: new Date().toISOString(), chunkCount: proc.chunks }
          : x)));
        toast.success(`${file.name} toegevoegd`);
        router.refresh();
      } catch {
        drop();
        fail(file.name, 'Upload mislukt. Probeer het opnieuw.');
      } finally {
        setUploadingCount((n) => n - 1);
      }
    },
    [fail, router, toast],
  );

  const ingestFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setTab('documenten');
      list.forEach((f) => void uploadOne(f));
    },
    [setTab, uploadOne],
  );

  const pickFiles = useCallback(() => fileRef.current?.click(), []);

  // ── Slepen-en-neerzetten op de hele pagina ──────────────────────────────
  useEffect(() => {
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // anders opent de browser het bestand
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [ingestFiles]);

  // ── Toevoegen-menu ──────────────────────────────────────────────────────
  const addItems = [
    {
      label: 'Document uploaden',
      icon: <Upload size={16} strokeWidth={1.8} aria-hidden="true" />,
      onSelect: () => {
        setTab('documenten');
        pickFiles();
      },
    },
    {
      label: 'Website ophalen',
      icon: <Globe size={16} strokeWidth={1.8} aria-hidden="true" />,
      onSelect: () => {
        setTab('website');
        setCrawlRequest((n) => n + 1);
      },
    },
    {
      label: 'Q&A schrijven',
      icon: <MessageSquarePlus size={16} strokeWidth={1.8} aria-hidden="true" />,
      onSelect: () => {
        setTab('qa');
        setQaRequest((n) => n + 1);
      },
    },
  ];

  const pageCount = sources.reduce((n, w) => n + w.pages.length, 0);
  const tabs = [
    { id: 'documenten' as const, label: 'Documenten', count: docs.filter((d) => !d.id.startsWith('uploading-')).length },
    { id: 'website' as const, label: 'Website', count: pageCount },
    { id: 'qa' as const, label: 'Q&A', count: qa.length },
  ];
  const panelProps = (id: KbTab) => ({
    id: `${ID_PREFIX}-panel-${id}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `${ID_PREFIX}-tab-${id}`,
    hidden: tab !== id,
    className: 'v1-kb-tab-body',
  });

  return (
    <div className="v1-page">
      <PageHeader
        title="Kennisbank"
        description="Alles waar je chatbot zijn antwoorden uit haalt."
        actions={
          <Menu
            label="Toevoegen"
            items={addItems}
            trigger={
              <>
                <Plus size={16} strokeWidth={2} aria-hidden="true" />
                Toevoegen
              </>
            }
            triggerClassName={buttonClass({ variant: 'primary' })}
          />
        }
      />

      {quizOpen ? (
        <AttentionBlock
          level="attention"
          title="Er staat een kennisquiz klaar"
          actions={
            <Link href="/voorbeeld/quiz" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              Start de quiz
            </Link>
          }
        >
          Een paar korte vragen, zodat je chatbot je bedrijf beter leert kennen.
        </AttentionBlock>
      ) : null}

      <div>
        <Tabs items={tabs} active={tab} onChange={setTab} label="Kennisbank" idPrefix={ID_PREFIX} />

        <div {...panelProps('documenten')}>
          <V1Documents
            docs={docs}
            setDocs={setDocs}
            failures={failures}
            onDismissFailure={(id) => setFailures((f) => f.filter((x) => x.id !== id))}
            onPickFiles={pickFiles}
            uploading={uploadingCount > 0}
          />
        </div>
        <div {...panelProps('website')}>
          <WebsiteTab sources={sources} setSources={setSources} crawlRequest={crawlRequest} />
        </div>
        <div {...panelProps('qa')}>
          <QATab items={qa} setItems={setQa} prefillQuestion={prefillQuestion} newRequest={qaRequest} />
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="v1-kb-file-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          if (e.target.files) ingestFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {dragging ? (
        <div className="v1-kb-overlay" aria-hidden="true">
          <div className="v1-kb-overlay-card">
            <span className="v1-kb-overlay-icon">
              <UploadCloud size={22} strokeWidth={1.8} />
            </span>
            Laat los om te uploaden
            <span>PDF, DOCX, TXT of MD, tot 10 MB</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
