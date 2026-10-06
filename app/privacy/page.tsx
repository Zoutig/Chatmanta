// Publieke privacyverklaring (buiten de V0-wachtwoordgate — zie de allowlist in
// proxy.ts). Gelinkt vanuit de feedbackformulieren (akkoord-checkbox) en de widget.
//
// ⚠️ JURIDISCHE TEKST — V1-versie (okt 2026), opgesteld op basis van wat de V1-code
// feitelijk verwerkt (lib/v1, app/api/v1, supabase/migrations-v1). Geen juridisch
// advies: moet door Sebastiaan/Niels worden nagelezen en goedgekeurd vóór go-live.
// Resterende gaten die alleen Sebastiaan kan invullen zijn met [BEVESTIG: …]
// gemarkeerd en worden op de pagina zichtbaar geel gemarkeerd (zie <Bevestig>).
//
// Houd deze tekst in sync met de code: nieuwe sub-verwerker, nieuw opgeslagen
// persoonsgegeven of een gewijzigde bewaartermijn = deze pagina bijwerken.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacyverklaring · ChatManta',
  description: 'Hoe ChatManta omgaat met persoonsgegevens.',
};

const UPDATED = '6 oktober 2026';

/** Zichtbaar gemarkeerd gat dat vóór go-live ingevuld moet worden. */
function Bevestig({ children }: { children: React.ReactNode }) {
  return (
    <mark style={{ background: '#fef08a', color: '#713f12', padding: '0 4px', borderRadius: 3 }}>
      [BEVESTIG: {children}]
    </mark>
  );
}

// Eén plek voor het contactadres, zodat het overal tegelijk goed staat.
const CONTACT = <Bevestig>privacy-contactadres, bijv. privacy@chatmanta.com (mailbox/doorsturing aanmaken)</Bevestig>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.65, color: '#374151' }}>{children}</div>
    </section>
  );
}

function SubTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 15.5, fontWeight: 600, margin: '16px 0 4px', color: '#111827' }}>{children}</h3>;
}

