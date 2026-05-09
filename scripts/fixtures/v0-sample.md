# ChatManta — V0 sample document

Dit is een testdocument voor de V0 RAG-ingest. Het bestaat uit drie kleine secties zodat we kunnen verifieren dat chunking, embedding en retrieval werken.

## Over Jorion Solutions

Jorion Solutions is het softwarebedrijf van Sebastiaan Olyslag. Het bouwt SaaS-producten voor het MKB, met een focus op AI-toepassingen die direct meetbare waarde leveren. ChatManta is het eerste product van Jorion Solutions.

## Wat doet ChatManta?

ChatManta is een knowledge-bot voor MKB-bedrijven. Klanten uploaden documenten en koppelen hun website; ChatManta crawlt de inhoud, indexeert die vectorieel via pgvector, en stelt een chatbot beschikbaar als embedded widget op de klantwebsite. De chatbot beantwoordt bezoekersvragen op basis van die kennisbasis — geen verzonnen antwoorden, geen ongebreidelde LLM-output.

## Kernprincipes

ChatManta is gebouwd rond drie principes:

1. Multi-tenancy by design — elk stukje klantdata heeft een organization_id en is afgeschermd via Row-Level Security.
2. Anti-hallucinatie — als geen enkele opgehaalde chunk een minimale similarity haalt, valt de bot terug op een vooraf ingestelde fallback-zin in plaats van iets te verzinnen.
3. Cost-discipline — elke LLM-call wordt gelogd met token-gebruik en EUR-equivalent zodat per-tenant budgetten enforceable zijn.

## Stack

V1 draait op Next.js 14+ (App Router) met TypeScript, Supabase (Postgres + Auth + Storage + pgvector) in de West Europe region, Anthropic Claude Haiku 4.5 voor de actieve LLM-calls, OpenAI text-embedding-3-small (1536 dimensies) voor embeddings, en Firecrawl voor het crawlen van klantwebsites met een limiet van 50 pagina's per crawl. Hosting en cron jobs draaien op Vercel.
