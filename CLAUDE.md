@AGENTS.md

## graphify (optioneel hulpmiddel)

Lokaal kan er een knowledge graph in `graphify-out/` staan (gitignored, per machine). Bij cross-module "hoe hangt X aan Y"-vragen kan `graphify query "<vraag>"`, `graphify path "<A>" "<B>"` of `graphify explain "<concept>"` sneller zijn dan grep. De graaf veroudert snel: check de datum van `graphify-out/GRAPH_REPORT.md` en ververs met `graphify update .` (AST-only, gratis) als hij ouder is dan een paar weken. Ontbreekt hij: gebruik gewoon de normale zoek-tools.