const list = { paddingLeft: 20, marginTop: 8 } as const;
const gap = { marginTop: 8 } as const;

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '48px 20px 80px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: '#374151',
      }}
    >
      <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, color: '#111827' }}>Privacyverklaring</h1>
      <p style={{ fontSize: 13.5, color: '#6b7280', marginTop: 6 }}>Laatst bijgewerkt: {UPDATED}</p>

      <p style={{ fontSize: 15, lineHeight: 1.65, marginTop: 20 }}>
        ChatManta is een chatbot-dienst van Jorion Solutions. Bedrijven (onze <strong>klanten</strong>)
        plaatsen de ChatManta-chatbot op hun eigen website, zodat hun bezoekers daar vragen kunnen
        stellen. In deze verklaring leggen we in gewone taal uit welke persoonsgegevens daarbij
        worden verwerkt, waarom, met wie we ze delen, hoe lang we ze bewaren en welke rechten je hebt.
      </p>

      <Section title="1. Wie zijn wij en wie is verantwoordelijk?">
        <p>
          ChatManta is een dienst van Jorion Solutions, <Bevestig>vestigingsadres</Bevestig>,
          {' '}<Bevestig>KVK-nummer (inschrijving loopt nog)</Bevestig>. Vragen over privacy kun je
          stellen via {CONTACT}.
        </p>
        <p style={gap}>
          De AVG (de Europese privacywet) maakt onderscheid tussen een{' '}
          <strong>verwerkingsverantwoordelijke</strong> — de partij die bepaalt <em>waarom</em> en{' '}
          <em>hoe</em> gegevens worden verwerkt — en een <strong>verwerker</strong>, die gegevens
          alleen in opdracht van die verantwoordelijke verwerkt. Vergelijk het met een boekhouder: de
          ondernemer beslist wat er met de administratie gebeurt, de boekhouder voert het uit. Bij
          ChatManta zijn er twee situaties:
        </p>
        <ul style={list}>
          <li>
            <strong>Je chat met een chatbot op de website van een bedrijf.</strong> Dan is{' '}
            <em>dat bedrijf</em> (onze klant) verantwoordelijk voor jouw gegevens, en is Jorion
            Solutions de verwerker die de chatbot technisch voor hen draait. Wil je weten wat dat
            bedrijf met je gegevens doet, of wil je je rechten uitoefenen? Kijk dan in hún
            privacyverklaring of neem contact met hen op. Komt je verzoek bij ons binnen, dan sturen we
            het door of helpen we de klant het af te handelen.
          </li>
          <li>
            <strong>Je bent klant of gebruiker van ons klantportaal, of je neemt zelf contact met ons
            op.</strong> Dan is Jorion Solutions zelf de verwerkingsverantwoordelijke.
          </li>
        </ul>
      </Section>

      <Section title="2. Welke gegevens verwerken we?">
        <SubTitle>A. Als je de chatbot op de website van een klant gebruikt</SubTitle>
        <ul style={list}>
          <li>
            <strong>Je vragen en de antwoorden van de chatbot</strong>, met het tijdstip en een
            willekeurige gespreks-code zodat de berichten van één gesprek bij elkaar blijven. Typ je
            zelf persoonsgegevens in je vraag (zoals je naam of telefoonnummer), dan worden die
            ook opgeslagen — doe dat dus alleen als het nodig is.
          </li>
          <li>
            <strong>Je duimpje omhoog/omlaag</strong> en een eventuele toelichting die je bij een
            antwoord achterlaat.
          </li>
          <li>
            <strong>Een versleutelde versie van je IP-adres.</strong> We slaan je IP-adres niet
            leesbaar op, maar alleen als een onomkeerbare, met een geheime sleutel versleutelde code
            (een &ldquo;hash&rdquo;). Daarmee kunnen we bijvoorbeeld unieke bezoekers tellen zonder te
            weten wie je bent. Daarnaast gebruiken we je IP-adres heel kort (ongeveer een minuut) om
            te tellen hoeveel verzoeken je doet, zodat niemand de chatbot kan overbelasten.
          </li>
          <li>
            <strong>Een bezoekers-code in je browser.</strong> De chatbot bewaart een willekeurige code
            in de lokale opslag van je browser (&ldquo;localStorage&rdquo;, vergelijkbaar met een
            cookie). Die code bevat geen naam of andere herkenbare gegevens en wordt alleen gebruikt
            om je chatsessie technisch te laten werken. De chatbot plaatst geen tracking- of
            advertentiecookies.
          </li>
          <li>
            <strong>Een contactverzoek, alleen als je dat zelf indient.</strong> Sommige klanten
            hebben in de chatbot een contactformulier aangezet (standaard staat het uit). Vul je dat
            in en geef je toestemming, dan verwerken we je naam, e-mailadres en/of telefoonnummer,
            je voorkeur voor contact, het onderwerp en je bericht. Het verzoek wordt per e-mail
            doorgestuurd naar het bedrijf dat je wilt bereiken.
          </li>
        </ul>

        <SubTitle>B. Als je klant bent of ons klantportaal gebruikt</SubTitle>
        <ul style={list}>
          <li>
            <strong>Accountgegevens</strong>: je e-mailadres, je naam (als je die opgeeft) en je
            wachtwoord. Je wachtwoord slaan we nooit leesbaar op, alleen als versleutelde hash.
            Om ingelogd te blijven gebruikt het portaal noodzakelijke inlogcookies.
          </li>
          <li>
            <strong>Een logboek van belangrijke acties</strong> in het portaal (bijvoorbeeld wie een
            instelling wijzigde en wanneer), met een versleutelde versie van het IP-adres — voor
            beveiliging en om problemen te kunnen uitzoeken.
          </li>
          <li>
            <strong>Kennisbank-inhoud</strong> die je ons aanlevert: de tekst van je eigen website
            (die we op jouw verzoek automatisch uitlezen, &ldquo;crawlen&rdquo;), documenten die je
            uploadt en vragen-en-antwoorden die je zelf invoert. Staan daar persoonsgegevens in
            (bijvoorbeeld namen van medewerkers op je website), dan verwerken we die mee.
          </li>
          <li>
            <strong>Meldingen en feedback</strong> die je via het portaal indient: je naam, je
            e-mailadres, je beschrijving en — optioneel — een gesprek, de gestelde vraag en een
            bijlage.
          </li>
          <li>
            <strong>Zakelijke contactgegevens</strong> die we voor de samenwerking nodig hebben, zoals
            de contactpersoon en het e-mailadres voor meldingen.
          </li>
        </ul>

        <SubTitle>C. Technische gegevens</SubTitle>
        <p>
          Zoals bij vrijwel elke website registreert onze hostingpartij bij elk verzoek technische
          gegevens zoals IP-adres, tijdstip en browsertype in serverlogboeken. Bij technische fouten
          sturen we een foutrapport naar onze foutmonitoringdienst; persoonsgegevens zoals
          e-mailadressen en telefoonnummers worden daar vooraf uit gefilterd en IP-adressen worden
          daar niet opgeslagen.
        </p>
      </Section>

      <Section title="3. Waarvoor gebruiken we deze gegevens?">
        <ul style={list}>
          <li>De chatbot laten werken: je vraag beantwoorden op basis van de kennisbank van de klant.</li>
          <li>
            De klant inzicht geven in de gesprekken, zodat die de chatbot en de informatie op zijn
            website kan verbeteren.
          </li>
          <li>Contactverzoeken doorsturen naar het bedrijf dat je wilt bereiken.</li>
          <li>Klantaccounts beheren, inloggen mogelijk maken en meldingen afhandelen.</li>
          <li>
            Misbruik, overbelasting en technische problemen voorkomen en oplossen, en de kwaliteit van
            de chatbot bewaken.
          </li>
        </ul>
        <p style={gap}>
          We verkopen je gegevens nooit, gebruiken ze niet voor advertenties en maken geen profielen
          van bezoekers.
        </p>
      </Section>

      <Section title="4. Op welke grondslag?">
        <p>De AVG eist een wettelijke reden (&ldquo;grondslag&rdquo;) voor elke verwerking. Wij gebruiken:</p>
        <ul style={list}>
          <li>
            <strong>Uitvoering van de overeenkomst</strong> — voor klantaccounts en het leveren van
            de dienst aan onze klanten.
          </li>
          <li>
            <strong>Toestemming</strong> — voor contactverzoeken via de chatbot en voor meldingen die
            je indient. Je kunt je toestemming altijd intrekken.
          </li>
          <li>
            <strong>Gerechtvaardigd belang</strong> — om de dienst veilig en werkend te houden
            (beveiliging, misbruikpreventie, foutopsporing).
          </li>
        </ul>
        <p style={gap}>
          Voor chatgesprekken op de website van een klant bepaalt <em>die klant</em> de grondslag,
          omdat de klant daar de verwerkingsverantwoordelijke is.
        </p>
      </Section>

      <Section title="5. Hoe lang bewaren we je gegevens?">
        <p>We bewaren gegevens niet langer dan nodig:</p>
        <ul style={list}>
          <li>
            <strong>Contactverzoeken</strong> (naam, e-mail, telefoon): automatisch en definitief
            verwijderd na <strong>90 dagen</strong>.
          </li>
          <li>
            <strong>Chatgesprekken, feedback en versleutelde IP-adressen</strong>: zolang de klant
            ChatManta gebruikt, zodat de klant de gesprekken kan terugkijken. Na afloop van de
            samenwerking, of eerder als de klant daarom vraagt, verwijderen we ze volgens de
            afspraken in de verwerkersovereenkomst met die klant.
          </li>
          <li>
            <strong>Klantaccounts en kennisbank-inhoud</strong>: zolang de samenwerking loopt;
            daarna verwijderen we ze, tenzij een wettelijke bewaarplicht (bijvoorbeeld voor de
            boekhouding) langer bewaren vereist.
          </li>
          <li>
            <strong>Meldingen en feedback via het portaal</strong>: zolang nodig om de melding af te
            handelen en daarna niet langer dan nodig.
          </li>
          <li>
            <strong>Rate-limit-tellers</strong> (op basis van je IP-adres): ongeveer een minuut.
          </li>
        </ul>
      </Section>

      <Section title="6. Met wie delen we gegevens?">
        <p>
          We schakelen een aantal gespecialiseerde leveranciers in die ons helpen de dienst te
          leveren. Zij heten in AVG-taal <strong>sub-verwerkers</strong>: ze verwerken gegevens
          alleen in onze opdracht en mogen ze niet voor eigen doeleinden gebruiken. Waar mogelijk
          kiezen we voor opslag en verwerking binnen de Europese Unie.
        </p>
        <ul style={list}>
          <li>
            <strong>OpenAI</strong> (Verenigde Staten) — het AI-model dat de antwoorden formuleert en
            teksten omzet naar zoekbare &ldquo;embeddings&rdquo;. Ontvangt je vraag, het gesprek tot
            dan toe en relevante stukken uit de kennisbank van de klant. Volgens OpenAI&rsquo;s
            zakelijke voorwaarden worden gegevens die via hun API binnenkomen standaard niet gebruikt
            om hun modellen te trainen.
          </li>
          <li>
            <strong>Supabase</strong> (opslag in Ierland, EU) — database, bestandsopslag en
            inlogsysteem. Hier worden de gegevens uit deze verklaring opgeslagen.
          </li>
          <li>
            <strong>Vercel</strong> (servers in Dublin, Ierland, EU) — hosting van de website, de
            chatbot en het klantportaal.
          </li>
          <li>
            <strong>Upstash</strong> (Frankfurt, Duitsland, EU) — het kortstondig tellen van verzoeken
            per IP-adres om misbruik te voorkomen.
          </li>
          <li>
            <strong>Firecrawl</strong> (Verenigde Staten) — het uitlezen van de openbare website van
            een klant om de kennisbank te vullen. Verwerkt geen gegevens van chatbezoekers.
          </li>
          <li>
            <strong>Resend</strong> (Verenigde Staten) — het versturen van e-mails, zoals
            contactverzoeken aan klanten, uitnodigingen en wachtwoord-mails.
          </li>
          <li>
            <strong>Sentry</strong> (opslag in Frankfurt, Duitsland, EU) — foutmonitoring.
            Persoonsgegevens worden vooraf uit foutrapporten gefilterd en IP-adressen worden niet
            opgeslagen.
          </li>
        </ul>
        <p style={gap}>
          <strong>Doorgifte buiten Europa.</strong> Een deel van deze leveranciers is gevestigd in de
          Verenigde Staten; ook bij opslag in de EU kan toegang vanuit de VS daardoor niet volledig
          worden uitgesloten. Voor zulke doorgifte gelden de waarborgen die de AVG voorschrijft: het
          EU-US Data Privacy Framework (een afspraak tussen de EU en de VS over gegevensbescherming,
          voor deelnemende bedrijven) en/of de modelcontracten van de Europese Commissie
          (&ldquo;standaardcontractbepalingen&rdquo;, ook wel SCC&rsquo;s).
        </p>
        <p style={gap}>
          Daarnaast delen we gegevens alleen als de wet ons daartoe verplicht, bijvoorbeeld op
          bevel van een rechter of toezichthouder.
        </p>
      </Section>

      <Section title="7. Jouw rechten">
        <p>Volgens de AVG heb je onder meer het recht om:</p>
        <ul style={list}>
          <li>je gegevens in te zien en een kopie te krijgen;</li>
          <li>onjuiste gegevens te laten corrigeren;</li>
          <li>je gegevens te laten verwijderen;</li>
          <li>bezwaar te maken tegen de verwerking of die te laten beperken;</li>
          <li>je gegevens over te laten dragen aan een andere partij;</li>
          <li>je toestemming in te trekken, als je die eerder gaf.</li>
        </ul>
        <p style={gap}>
          Heb je met de chatbot op de website van een bedrijf gepraat, richt je verzoek dan bij
          voorkeur aan dat bedrijf (zie paragraaf 1). Voor al het andere, of als je er niet uitkomt,
          kun je mailen naar {CONTACT}. We reageren binnen een maand. Omdat de chatbot je naam
          standaard niet vastlegt, kunnen we je soms vragen om aanvullende informatie (zoals het tijdstip of de
          inhoud van je vraag) om je gesprek terug te vinden.
        </p>
        <p style={gap}>
          Ben je het niet eens met hoe we met je gegevens omgaan? Dan kun je een klacht indienen bij
          de Autoriteit Persoonsgegevens (autoriteitpersoonsgegevens.nl).
        </p>
      </Section>

      <Section title="8. Beveiliging">
        <p>
          We nemen passende technische en organisatorische maatregelen om je gegevens te
          beschermen, waaronder:
        </p>
        <ul style={list}>
          <li>versleutelde verbindingen (https) voor al het verkeer;</li>
          <li>
            strikte scheiding tussen klanten: elke klant kan alleen bij de eigen gegevens, en dat
            wordt ook op databaseniveau afgedwongen;
          </li>
          <li>IP-adressen en wachtwoorden worden alleen versleuteld opgeslagen;</li>
          <li>geüploade documenten en bijlagen staan in afgeschermde, niet-openbare opslag;</li>
          <li>
            de chatbot kan worden beperkt tot de websites van de klant, en er gelden limieten op
            het aantal verzoeken tegen misbruik.
          </li>
        </ul>
      </Section>

      <Section title="9. Wijzigingen">
        <p>
          We kunnen deze privacyverklaring aanpassen, bijvoorbeeld als we een nieuwe leverancier
          inschakelen. De meest actuele versie staat altijd op deze pagina, met de datum van de
          laatste wijziging bovenaan.
        </p>
      </Section>
    </main>
  );
}
