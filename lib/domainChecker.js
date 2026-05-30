import { resolve } from "dns";
import { promisify } from "util";

const dnsResolve = promisify(resolve);

// ---------------------------------------------------------------------------
// LRU Cache with TTL — keeps recent lookups in memory (per serverless
// invocation or server lifetime). Avoids hammering external services for the
// same domain. Negative results expire fast so new registrations are noticed.
// ---------------------------------------------------------------------------
const POSITIVE_TTL_MS = 60 * 60 * 1000; // 1 hour for registered domains
const NEGATIVE_TTL_MS = 5 * 60 * 1000;  // 5 min for unregistered/unknown

class LRUCache {
  constructor(max = 500) {
    this.max = max;
    this.cache = new Map();
  }
  get(key) {
    if (!this.cache.has(key)) return undefined;
    const entry = this.cache.get(key);
    if (entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }
  set(key, value) {
    const ttl = value && value.registered === true ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
    const entry = { value, expiresAt: Date.now() + ttl };
    if (this.cache.has(key)) this.cache.delete(key);
    else if (this.cache.size >= this.max) {
      this.cache.delete(this.cache.keys().next().value);
    }
    this.cache.set(key, entry);
  }
}

const cache = new LRUCache(1000);

// Feature flag: WHOIS fallback is fragile under load. Disable in prod spikes.
const ENABLE_WHOIS = process.env.ENABLE_WHOIS !== "false";

// Total budget for a single checkDomain call across all sources.
const TOTAL_BUDGET_MS = Number(process.env.CHECK_BUDGET_MS || 7000);

// ---------------------------------------------------------------------------
// IANA RDAP bootstrap — maps TLDs to their authoritative RDAP servers.
// Much faster than going through the rdap.org proxy.
// ---------------------------------------------------------------------------
const DIRECT_RDAP = {
  com: "https://rdap.verisign.com/com/v1",
  net: "https://rdap.verisign.com/net/v1",
  org: "https://rdap.org",
  io: "https://rdap.identitydigital.services/rdap/v1",
  dev: "https://rdap.nic.google",
  app: "https://rdap.nic.google",
  co: "https://rdap.nic.co",
  info: "https://rdap.identitydigital.services/rdap/v1",
  biz: "https://rdap.identitydigital.services/rdap/v1",
  xyz: "https://rdap.nic.xyz",
  tech: "https://rdap.identitydigital.services/rdap/v1",
  site: "https://rdap.identitydigital.services/rdap/v1",
  online: "https://rdap.identitydigital.services/rdap/v1",
  cloud: "https://rdap.identitydigital.services/rdap/v1",
  store: "https://rdap.identitydigital.services/rdap/v1",
  me: "https://rdap.nic.me",
  cc: "https://rdap.verisign.com/cc/v1",
  tv: "https://rdap.verisign.com/tv/v1",
  us: "https://rdap.identitydigital.services/rdap/v1",
  uk: "https://rdap.nominet.uk/uk",
  de: "https://rdap.denic.de",
  au: "https://rdap.identitydigital.services/rdap/v1",
  ca: "https://rdap.ca.fury.ca/rdap",
  in: "https://rdap.registry.in/",
};

function getRdapUrl(domain) {
  const tld = domain.split(".").pop().toLowerCase();
  const base = DIRECT_RDAP[tld];
  if (base) return `${base}/domain/${domain}`;
  return `https://rdap.org/domain/${domain}`;
}

// ---------------------------------------------------------------------------
// Parse RDAP JSON into a clean result object
// ---------------------------------------------------------------------------
function parseRdap(data, domain) {
  const registrar =
    data.entities
      ?.find((e) => e.roles?.includes("registrar"))
      ?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3] || null;

  const events = data.events || [];
  const created =
    events.find((e) => e.eventAction === "registration")?.eventDate || null;
  const expires =
    events.find((e) => e.eventAction === "expiration")?.eventDate || null;
  const nameservers = (data.nameservers || [])
    .map((ns) => ns.ldhName || ns.unicodeName)
    .filter(Boolean)
    .slice(0, 4);

  return {
    domain,
    registered: true,
    registrar,
    created,
    expires,
    nameservers,
    status: data.status || [],
    source: "rdap",
  };
}

