// V0 Website Crawler — SSRF-guard (Security Addendum SA-2).
//
// Een klant voert een vrije URL in die de server (via Firecrawl) gaat ophalen.
// Dat is een klassiek Server-Side Request Forgery-aanvalsvlak: een URL die naar
// interne services wijst (localhost, private IP-ranges, cloud-metadata op
// 169.254.169.254) mag NOOIT gecrawld worden. In V0 is dit extra belangrijk:
// er zit geen auth-poort vóór de invoer.
//
// Firecrawl is een managed dienst (de fetch gebeurt op hún infra, niet de onze),
// dus het directe risico is lager — maar SA-2 schrijft eigen validatie verplicht
// voor, ongeacht de crawler. We checken zowel een letterlijk IP-adres in de host
// als de DNS-resolutie van een domeinnaam (vangt domeinen die naar interne IPs
// wijzen, incl. eenvoudige DNS-rebinding).

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type CrawlUrlValidation = { allowed: true } | { allowed: false; reason: string };

/** Hostnamen die we altijd weigeren, los van DNS. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
]);

/** Suffixen die naar interne/niet-publieke namespaces wijzen. */
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet'];

/**
 * Is dit IPv4-adres privé, loopback, link-local of anderszins gereserveerd?
 * Ranges: 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16 (incl. metadata),
 * 172.16/12, 192.0.0/24, 192.168/16, 198.18/15, 224/4 (multicast), 240/4.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    // Geen geldig IPv4 — laat de caller dit als "geen IP" behandelen.
    return false;
  }
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local incl. 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmarking
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255
  return false;
}

/**
 * Is dit IPv6-adres loopback/unspecified/unique-local/link-local/multicast,
 * of een IPv4-mapped adres naar een privé v4? Genormaliseerd op lowercase.
 */
function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === '::1' || addr === '::') return true;
  // IPv4-mapped (::ffff:a.b.c.d) → toets de ingebedde v4.
  const mapped = addr.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const head = addr.split(':')[0] ?? '';
  if (head.startsWith('fe8') || head.startsWith('fe9') || head.startsWith('fea') || head.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (head.startsWith('fc') || head.startsWith('fd')) return true; // fc00::/7 unique-local
  if (head.startsWith('ff')) return true; // ff00::/8 multicast
  return false;
}

function isPrivateIP(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return false;
}

/**
 * Valideert een door-de-klant-ingevoerde crawl-URL tegen SSRF.
 * Retourneert {allowed:false, reason} bij een geweigerde URL — gooit niet.
 */
export async function validateCrawlUrl(input: string): Promise<CrawlUrlValidation> {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { allowed: false, reason: 'Geen geldige URL.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { allowed: false, reason: `Alleen http(s) is toegestaan, niet ${url.protocol}` };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, ''); // trailing dot weg
  if (!host) {
    return { allowed: false, reason: 'URL mist een hostnaam.' };
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    return { allowed: false, reason: `Interne hostnaam niet toegestaan: ${host}` };
  }

  // Letterlijk IP in de host? Direct toetsen.
  if (isIP(host) !== 0) {
    if (isPrivateIP(host)) {
      return { allowed: false, reason: `Privé/gereserveerd IP-adres niet toegestaan: ${host}` };
    }
    return { allowed: true };
  }

  // Domeinnaam: resolve en toets élk resulterend adres.
  let resolved: { address: string }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    return { allowed: false, reason: `Hostnaam kon niet worden opgelost: ${host}` };
  }
  if (resolved.length === 0) {
    return { allowed: false, reason: `Hostnaam leverde geen IP-adres op: ${host}` };
  }
  for (const { address } of resolved) {
    if (isPrivateIP(address)) {
      return {
        allowed: false,
        reason: `Hostnaam wijst naar een privé/intern adres (${address}): ${host}`,
      };
    }
  }

  return { allowed: true };
}
