import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zorg dat de /widget demo-route in productie z'n .md-bron-bestanden
  // kan lezen via fs.readFile. Standaard traced Next.js alleen files die
  // statisch geïmporteerd worden — onze loader leest dynamisch op pad,
  // dus moet de fixtures-map expliciet meegebundeld worden.
  outputFileTracingIncludes: {
    "/widget/**": ["./scripts/fixtures/sandbox-orgs/**/*.md"],
  },
  // Documentparsers (admin-upload, taak 1): pdf-parse trekt pdfjs + dynamische
  // requires mee die een bundler breken; mammoth is zwaar. Op de server laten
  // requiren i.p.v. bundelen.
  serverExternalPackages: ["pdf-parse", "mammoth"],
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
