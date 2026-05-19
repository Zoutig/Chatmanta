// Hero-page template — voor "Over ons"-achtige pagina's.
//
// Layout: gradient-hero + foto-placeholder, daarna alternating section-bands
// (tinted/plain) met H2 als section-heading + content. H3-subsections krijgen
// een eyebrow.

import { renderInline } from '../render-markdown';
import { parseMarkdown, type ParsedSection, type ParsedBlock } from '../parse-md';
import type { OrgSkin } from '@/app/widget/org-skins';
import {
  GradientHero,
  SectionBand,
  SectionHeading,
  buildTheme,
  hexAlpha,
  isHexDark,
} from './shared';

export function HeroPageTemplate({ skin, markdown }: { skin: OrgSkin; markdown: string }) {
  const doc = parseMarkdown(markdown);
  const theme = buildTheme(skin);

  return (
    <>
      <GradientHero
        skin={skin}
        eyebrow={skin.companyName}
        title={doc.title || skin.companyName}
        lead={doc.lead}
        illustration="photo"
      />

      {/* Intro-blocks tussen lead en eerste H2 */}
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
              eyebrow={`Deel ${String(idx + 1).padStart(2, '0')}`}
              title={section.heading}
            />
          )}
          <BlockList blocks={section.blocks} skin={skin} />
          {section.children.map((child, cidx) => (
            <div key={cidx} style={{ marginTop: 28 }}>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: skin.primaryColor,
                  margin: '0 0 10px',
                }}
              >
                {renderInline(child.heading ?? '', theme)}
              </h3>
              <BlockList blocks={child.blocks} skin={skin} />
            </div>
          ))}
        </SectionBand>
      ))}
    </>
  );
}

function BlockList({ blocks, skin }: { blocks: ParsedBlock[]; skin: OrgSkin }) {
  const theme = buildTheme(skin);
  const dark = isHexDark(skin.bgColor);
  const tableHeaderBg = dark ? hexAlpha('#ffffff', 0.05) : hexAlpha('#000000', 0.04);

  return (
    <div style={{ maxWidth: 820 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'paragraph') {
          return (
            <p
              key={idx}
              style={{
                margin: '0 0 16px',
                lineHeight: 1.7,
                fontSize: 16,
                color: skin.textColor,
              }}
            >
              {renderInline(b.text, theme)}
            </p>
          );
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={idx}
              style={{
                margin: '0 0 18px',
                paddingLeft: 22,
                lineHeight: 1.7,
                fontSize: 16,
                color: skin.textColor,
              }}
            >
              {b.items.map((it, iidx) => (
                <li key={iidx} style={{ marginBottom: 6 }}>
                  {renderInline(it, theme)}
                </li>
              ))}
            </Tag>
          );
        }
        if (b.type === 'table') {
          return (
            <div key={idx} style={{ overflowX: 'auto', margin: '12px 0 22px' }}>
              <table
                style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  fontSize: 14,
                  lineHeight: 1.5,
                  border: `1px solid ${theme.borderColor}`,
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <thead style={{ background: tableHeaderBg }}>
                  <tr>
                    {b.header.map((cell, hidx) => (
                      <th
                        key={hidx}
                        style={{
                          textAlign: 'left',
                          padding: '10px 14px',
                          fontWeight: 600,
                          color: skin.textColor,
                        }}
                      >
                        {renderInline(cell, theme)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ridx) => (
                    <tr key={ridx}>
                      {row.map((cell, cidx) => (
                        <td
                          key={cidx}
                          style={{
                            padding: '10px 14px',
                            borderTop: `1px solid ${theme.borderColor}`,
                            color: skin.textColor,
                            verticalAlign: 'top',
                          }}
                        >
                          {renderInline(cell, theme)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// Re-export voor andere templates die dezelfde block-render willen.
export { BlockList };
export type { ParsedSection };
