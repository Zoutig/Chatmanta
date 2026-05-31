// Publieke privacyverklaring (buiten de V0-wachtwoordgate — zie de allowlist in
// proxy.ts). Gelinkt vanuit het feedbackformulier (akkoord-checkbox).
//
// ⚠️ JURIDISCHE TEKST — SCAFFOLD. Inhoudelijk opgesteld op basis van wat het
// systeem feitelijk verwerkt; moet door Sebastiaan/Niels worden nagelezen en
// goedgekeurd vóór go-live (juridische verantwoordelijkheid ligt bij hen).
// Nog te bevestigen plekken zijn met [BEVESTIG: …] gemarkeerd.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacyverklaring · ChatManta',
  description: 'Hoe ChatManta omgaat met persoonsgegevens.',
};

const UPDATED = '31 mei 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.65, color: '#374151' }}>{children}</div>
    </section>
  );
}

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
        ChatManta is een chatbot-dienst van Jorion Solutions. In deze verklaring leggen we uit
        welke persoonsgegevens we verwerken wanneer je ons klantportaal of de chatbot gebruikt,
        waarom we dat doen, hoe lang we ze bewaren en welke rechten je hebt.
      </p>

      <Section title="1. Wie zijn wij?">
        <p>
          Verwerkingsverantwoordelijke is Jorion Solutions (ChatManta),
          {' '}[BEVESTIG: adres / KvK-nummer]. Vragen over privacy kun je stellen via
          {' '}[BEVESTIG: e-mailadres, bijv. privacy@chatmanta.nl].
        </p>
      </Section>

      <Section title="2. Welke gegevens verwerken we?">
        <p>Afhankelijk van hoe je ChatManta gebruikt, verwerken we:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li><strong>Meldingen / feedback</strong> die je indient: je naam, je e-mailadres, je beschrijving en — optioneel — een chat-ID, de gestelde vraag en een bijlage.</li>
          <li><strong>Chatgesprekken</strong> met de chatbot: de vragen en antwoorden, plus technische gegevens zoals tijdstip en een sessie-identificatie.</li>
          <li><strong>Technische gegevens</strong>: o.a. een geanonimiseerd IP-/sessiekenmerk en browsergegevens, voor beveiliging en het voorkomen van misbruik.</li>
        </ul>
      </Section>

      <Section title="3. Waarvoor gebruiken we deze gegevens?">
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Je melding behandelen en — als je dat wilt — contact met je opnemen.</li>
          <li>De chatbot en onze dienstverlening verbeteren.</li>
          <li>Misbruik, fraude en technische problemen voorkomen en oplossen.</li>
        </ul>
      </Section>

      <Section title="4. Op welke grondslag?">
        <p>
          We verwerken je gegevens op basis van je <strong>toestemming</strong> (die je geeft bij
          het indienen van een melding), de <strong>uitvoering van de overeenkomst</strong> met de
          organisatie via wie je ChatManta gebruikt, en ons <strong>gerechtvaardigd belang</strong>
          {' '}om onze dienst veilig en werkend te houden.
        </p>
      </Section>

      <Section title="5. Hoe lang bewaren we je gegevens?">
        <p>We bewaren gegevens niet langer dan nodig. Als richtlijn hanteren we:</p>
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Chatgesprekken: standaard ongeveer 30 dagen.</li>
          <li>Meldingen / feedback: standaard ongeveer 90 dagen.</li>
          <li>Technische metadata: tot ongeveer 12 maanden.</li>
        </ul>
        <p style={{ marginTop: 8 }}>Per organisatie kunnen afwijkende bewaartermijnen zijn afgesproken.</p>
      </Section>

      <Section title="6. Met wie delen we gegevens?">
        <p>
          We verkopen je gegevens nooit. We schakelen wel verwerkers in die ons helpen de dienst
          te leveren, waaronder hostingpartij Vercel, database- en opslagpartij Supabase,
          AI-leverancier OpenAI en e-mailpartij Resend. Met deze partijen zijn
          verwerkersovereenkomsten gesloten. Waar verwerking buiten de EU plaatsvindt, gebeurt dat
          met passende waarborgen.
        </p>
      </Section>

      <Section title="7. Jouw rechten">
        <p>
          Je hebt het recht op inzage, correctie en verwijdering van je gegevens, en je kunt
          bezwaar maken tegen of de verwerking laten beperken. Stuur je verzoek naar
          {' '}[BEVESTIG: contact-e-mailadres]. Je kunt ook een klacht indienen bij de Autoriteit
          Persoonsgegevens.
        </p>
      </Section>

      <Section title="8. Beveiliging">
        <p>
          We nemen passende technische en organisatorische maatregelen om je gegevens te
          beschermen, zoals versleutelde verbindingen, toegangsbeperking en niet-publieke opslag
          van bijlagen.
        </p>
      </Section>

      <Section title="9. Wijzigingen">
        <p>
          We kunnen deze privacyverklaring aanpassen. De meest actuele versie staat altijd op deze
          pagina, met de datum van de laatste wijziging bovenaan.
        </p>
      </Section>
    </main>
  );
}
