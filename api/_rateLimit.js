// Shared rate limit + request validation for Vercel API routes.
// Per-instance in-memory token bucket. On Vercel each warm function instance
// has its own map — this is best-effort throttling, not a global guarantee.

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 30);
const MAX_DOMAIN_LEN = 253;

const buckets = new Map();
let lastSweep = Date.now();

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function sweep(now) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, entry] of buckets) {
    if (now - entry.start > WINDOW_MS) buckets.delete(ip);
  }
}

export function rateLimit(req, res, limit = DEFAULT_LIMIT) {
  const ip = clientIp(req);
  const now = Date.now();
  sweep(now);

  let entry = buckets.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    entry = { start: now, count: 0 };
    buckets.set(ip, entry);
  }
  entry.count++;

  if (entry.count > limit) {
    res.setHeader("Retry-After", String(Math.ceil((WINDOW_MS - (now - entry.start)) / 1000)));
    res.status(429).json({ error: "Rate limit exceeded. Try again shortly." });
    return false;
  }
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)));
  return true;
}

export function isValidDomain(d) {
  return (
    typeof d === "string" &&
    d.length > 0 &&
    d.length <= MAX_DOMAIN_LEN &&
    d.includes(".") &&
    /^[a-z0-9.-]+$/i.test(d)
  );
}
