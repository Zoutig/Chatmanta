# Werken in een dev-container (Docker)

Deze gids is voor mensen, geschreven voor een beginner. Hij legt uit hoe je
ChatManta op **elke PC** snel draaiend krijgt via een "dev-container" — zonder
zelf Node, tools en dependencies te installeren.

## Wat is dit, in één zin?

Een **dev-container** is een afgesloten doosje (een Docker-container) waarin de
juiste Node-versie, de juiste tools én Claude Code al klaarstaan. Jij opent het
project erin; alles werkt overal hetzelfde. Het beruchte *"bij mij werkt het
wél"* verdwijnt.

> Je hoeft **geen Docker-kennis** te hebben. Je installeert het programma één
> keer, en VS Code regelt de rest op basis van `.devcontainer/devcontainer.json`.

## Eenmalig installeren (per PC)

1. **Docker Desktop** — https://www.docker.com/products/docker-desktop/ (start het na installatie; het moet draaien).
2. **Visual Studio Code** — https://code.visualstudio.com/
3. De VS Code-extensie **"Dev Containers"** (van Microsoft) — zoek in VS Code via
   het extensies-paneel op `Dev Containers` en installeer.

## Het project openen op een nieuwe PC

Je hebt twee manieren. **Op Windows raad ik manier B aan** (sneller).

### Manier A — repo eerst clonen, dan in container openen
```bash
gh repo clone Zoutig/Chatmanta
```
Open de map in VS Code → linksonder klik je op het groene hoekje → kies
**"Reopen in Container"**. De eerste keer bouwt Docker het doosje (paar minuten);
daarna gaat het snel. `npm ci` draait automatisch.

> ⚠️ **Windows-snelheid:** bij manier A staat de code op je Windows-schijf en
> "kijkt" de container er doorheen. Dat maakt de Next.js dev-server merkbaar
> traag. Gebruik liever manier B.

### Manier B — clonen rechtstreeks ín de container (snel, aanbevolen op Windows)
In VS Code: open het commando-palet (`F1` of `Ctrl+Shift+P`) → typ en kies
**"Dev Containers: Clone Repository in Container Volume"** → plak
`Zoutig/Chatmanta`. VS Code clonet de repo in een snelle Docker-opslag (geen
Windows-schijf ertussen) en opent meteen de container. Dit is het snelst.

## De geheimen (`.env.local`) — de enige handmatige stap

De API-sleutels staan **bewust niet** in git en zitten dus niet in de container.
Je moet ze één keer per nieuwe omgeving binnenhalen. Twee opties:

**Snel (aanbevolen): via Vercel.** De sleutels staan al in het Vercel-project.
In de terminal *binnen de container*:
```bash
vercel login          # eenmalig inloggen (opent een link)
vercel link           # koppel deze map aan het ChatManta-project
vercel env pull .env.local   # trekt de variabelen binnen als .env.local
```

**Handmatig (altijd-werkt fallback):** kopieer het voorbeeldbestand en vul zelf in.
```bash
cp .env.local.example .env.local
```
Open daarna `.env.local` en vul de echte waarden in (Sebastiaan deelt die via een
password manager — nooit via mail/Slack). Welke variabelen verplicht zijn, staat
met uitleg in `.env.local.example`.

> Komt `vercel env pull` met te weinig variabelen terug? Dan staan sommige in
> Vercel alleen op "Production". Vul de ontbrekende dan bij uit
> `.env.local.example`.

## Controleren dat alles werkt

In de terminal binnen de container:
```bash
npm run check-env    # checkt of alle env-variabelen er zijn
npm run dev          # start de dev-server → http://localhost:3000
```
Poort 3000 wordt automatisch naar je browser doorgezet.

## Wat zit er al in de container?

- **Node 20** + npm + git
- **GitHub CLI** (`gh`) — voor PR's
- **Claude Code** (`claude`) — meteen te starten in de terminal
- **Vercel CLI** (`vercel`) — voor de geheimen-stap hierboven
- VS Code-extensies: ESLint, Tailwind, Claude Code

## Veelvoorkomende vragen

- **"Reopen in Container" verschijnt niet** → check of de extensie *Dev Containers*
  geïnstalleerd is en of Docker Desktop draait.
- **Dev-server traag op Windows** → gebruik manier B (Clone in Container Volume).
- **Iets klopt niet na een wijziging aan de config** → commando-palet →
  *"Dev Containers: Rebuild Container"*.
- **Wil je Playwright e2e-tests ín de container draaien?** Die browsers zitten er
  bewust niet standaard in (zwaar). Draai eenmalig
  `npx playwright install --with-deps` in de container. Meestal test je via de
  host, dus dit is zelden nodig.

## Wat de container NIET vervangt

- Je `~/.claude`-configuratie (instellingen/geheugen van Claude Code) — die
  reist apart mee via je privé `claude-config` git-repo.
- De geheimen (`.env.local`) — zie de stap hierboven.
- Productie-hosting — dat doet Vercel op zijn eigen manier; die gebruikt deze
  container niet.
