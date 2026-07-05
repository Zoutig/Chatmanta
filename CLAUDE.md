@AGENTS.md

## graphify (optioneel hulpmiddel)

Er staat lokaal een knowledge graph in `graphify-out/` (gitignored). Bij cross-module "hoe hangt X aan Y"-vragen kan `graphify query "<vraag>"`, `graphify path "<A>" "<B>"` of `graphify explain "<concept>"` sneller zijn dan grep. Na grote refactors bijwerken met `graphify update .` (AST-only, gratis). Ontbreekt de map of is hij verouderd: negeer graphify gewoon — de normale zoek-tools zijn prima.
