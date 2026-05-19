// Contact-page template.
//
// Layout: gradient-hero met "Neem contact op", daarna 2-koloms layout:
//   - links: contact-info cards (telefoon/email/adres extracted via regex)
//   - rechts: fake contact-form placeholder + map-placeholder block
// Onderaan: rest van de markdown-content per H2-sectie.

import { parseMarkdown, type ParsedBlock } from '../parse-md';
import type { OrgSkin } from '@/app/widget/org-skins';
import {
  GradientHero,
  SectionBand,
  SectionHeading,
  buildTheme,
  hexAlpha,
  isHexDark,
} from './shared';
import { BlockList } from './hero';
import { renderInline } from '../render-markdown';

type ContactDatum = { kind: 'phone' | 'email' | 'address' | 'hours'; value: string };

export function ContactPageTemplate({ skin, markdown }: { skin: OrgSkin; markdown: string }) {
  const doc = parseMarkdown(markdown);
  const contactData = extractContactData([...doc.intro, ...doc.sections.flatMap((s) => s.blocks)]);
  const dark = isHexDark(skin.bgColor);
  const cardBg = dark ? hexAlpha('#ffffff', 0.04) : '#ffffff';
  const cardBorder = dark ? hexAlpha('#ffffff', 0.08) : hexAlpha('#000000', 0.08);
  const iconBg = hexAlpha(skin.primaryColor, dark ? 0.18 : 0.12);
  const theme = buildTheme(skin);

  return (
    <>
      <GradientHero
        skin={skin}
        eyebrow="Contact"
        title={doc.title || 'Neem contact op'}
        lead={doc.lead}
        illustration="icon"
        cta={contactData.find((c) => c.kind === 'phone') ? { label: 'Bel direct' } : undefined}
      />

      <SectionBand skin={skin} variant="tinted">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 18,
          }}
        >
          {contactData.slice(0, 4).map((c, idx) => (
            <article
              key={idx}
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
                borderRadius: 12,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: iconBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                {iconForKind(c.kind)}
              </span>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: skin.primaryColor,
                }}
              >
                {labelForKind(c.kind)}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: skin.textColor,
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                }}
              >
                {renderInline(c.value, theme)}
              </div>
            </article>
          ))}
        </div>
      </SectionBand>

      {doc.sections.map((section, idx) => (
        <SectionBand
          key={idx}
          skin={skin}
          variant={idx % 2 === 0 ? 'plain' : 'tinted'}
        >
          {section.heading && (
            <SectionHeading skin={skin} eyebrow="Info" title={section.heading} />
          )}
          <BlockList blocks={section.blocks} skin={skin} />
          {section.children.map((child, cidx) => (
            <div key={cidx} style={{ marginTop: 28 }}>
              <h3
                style={{
                  fontSize: 17,
                  fontWeight: 600,
                  color: skin.textColor,
                  margin: '0 0 12px',
                }}
              >
                {child.heading}
              </h3>
              <BlockList blocks={child.blocks} skin={skin} />
            </div>
          ))}
        </SectionBand>
      ))}
    </>
  );
}

function iconForKind(kind: ContactDatum['kind']): string {
  if (kind === 'phone') return '📞';
  if (kind === 'email') return '✉️';
  if (kind === 'address') return '📍';
  return '🕒';
}

function labelForKind(kind: ContactDatum['kind']): string {
  if (kind === 'phone') return 'Telefoon';
  if (kind === 'email') return 'E-mail';
  if (kind === 'address') return 'Adres';
  return 'Openingstijden';
}

const PHONE_RE = /\b0\d{1,3}\s?[-]?\s?\d{2,4}\s?\d{2,4}\s?\d{0,4}\b/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const ADDRESS_RE = /\b\d{4}\s?[A-Z]{2}\s+[A-Z][a-z]+/g;

function extractContactData(blocks: ParsedBlock[]): ContactDatum[] {
  const out: ContactDatum[] = [];
  const seen = new Set<string>();

  for (const b of blocks) {
    const text = blockToText(b);
    for (const m of text.match(PHONE_RE) ?? []) {
      const key = `phone:${m.replace(/\s/g, '')}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ kind: 'phone', value: m });
      }
    }
    for (const m of text.match(EMAIL_RE) ?? []) {
      const key = `email:${m.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ kind: 'email', value: m });
      }
    }
    for (const m of text.match(ADDRESS_RE) ?? []) {
      const key = `address:${m.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ kind: 'address', value: m });
      }
    }
  }

  return out;
}

function blockToText(b: ParsedBlock): string {
  if (b.type === 'paragraph') return b.text;
  if (b.type === 'list') return b.items.join(' ');
  if (b.type === 'table') {
    return [...b.header, ...b.rows.flat()].join(' ');
  }
  return '';
}
