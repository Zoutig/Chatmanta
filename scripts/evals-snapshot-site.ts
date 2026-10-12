// Plan 016 fase 2: bevroren snapshot van een echte MKB-site als eval-corpus (de "extra
// verticals"). Zelfde ophaal- en opschoonstap als de V1-crawler (één batch-scrape via het
// Firecrawl-loket + cleanCrawlPages), dus de KB lijkt op wat een klant krijgt. De snapshot
// staat BUITEN de publieke repo: ~/.chatmanta/eval-private/kb/<corpus>/pages.json.
// Kosten: 1 Firecrawl-credit per pagina (max 50, zoals de V1-crawler).
//
// Run: node --env-file=.env.local --conditions=react-server --import tsx scripts/evals-snapshot-site.ts \
//        --corpus=<naam> --company="<bedrijfsnaam>" --site=https://www.voorbeeld.nl --urls=<bestand met één URL per regel>

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startBatchScrape, getCrawlJobStatus } from '../lib/v1/crawler/firecrawl';
import { cleanCrawlPages } from '../lib/rag/clean-crawl';
import { privateKbDir } from '../lib/evals/eval-orgs';
import { sha256 } from '../lib/evals/text';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const corpus = arg('corpus');
const site = arg('site');
const urlsFile = arg('urls');
const company = arg('company');
if (!corpus || !site || !urlsFile || !company) {
  console.error('--corpus, --site, --company en --urls zijn verplicht');
  process.exit(1);
}

const MAX_PAGES = 50;

async function main() {
  const urls = readFileSync(urlsFile!, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_PAGES);
  const dir = privateKbDir(corpus!);
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'pages.json');
  if (existsSync(out)) throw new Error(`${out} bestaat al — een snapshot is bevroren; kies een nieuwe corpusnaam`);

  // Eén batch-call zoals de V1-crawler — losse scrapes zouden het gedeelde per-minuut-loket
  // (ook van productie) leegtrekken.
  const { crawlId, invalidURLs } = await startBatchScrape(urls);
  if (invalidURLs.length) console.warn(`geweigerd door Firecrawl: ${invalidURLs.join(', ')}`);
  let status = await getCrawlJobStatus(crawlId);
  while (status.status === 'scraping') {
    console.log(`batch ${crawlId}: ${status.completed}/${status.total}`);
    await new Promise((r) => setTimeout(r, 10_000));
    status = await getCrawlJobStatus(crawlId);
  }
  if (status.status !== 'completed') throw new Error(`batch-scrape ${status.rawStatus}`);
  const pages = status.pages;
  const clean = cleanCrawlPages(pages).filter((p) => !p.error && p.markdown.trim().length > 200);
  const kept = clean.map((p) => ({ url: p.url, title: p.title, markdown: p.markdown }));
  const snapshot = {
    corpus,
    company,
    site,
    fetchedAt: new Date().toISOString(),
    pages: kept,
    sha256: sha256(JSON.stringify(kept)),
  };
  writeFileSync(out, JSON.stringify(snapshot, null, 1));
  console.log(`\n${kept.length}/${urls.length} pagina's bewaard → ${out} (sha ${snapshot.sha256.slice(0, 12)})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌', e instanceof Error ? e.message : e);
    process.exit(1);
  });
