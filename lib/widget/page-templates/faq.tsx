// FAQ-page template — H2 = categorie, H3 = vraag, body = antwoord.
//
// Layout: gradient-hero, daarna per H2-sectie een categorie-strook met
// vraag/antwoord cards. Cards staan in een 1-koloms list met duidelijke
// separators — geen accordion (server-rendered, geen client-state nodig).

import { parseMarkdown } from '../parse-md';
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

export function FaqPageTemplate({ skin, markdown }: { skin: OrgSkin; markdown: string }) {
  const doc = parseMarkdown(markdown);
  const dark = isHexDark(skin.bgColor);
  const theme = buildTheme(skin);
  const cardBg = dark ? hexAlpha('#ffffff', 0.04) : '#ffffff';
  const cardBorder = dark ? hexAlpha('#ffffff', 0.08) : hexAlpha('#000000', 0.08);
  const numberBg = hexAlpha(skin.primaryColor, dark ? 0.22 : 0.12);

  return (
    <>
      <GradientHero
        skin={skin}
        eyebrow="FAQ"
        title={doc.title || 'Veelgestelde vragen'}
        lead={doc.lead}
        illustration="icon"
      />

      {doc.intro.length > 0 && (
        <SectionBand skin={skin} variant="plain">
          <BlockList blocks={doc.intro} skin={skin} />
        </SectionBand>
      )}

      {doc.sections.map((section, idx) => (
        <SectionBand
          key={idx}
          skin={skin}
          variant={idx % 2 === 0 ? 'tinted' : 'plain'}
        >
          {section.heading && (
            <SectionHeading
              skin={skin}
              eyebrow={`Categorie ${String(idx + 1).padStart(2, '0')}`}
              title={section.heading}
            />
          )}

          {/* Pre-question body (zelden) */}
          {section.blocks.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <BlockList blocks={section.blocks} skin={skin} />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {section.children.map((child, cidx) => (
              <details
                key={cidx}
                open={cidx === 0}
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                  borderRadius: 12,
                  padding: '18px 20px',
                }}
              >
                <summary
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: skin.textColor,
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    lineHeight: 1.4,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: numberBg,
                      color: skin.primaryColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    {cidx + 1}
                  </span>
                  <span style={{ flex: 1 }}>{renderInline(child.heading ?? '', theme)}</span>
                  <span
                    aria-hidden
                    style={{
                      color: skin.primaryColor,
                      fontSize: 22,
                      lineHeight: 1,
                    }}
                  >
                    +
                  </span>
                </summary>
                <div style={{ marginTop: 14, paddingLeft: 42 }}>
                  <BlockList blocks={child.blocks} skin={skin} />
                </div>
              </details>
            ))}
          </div>
        </SectionBand>
      ))}
    </>
  );
}
