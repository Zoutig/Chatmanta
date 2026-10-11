import type { NextConfig } from "next";

const V0_MOVED_ROUTES = [
  "home",
  "login",
  "admindashboard",
  "klantendashboard",
  "admintool",
  "commandcenter",
  "widget",
] as const;

const nextConfig: NextConfig = {
  // Zorg dat de /v0/widget demo-route in productie z'n .md-bron-bestanden
  // kan lezen via fs.readFile. Standaard traced Next.js alleen files die
  // statisch geïmporteerd worden — onze loader leest dynamisch op pad,
  // dus moet de fixtures-map expliciet meegebundeld worden.
  outputFileTracingIncludes: {
    "/v0/widget/**": ["./scripts/fixtures/sandbox-orgs/**/*.md"],
  },
  // Documentparsers (admin-upload, taak 1): pdf-parse trekt pdfjs + dynamische
  // requires mee die een bundler breken; mammoth is zwaar. Op de server laten
  // requiren i.p.v. bundelen.
  // @react-pdf/renderer (Maandelijkse Recap PDF-export) pulls in fontkit/pdfkit
  // met dynamische requires die een bundler breken → server-side laten requiren.
  serverExternalPackages: ["pdf-parse", "mammoth", "@react-pdf/renderer"],
  // V0 verhuisde naar /v0/* (marketingsite M1) — oude bookmarks krijgen een
  // permanente 308. Querystrings gaan automatisch mee. Redirects draaien vóór
  // proxy.ts (Next 16 execution order), dus ook niet-ingelogde bezoekers komen
  // eerst op /v0/... en worden daarna pas door de V0-gate naar /v0/login gestuurd.
  // `/widget/:path*` is segment-gebonden: raakt /widget.js en /widget-v1.js NIET.
  async redirects() {
    return V0_MOVED_ROUTES.flatMap((route) => [
      { source: `/${route}`, destination: `/v0/${route}`, permanent: true },
      { source: `/${route}/:path*`, destination: `/v0/${route}/:path*`, permanent: true },
    ]);
  },
  experimental: {
    // Feedback-formulier (migratie 0043) accepteert een bijlage tot 10 MB via
    // een server action. De default body-limit is 1 MB — verhoog naar 12 MB zodat
    // een 10 MB-bestand + form-velden ruim passen.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
