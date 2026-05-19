import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zorg dat de /widget demo-route in productie z'n .md-bron-bestanden
  // kan lezen via fs.readFile. Standaard traced Next.js alleen files die
  // statisch geïmporteerd worden — onze loader leest dynamisch op pad,
  // dus moet de fixtures-map expliciet meegebundeld worden.
  outputFileTracingIncludes: {
    "/widget/**": ["./scripts/fixtures/sandbox-orgs/**/*.md"],
  },
};

export default nextConfig;
