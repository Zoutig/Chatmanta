// Pricing-page template — voor "Tarieven" / "Prijslijst" pagina's.
//
// Layout: gradient-hero, daarna per H2-sectie:
//   - section-heading
//   - eerste 2-col-tabel met `€`-prijzen → pricing-cards (max 6, midden gehighlight)
//   - extra tabellen blijven als rich tabel; bullets/paragraphs als fallback

import { parseMarkdown, type ParsedBlock } from '../parse-md';
import type { OrgSkin } from '@/app/widget/org-skins';
import {
  GradientHero,
  SectionBand,
  SectionHeading,
  hexAlpha,
  isHexDark,
} from './shared';
import { BlockList } from './hero';
import { renderInline } from '../render-markdown';
import { buildTheme } from './shared';

export function PricingPageTemplate({ skin, markdown }: { skin: OrgSkin; markdown: string }) {
  const doc = parseMarkdown(markdown);

  return (
    <>
      <GradientHero
        skin={skin}
        eyebrow="Tarieven"
        title={doc.title || 'Onze tarieven'}
        lead={doc.lead}
        illustration="icon"
      />

      {doc.intro.length > 0 && (
        <SectionBand skin={skin} variant="plain">
          <BlockList blocks={doc.intro} skin={skin} />
        </SectionBand>
      )}

      {doc.sections.map((section, idx) => {
        const cards = extractPricingCards(section.blocks);
        const remainingBlocks = cards
          ? section.blocks.filter((b) => b !== cards.sourceBlock)
          : section.blocks;
        return (
          <SectionBand
            key={idx}
            skin={skin}
            variant={idx % 2 === 0 ? 'tinted' : 'plain'}
          >
            {section.heading && (
              <SectionHeading skin={skin} eyebrow="Pakket" title={section.heading} />
            )}

            {cards && <PricingCards rows={cards.rows} headerCols={cards.header} skin={skin} />}

            {remainingBlocks.length > 0 && (
              <div style={{ marginTop: cards ? 28 : 0 }}>
                <BlockList blocks={remainingBlocks} skin={skin} />
              </div>
            )}

            {section.children.map((child, cidx) => {
              const childCards = extractPricingCards(child.blocks);
              const childRemaining = childCards
                ? child.blocks.filter((b) => b !== childCards.sourceBlock)
                : child.blocks;
              return (
                <div key={cidx} style={{ marginTop: 32 }}>
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
                  {childCards && (
                    <PricingCards
                      rows={childCards.rows}
                      headerCols={childCards.header}
                      skin={skin}
                    />
                  )}
                  {childRemaining.length > 0 && (
                    <div style={{ marginTop: childCards ? 22 : 0 }}>
                      <BlockList blocks={childRemaining} skin={skin} />
                    </div>
                  )}
                </div>
              );
            })}
          </SectionBand>
        );
      })}
    </>
  );
}

type ExtractedCards = {
  sourceBlock: ParsedBlock;
  header: string[];
  rows: string[][];
};

/** Vindt de eerste tabel met € of "tarief" als price-column en max 6 rijen. */
function extractPricingCards(blocks: ParsedBlock[]): ExtractedCards | null {
  for (const b of blocks) {
    if (b.type !== 'table') continue;
    if (b.header.length < 2 || b.header.length > 4) continue;
    if (b.rows.length === 0 || b.rows.length > 6) continue;
    // Detect price-column: er moet minstens 1 cel met € of "vanaf" of "tarief" zijn
    const hasPrice = b.rows.some((row) =>
      row.some((cell) => /€|\bvanaf\b|\bp\.m\.|\bper\b|\btarief/i.test(cell)),
    );
    if (!hasPrice) continue;
    return { sourceBlock: b, header: b.header, rows: b.rows };
  }
  return null;
}

function PricingCards({
  rows,
  headerCols,
  skin,
}: {
  rows: string[][];
  headerCols: string[];
  skin: OrgSkin;
}) {
  const dark = isHexDark(skin.bgColor);
  const theme = buildTheme(skin);
  const cardBg = dark ? hexAlpha('#ffffff', 0.05) : '#ffffff';
  const cardBorder = dark ? hexAlpha('#ffffff', 0.10) : hexAlpha('#000000', 0.08);
  const cardShadow = dark
    ? `0 8px 28px ${hexAlpha('#000000', 0.45)}`
    : `0 8px 24px ${hexAlpha('#000000', 0.08)}`;
  const highlightIdx = rows.length >= 3 ? 1 : -1; // tweede card highlighted bij 3+ cards

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.min(rows.length, 3)}, 1fr)`,
        gap: 18,
      }}
    >
      {rows.map((row, idx) => {
        const isHighlight = idx === highlightIdx;
        const [labelCell, ...priceCells] = row;
        return (
          <article
            key={idx}
            style={{
              background: isHighlight ? skin.primaryColor : cardBg,
              border: `1px solid ${isHighlight ? skin.primaryColor : cardBorder}`,
              borderRadius: 14,
              padding: '24px 22px 28px',
              boxShadow: isHighlight
                ? `0 14px 36px ${hexAlpha(skin.primaryColor, 0.4)}`
                : cardShadow,
              color: isHighlight ? '#ffffff' : skin.textColor,
              position: 'relative',
              transform: isHighlight ? 'translateY(-6px)' : 'none',
            }}
          >
            {isHighlight && (
              <span
                style={{
                  position: 'absolute',
                  top: 12,
                  right: 14,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  background: 'rgba(255,255,255,0.18)',
                  padding: '4px 8px',
                  borderRadius: 999,
                }}
              >
                Populair
              </span>
            )}
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: isHighlight ? 'rgba(255,255,255,0.85)' : skin.primaryColor,
                marginBottom: 10,
              }}
            >
              {headerCols[0] || 'Pakket'}
            </div>
            <h4
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: '0 0 18px',
                lineHeight: 1.2,
                color: 'inherit',
              }}
            >
              {renderInline(labelCell, {
                ...theme,
                textColor: isHighlight ? '#ffffff' : skin.textColor,
              })}
            </h4>

            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {priceCells.map((cell, cidx) => (
                <li key={cidx} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: isHighlight ? 'rgba(255,255,255,0.7)' : theme.mutedText,
                      minWidth: 90,
                    }}
                  >
                    {headerCols[cidx + 1] ?? ''}
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: isHighlight ? '#ffffff' : skin.primaryColor,
                    }}
                  >
                    {renderInline(cell, {
                      ...theme,
                      primaryColor: isHighlight ? '#ffffff' : skin.primaryColor,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}
