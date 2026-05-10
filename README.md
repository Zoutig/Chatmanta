# ChatManta

RAG-gebaseerde chatbot SaaS voor MKB. Pre-build (V1).

## Voor nieuwe developers

- **Mens?** Lees [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — setup, werkwijze, hard rules.
- **Claude Code agent?** Lees [`AGENTS.md`](AGENTS.md) en daarna [`docs/ONBOARDING_AGENT.md`](docs/ONBOARDING_AGENT.md).
- **Deploy info?** [`DEPLOY.md`](DEPLOY.md).

## Snel starten

```bash
npm install                      # zet automatisch git pre-push hook aan
cp .env.local.example .env.local # vul de keys in (vraag aan teamlead)
npm run check-env                # verifieer env vars
npm run dev                      # start dev server op localhost:3000
```

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Supabase (Postgres + pgvector + Auth + Storage) · Anthropic Claude Haiku · OpenAI embeddings · Firecrawl · Vercel
