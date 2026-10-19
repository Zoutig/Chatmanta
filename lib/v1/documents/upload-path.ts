// Padcontrole voor document-uploads (security-audit 2026-10, bevinding 9).
//
// De upload-actions maken het opslagpad zelf: `<orgId>/<chatbotId>/<uuid>-<veilige naam>`
// (veilige naam = [A-Za-z0-9._-], max 120 tekens). In stap 2 komt dat pad terug van de
// client en downloaden we het als service-role (RLS-bypass). Een startsWith-check op
// `<orgId>/<chatbotId>/` is dan niet genoeg: `orgA/botA/../../orgB/...` begint goed,
// maar normaliseert naar het pad van een andere klant. Daarom accepteren we alleen
// exact het formaat dat de server zelf maakt: precies drie segmenten, geen '..'-segment,
// en geen '%' of '\' (de toegestane tekens laten die niet toe).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE_SEGMENT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9._-]{1,120}$/i;

/** true = het pad is precies een server-gegenereerd uploadpad binnen deze org/chatbot. */
export function isOwnUploadPath(path: unknown, orgId: string, chatbotId: string): boolean {
  if (typeof path !== 'string') return false;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(chatbotId)) return false;
  if (path.includes('%') || path.includes('\\')) return false;
  const segments = path.split('/');
  if (segments.length !== 3) return false;
  const [org, bot, file] = segments;
  if (org !== orgId || bot !== chatbotId) return false;
  return FILE_SEGMENT_RE.test(file);
}
