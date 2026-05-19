// Services-page template — voor "Diensten" / "Behandelingen" pagina's.
//
// Layout: gradient-hero met service-eyebrow, daarna voor elke H2-sectie:
//   - section-heading
//   - grid van service-cards uit de bullet-list (emoji + label + desc)
//   - eventueel een fallback "rest" block voor non-bullet content
//
// Cards komen uit `extractServiceItems` die `- **[label](#)** — desc` parsed.
// Als een sectie geen service-pattern bullets heeft, valt hij terug op een
// normale BlockList.

import { parseMarkdown } from '../parse-md';
import type { OrgSkin } from '@/app/widget/org-skins';
import {
  GradientHero,
  SectionBand,
  SectionHeading,
  extractServiceItems,
  hexAlpha,
  isHexDark,
  type ServiceItem,
} from './shared';
import { BlockList } from './hero';

export function ServicesPageTemplate({ skin, markdown }: { skin: OrgSkin; markdown: string }) {
  const doc = parseMarkdown(markdown);

  return (
    <>
      <GradientHero
        skin={skin}
        eyebrow="Ons aanbod"
        title={doc.title || 'Onze diensten'}
        lead={doc.lead}
        illustration="icon"
      />

      {doc.intro.length > 0 && (
        <SectionBand skin={skin} variant="plain">
          <BlockList blocks={doc.intro} skin={skin} />
        </SectionBand>
      )}

      {doc.sections.map((section, idx) => {
        const services = extractServiceItems(section.blocks);
        const hasServices = services.length >= 2;
        return (
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

            {hasServices ? (
              <ServiceGrid items={services} skin={skin} />
            ) : (
              <BlockList blocks={section.blocks} skin={skin} />
            )}

            {section.children.length > 0 && (
              <div style={{ marginTop: 32, display: 'grid', gap: 28 }}>
                {section.children.map((child, cidx) => {
                  const childServices = extractServiceItems(child.blocks);
                  return (
                    <div key={cidx}>
                      <h3
                        style={{
                          fontSize: 18,
                          fontWeight: 600,
                          margin: '0 0 14px',
                          color: skin.textColor,
                        }}
                      >
                        {child.heading}
                      </h3>
                      {childServices.length >= 2 ? (
                        <ServiceGrid items={childServices} skin={skin} />
                      ) : (
                        <BlockList blocks={child.blocks} skin={skin} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionBand>
        );
      })}
    </>
  );
}

function ServiceGrid({ items, skin }: { items: ServiceItem[]; skin: OrgSkin }) {
  const dark = isHexDark(skin.bgColor);
  const cardBg = dark ? hexAlpha('#ffffff', 0.04) : '#ffffff';
  const cardBorder = dark ? hexAlpha('#ffffff', 0.08) : hexAlpha('#000000', 0.08);
  const cardShadow = dark
    ? `0 4px 16px ${hexAlpha('#000000', 0.4)}`
    : `0 4px 14px ${hexAlpha('#000000', 0.06)}`;
  const iconBg = hexAlpha(skin.primaryColor, dark ? 0.18 : 0.12);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 18,
      }}
    >
      {items.map((item, idx) => (
        <article
          key={idx}
          style={{
            background: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: 12,
            padding: '20px 20px 22px',
            boxShadow: cardShadow,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            transition: 'transform 160ms ease, box-shadow 160ms ease',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 46,
              height: 46,
              borderRadius: 12,
              background: iconBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
          >
            {item.emoji}
          </span>
          <h4
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: skin.textColor,
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {item.label}
          </h4>
          {item.description && (
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.62)',
                margin: 0,
              }}
            >
              {item.description}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
