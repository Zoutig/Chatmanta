import type { Metadata } from 'next';
import { LinkButton } from '@/components/site/ui/button';
import { Container } from '@/components/site/ui/section';
import { ROUTES } from '@/lib/site/navigation';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Neem contact op met Niels of Sebastiaan van ChatManta, telefonisch of per mail.',
  alternates: { canonical: '/contact' },
};

const PEOPLE = [
  {
    name: 'Niels',
    role: 'Klanten en launch',
    phone: '06 34 83 89 80',
    tel: '+31634838980',
    email: 'niels@chatmanta.com',
  },
  {
    name: 'Sebastiaan',
    role: 'Techniek en chatbot',
    phone: '06 51 93 72 11',
    tel: '+31651937211',
    email: 'sebastiaan@chatmanta.com',
  },
] as const;

export default function ContactPage() {
  return (
    <section className="page-simple" aria-labelledby="h-contact">
      <Container>
        <span className="eyebrow">Contact</span>
        <h1 id="h-contact" style={{ marginTop: 12 }}>
          Praat met ons
        </h1>
        <p style={{ maxWidth: 560 }}>
          Een vraag, of wil je weten wat ChatManta voor jouw website kan doen? Bel of mail ons gerust, je krijgt altijd
          een mens aan de lijn.
        </p>
        <div className="contact-grid">
          {PEOPLE.map((p) => (
            <article key={p.name} className="contact-person">
              <h2>{p.name}</h2>
              <p className="role">{p.role}</p>
              <ul>
                <li>
                  <a href={`tel:${p.tel}`}>{p.phone}</a>
                </li>
                <li>
                  <a href={`mailto:${p.email}`}>{p.email}</a>
                </li>
              </ul>
            </article>
          ))}
        </div>
        <div style={{ marginTop: 28 }}>
          <LinkButton href={ROUTES.kennismaking} size="sm">
            Plan een kennismaking
          </LinkButton>
        </div>
      </Container>
    </section>
  );
}
