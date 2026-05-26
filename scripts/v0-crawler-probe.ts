import { mapSite, scrapeOne } from '../lib/v0/crawler/firecrawl';

async function main() {
  const target = process.argv[2] ?? 'https://example.com';
  console.log('mapSite:', target);
  const urls = await mapSite(target, 10);
  console.log(` → ${urls.length} URLs`, urls.slice(0, 5));

  const one = urls[0] ?? target;
  console.log('scrapeOne:', one);
  const page = await scrapeOne(one);
  console.log(` → title=${page.title} status=${page.statusCode} mdLen=${page.markdown.length} err=${page.error}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
