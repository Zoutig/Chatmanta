// Standard-page template — fallback voor pagina's zonder specifiek kind.
//
// Layout: gradient-hero (kleiner dan hero-template, icon i.p.v. foto-placeholder),
// daarna alle H2-sections als alternating bands met BlockList.

import { parseMarkdown } from '../parse-md';
import type { OrgSkin } from '@/app/widget/org-skins';
import { GradientHero, SectionBand, SectionHeading } from './shared';
import { BlockList } from './hero';
import { renderInline } from '../render-markdown';
import { buildTheme } from './shared';

export function StandardPageTemplate({
  skin,
  markdown,
  eyebrow,
}: {
  skin: OrgSkin;
  markdown: string;
  eyebrow?: string;
}) {
  const doc = parseMarkdown(markdown);
  const theme = buildTheme(skin);

  return (
    <>
      <GradientHero
        skin={skin}
        eyebrow={eyebrow ?? skin.companyName}
        title={doc.title}
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
              eyebrow={`Sectie ${String(idx + 1).padStart(2, '0')}`}
              title={section.heading}
            />
          )}
          <BlockList blocks={section.blocks} skin={skin} />
          {section.children.map((child, cidx) => (
            <div key={cidx} style={{ marginTop: 28 }}>
              <h3
                style={{
                  fontSize: 15,
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
