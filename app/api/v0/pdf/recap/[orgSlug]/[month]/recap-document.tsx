// Maandelijkse Recap — PDF-document (@react-pdf/renderer, server-side).
//
// renderToBuffer levert een Buffer die de route-handler als application/pdf
// streamt. Pure JS (geen headless Chrome). De inhoud spiegelt de detailpagina;
// signaleringen die op 'genegeerd' staan worden weggelaten (spec: PDF toont
// alleen actieve, niet-genegeerde signaleringen).

import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { formatDuration, monthLabelNL } from '@/lib/controlroom/recap-logic';
import type { RecapDetail } from '@/lib/controlroom/server/recap';

const FOOTER = 'ChatManta — niels@chatmanta.com';

const C = {
  ink: '#1a1a1a',
  muted: '#555555',
  dim: '#888888',
  border: '#e5e5e5',
  warn: '#b45309',
  success: '#15803d',
  danger: '#b91c1c',
  inzicht: '#2563eb',
};

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 56, paddingHorizontal: 44, fontSize: 10, color: C.ink, fontFamily: 'Helvetica' },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  subtitle: { fontSize: 13, color: C.muted, marginTop: 2 },
  meta: { fontSize: 9, color: C.dim, marginTop: 2 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 20, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: C.muted },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  statBox: { width: '33%', paddingVertical: 8, paddingRight: 10 },
  statLabel: { fontSize: 8, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  statSub: { fontSize: 7.5, color: C.dim, marginTop: 2 },
  row: { flexDirection: 'row', marginBottom: 5 },
  rank: { width: 18, color: C.dim },
  qText: { flex: 1, paddingRight: 8 },
  qCount: { width: 34, textAlign: 'right', color: C.dim },
  qStatus: { width: 92, textAlign: 'right', fontSize: 8.5 },
  body: { fontSize: 10.5, lineHeight: 1.5 },
  signal: { marginBottom: 9, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: C.border },
  signalTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  signalMsg: { fontSize: 9.5, color: C.muted, marginTop: 1 },
  empty: { fontSize: 10, color: C.dim },
  footer: { position: 'absolute', bottom: 28, left: 44, right: 44, textAlign: 'center', fontSize: 8.5, color: C.dim, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 8 },
});

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('nl-NL', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Amsterdam' });
  } catch {
    return iso;
  }
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function RecapDocument({ detail }: { detail: RecapDetail }) {
  const { name, year, month, stats, topQuestions, topUnanswered, signals, stored } = detail;
  const hasData = stats.totalConversations > 0;
  const activeSignals = signals.filter((s) => s.status !== 'genegeerd');
  const sevColor = (sev: string) =>
    sev === 'actie_vereist' ? C.danger : sev === 'waarschuwing' ? C.warn : C.inzicht;

  return (
    <Document title={`ChatManta Recap ${name} ${monthLabelNL(year, month)}`}>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subtitle}>Recap {monthLabelNL(year, month)}</Text>
          {stored?.generatedAt ? <Text style={styles.meta}>Gegenereerd op {fmtDate(stored.generatedAt)}</Text> : null}
          <Text style={styles.meta}>Gegenereerd door: Niels Jochems — ChatManta</Text>
        </View>

        {!hasData ? (
          <Text style={[styles.empty, { marginTop: 20 }]}>
            Geen gesprekken gevonden voor {monthLabelNL(year, month)}.
          </Text>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatBox label="Totaal gesprekken" value={stats.totalConversations} />
              <StatBox label="Unieke bezoekers" value={stats.uniqueVisitors} sub="alleen website-bezoekers" />
              <StatBox label="Gem. gespreksduur" value={formatDuration(stats.avgDurationSeconds)} />
              <StatBox label="Gem. berichten/gesprek" value={stats.avgMessagesPerConversation} />
              <StatBox label="Onbeantwoorde vragen" value={stats.unansweredCount} />
              <StatBox label="Piekuur" value={stats.peakHour != null ? `${stats.peakHour}:00` : '—'} />
            </View>

            <Text style={styles.sectionTitle}>Meest gestelde vragen</Text>
            {topQuestions.length > 0 ? (
              topQuestions.map((q, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rank}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={styles.qText}>{q.question}</Text>
                  <Text style={styles.qCount}>{q.count}×</Text>
                  <Text style={[styles.qStatus, { color: q.answered ? C.success : C.warn }]}>
                    {q.answered ? 'beantwoord' : 'niet beantwoord'}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>Geen vragen deze maand.</Text>
            )}

            <Text style={styles.sectionTitle}>Meest voorkomende onbeantwoorde vragen</Text>
            {topUnanswered.length > 0 ? (
              topUnanswered.map((q, i) => (
                <View key={i} style={styles.row}>
                  <Text style={styles.rank}>{String(i + 1).padStart(2, '0')}</Text>
                  <Text style={styles.qText}>{q.question}</Text>
                  <Text style={styles.qCount}>{q.count}×</Text>
                </View>
              ))
            ) : (
              <Text style={styles.empty}>Geen onbeantwoorde vragen.</Text>
            )}
          </>
        )}

        <Text style={styles.sectionTitle}>AI-samenvatting</Text>
        {stored?.aiSummary ? (
          <Text style={styles.body}>{stored.aiSummary}</Text>
        ) : (
          <Text style={styles.empty}>Geen samenvatting beschikbaar.</Text>
        )}

        {activeSignals.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Signaleringen</Text>
            {activeSignals.map((s) => (
              <View key={s.type} style={[styles.signal, { borderLeftColor: sevColor(s.severity) }]}>
                <Text style={styles.signalMsg}>{s.message}</Text>
              </View>
            ))}
          </>
        ) : null}

        {stored?.nielsNotes && stored.nielsNotes.trim().length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Notities</Text>
            <Text style={styles.body}>{stored.nielsNotes}</Text>
          </>
        ) : null}

        <Text style={styles.footer} fixed>
          {FOOTER}
        </Text>
      </Page>
    </Document>
  );
}

/** Render de recap naar een PDF-Buffer (application/pdf). */
export function renderRecapPdf(detail: RecapDetail): Promise<Buffer> {
  return renderToBuffer(<RecapDocument detail={detail} />);
}