// ---------------------------------------------------------------------------
// Source 1a: Native DNS resolution
// ---------------------------------------------------------------------------
async function nativeDnsCheck(domain) {
  try {
    const records = await dnsResolve(domain, "NS");
    if (records && records.length > 0) return "registered";
  } catch {
    // NXDOMAIN or timeout
  }
  try {
    const records = await dnsResolve(domain, "A");
    if (records && records.length > 0) return "registered";
  } catch {
    // No A records
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Source 1b: DNS over HTTPS via Google — works reliably in serverless envs
// where native dns.resolve may be unavailable or flaky.
// ---------------------------------------------------------------------------
async function dohCheck(domain) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/dns-json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return "unknown";

    const data = await res.json();
    // Status 0 = NOERROR (domain exists), 3 = NXDOMAIN (does not exist)
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return "registered";
    }
    if (data.Status === 3) {
      return "not_registered";
    }
    // Status 0 but no Answer can mean the domain exists but has no A records
    // Still check Authority section for SOA which confirms the domain exists
    if (data.Status === 0) {
      return "registered";
    }
    return "unknown";
  } catch {
    clearTimeout(timeout);
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Source 1c: Cloudflare DoH — secondary DoH provider for redundancy
// ---------------------------------------------------------------------------
async function cloudflareDohCheck(domain) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/dns-json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return "unknown";

    const data = await res.json();
    if (data.Status === 0 && data.Answer && data.Answer.length > 0) {
      return "registered";
    }
    if (data.Status === 3) {
      return "not_registered";
    }
    if (data.Status === 0) {
      return "registered";
    }
    return "unknown";
  } catch {
    clearTimeout(timeout);
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Combined DNS check — runs native DNS + Google DoH + Cloudflare DoH in
// parallel and returns "registered" if ANY source confirms it.
// ---------------------------------------------------------------------------
async function dnsCheck(domain) {
  const results = await Promise.allSettled([
    nativeDnsCheck(domain),
    dohCheck(domain),
    cloudflareDohCheck(domain),
  ]);

  for (const r of results) {
    if (r.status === "fulfilled" && r.value === "registered") {
      return "registered";
    }
  }

  // If any source says not_registered and none say registered, lean towards not registered
  for (const r of results) {
    if (r.status === "fulfilled" && r.value === "not_registered") {
      return "not_registered";
    }
  }

  return "unknown";
}

// ---------------------------------------------------------------------------
// Source 2: RDAP lookup — try direct registry first, fall back to rdap.org
// ---------------------------------------------------------------------------
async function rdapCheck(domain) {
  const url = getRdapUrl(domain);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return parseRdap(data, domain);
    }
    if (res.status === 404) {
      return { domain, registered: false, source: "rdap" };
    }
    return null; // inconclusive
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 3: RDAP proxy fallback (only if direct didn't work)
// ---------------------------------------------------------------------------
async function rdapProxyCheck(domain) {
  const tld = domain.split(".").pop().toLowerCase();
  if (!DIRECT_RDAP[tld]) return null; // already tried rdap.org in step 2

  const url = `https://rdap.org/domain/${domain}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return parseRdap(data, domain);
    }
    if (res.status === 404) {
      return { domain, registered: false, source: "rdap-proxy" };
    }
    return null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 4: WHOIS fallback via whoiser (pure JS, no external API)
// ---------------------------------------------------------------------------
let whoiser = null;
async function getWhoiser() {
  if (!whoiser) {
    try {
      whoiser = await import("whoiser");
    } catch {
      return null;
    }
  }
  return whoiser;
}

async function whoisCheck(domain) {
  try {
    const w = await getWhoiser();
    if (!w) return null;

    const result = await Promise.race([
      w.default(domain, { follow: 1, timeout: 3000 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);

    const data = Object.values(result)[0];
    if (!data) return null;

    const raw = data.__raw || data["Domain Name"] || "";
    if (!data["Domain Name"] && !raw) {
      return { domain, registered: false, source: "whois" };
    }

    return {
      domain,
      registered: true,
      registrar: data["Registrar"] || data["Registrar Name"] || null,
      created: data["Created Date"] || data["Creation Date"] || null,
      expires: data["Expiry Date"] || data["Registry Expiry Date"] || null,
      nameservers: Array.isArray(data["Name Server"])
        ? data["Name Server"].slice(0, 4)
        : [],
      status: [],
      source: "whois",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Source 5: HTTP probe — if a web server responds at the domain, it's
// definitely registered and actively in use. Fast HEAD request.
// ---------------------------------------------------------------------------
async function httpProbe(domain) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch(`https://${domain}`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual", // don't follow redirects, just check if server responds
    });
    clearTimeout(timeout);
    // Any response (even 4xx/5xx) means a server is running = domain is registered
    return "registered";
  } catch (err) {
    clearTimeout(timeout);
    // If it's a DNS resolution error, the domain likely doesn't exist
    // If it's a connection refused, the domain exists but has no web server
    if (err.cause?.code === "ENOTFOUND" || err.cause?.code === "EAI_AGAIN") {
      return "not_registered";
    }
    // Connection refused, reset, etc. = domain exists, server isn't running on HTTPS
    if (
      err.cause?.code === "ECONNREFUSED" ||
      err.cause?.code === "ECONNRESET" ||
      err.cause?.code === "ETIMEDOUT"
    ) {
      return "unknown"; // can't conclude from this
    }
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Main entry: checkDomain — optimized multi-source lookup
//
// Optimizations:
//   1. DNS fast-rejection: if all DNS sources return NXDOMAIN, skip everything
//      else — the domain doesn't exist, no point querying RDAP/WHOIS/HTTP.
//   2. Early termination: DNS + RDAP run in parallel. If RDAP returns full
//      details quickly, we return immediately without waiting for HTTP probe.
//   3. Phase 2 fallbacks only run when Phase 1 RDAP failed but DNS confirmed
//      the domain exists.
// ---------------------------------------------------------------------------
async function checkDomainImpl(domain) {
  // Check server-side LRU cache first
  const cached = cache.get(domain);
  if (cached) return { ...cached, cached: true };

  // Phase 0: DNS fast-check (very fast, ~50ms)
  // If DNS conclusively says NXDOMAIN, skip all other sources.
  const dnsResult = await dnsCheck(domain);

  if (dnsResult === "not_registered") {
    const result = { domain, registered: false, source: "dns" };
    cache.set(domain, result);
    return result;
  }

  // Phase 1: DNS says registered or unknown — run RDAP + HTTP probe in parallel
  const [rdapResult, httpResult] = await Promise.all([
    rdapCheck(domain),
    dnsResult === "registered" ? httpProbe(domain) : Promise.resolve("unknown"),
  ]);

  // Fast path: RDAP gave full details
  if (rdapResult && rdapResult.registered === true) {
    const sources = ["rdap"];
    if (dnsResult === "registered") sources.push("dns");
    if (httpResult === "registered") sources.push("http");
    rdapResult.source = sources.join("+");
    cache.set(domain, rdapResult);
    return rdapResult;
  }

  // RDAP says not registered and DNS agrees — done
  if (rdapResult && rdapResult.registered === false && dnsResult !== "registered" && httpResult !== "registered") {
    cache.set(domain, rdapResult);
    return rdapResult;
  }

  // Phase 2: RDAP failed or inconclusive — try fallbacks
  const confirmedRegistered = dnsResult === "registered" || httpResult === "registered";

  // Try RDAP proxy fallback
  const proxyResult = await rdapProxyCheck(domain);
  if (proxyResult && proxyResult.registered === true) {
    const sources = ["rdap-proxy"];
    if (dnsResult === "registered") sources.push("dns");
    if (httpResult === "registered") sources.push("http");
    proxyResult.source = sources.join("+");
    cache.set(domain, proxyResult);
    return proxyResult;
  }

  // Skip WHOIS if domain is confirmed NOT registered by both DNS and RDAP
  if (!confirmedRegistered && proxyResult?.registered === false) {
    const result = { domain, registered: false, source: "rdap-proxy" };
    cache.set(domain, result);
    return result;
  }

  // Try WHOIS fallback (only if there's reason to believe the domain exists)
  if (ENABLE_WHOIS && (confirmedRegistered || dnsResult === "unknown")) {
    const whoisResult = await whoisCheck(domain);
    if (whoisResult && whoisResult.registered === true) {
      const sources = ["whois"];
      if (dnsResult === "registered") sources.push("dns");
      if (httpResult === "registered") sources.push("http");
      whoisResult.source = sources.join("+");
      cache.set(domain, whoisResult);
      return whoisResult;
    }
    if (whoisResult && whoisResult.registered === false && !confirmedRegistered) {
      cache.set(domain, whoisResult);
      return whoisResult;
    }
  }

  // All detail sources failed — use DNS/HTTP hints
  if (confirmedRegistered) {
    const sources = [];
    if (dnsResult === "registered") sources.push("dns");
    if (httpResult === "registered") sources.push("http");
    const fallback = {
      domain,
      registered: true,
      registrar: null,
      created: null,
      expires: null,
      note: "Registered (confirmed via " + sources.join(" & ") + ", details unavailable)",
      source: sources.join("+"),
    };
    cache.set(domain, fallback);
    return fallback;
  }

  // Truly inconclusive
  const fallback = {
    domain,
    registered: null,
    note: "All lookup sources failed",
    source: "none",
  };
  cache.set(domain, fallback);
  return fallback;
}

// Public entry: wraps the multi-source chain with a hard total-budget
// timeout so one slow upstream can't tie up serverless workers.
export async function checkDomain(domain) {
  return Promise.race([
    checkDomainImpl(domain),
    new Promise((resolve) =>
      setTimeout(
        () => resolve({ domain, registered: null, note: "Lookup timed out", source: "timeout" }),
        TOTAL_BUDGET_MS
      )
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Batch check — runs multiple domains through the multi-source chain
// concurrently with controlled parallelism.
// ---------------------------------------------------------------------------
export async function checkBatch(domains, maxConcurrency = 8) {
  let idx = 0;
  const results = new Array(domains.length);

  async function worker() {
    while (idx < domains.length) {
      const i = idx++;
      results[i] = await checkDomain(domains[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(maxConcurrency, domains.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}
