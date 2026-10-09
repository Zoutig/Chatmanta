import type { SiteSection } from '@/lib/voorbeeld/site-content';

export function sectionId(heading: string): string {
  return heading
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function SectionBlock({ section }: { section: SiteSection }) {
  const id = sectionId(section.heading);
  return (
    <section className="dh-section" aria-labelledby={id}>
      <h2 id={id} className="dh-h2">
        {section.heading}
      </h2>

      {section.paragraphs?.map((p, i) => (
        <p key={i} className="dh-p">
          {p}
        </p>
      ))}

      {section.bullets && section.bullets.length > 0 && (
        <ul className="dh-list">
          {section.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      {section.table && (
        <div className="dh-table-wrap" role="region" aria-label={section.heading} tabIndex={0}>
          <table className="dh-table">
            <thead>
              <tr>
                {section.table.columns.map((c, i) => (
                  <th key={i} scope="col">
                    {c || <span className="dh-sr-only">Onderwerp</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) =>
                    ci === 0 ? (
                      <th key={ci} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={ci}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section.faq && section.faq.length > 0 && (
        <div className="dh-faq">
          {section.faq.map((item, i) => (
            <details key={i} className="dh-faq-item">
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      )}

      {section.quotes && section.quotes.length > 0 && (
        <div className="dh-quotes">
          {section.quotes.map((q, i) => (
            <figure key={i} className="dh-quote">
              <blockquote>
                <p>{q.text}</p>
              </blockquote>
              <figcaption>{q.author}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
