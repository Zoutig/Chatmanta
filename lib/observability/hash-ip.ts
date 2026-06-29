import { createHash } from 'node:crypto';
/**
 * Pseudonimiseer een bezoeker-IP voor query_log.ip_hash (AVG: nooit plain IP).
 * sha256(salt + ip), getrunceerd tot 16 hex-chars (genoeg om te dedupliceren,
 * niet omkeerbaar). Salt uit IP_HASH_SALT (ops-env); zonder salt nog steeds
 * gehasht (zwakker tegen rainbow-tables) → flag voor de Eindlijst.
 * Authed paden (askV1) hebben geen onvertrouwd IP → geven null door.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || typeof ip !== 'string' || ip.trim().length === 0) return null;
  const salt = process.env.IP_HASH_SALT ?? '';
  return createHash('sha256').update(salt + ip.trim()).digest('hex').slice(0, 16);
}
