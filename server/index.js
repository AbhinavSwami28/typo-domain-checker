import express from "express";
import cors from "cors";
import { validateDomain, generateTypoDomains } from "../lib/domainGenerator.js";
import { checkDomain, checkBatch } from "../lib/domainChecker.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Security middleware
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://typo-domain-checker.vercel.app",
];

app.use(
  cors({
    origin(origin, cb) {
      // Allow requests with no origin (curl, server-to-server)
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
  })
);

app.use(express.json({ limit: "50kb" }));

// Simple in-memory rate limiter: max 60 requests per minute per IP
const rateMap = new Map();
const RATE_WINDOW = 60_000;
const RATE_LIMIT = 60;

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  let entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    entry = { start: now, count: 0 };
    rateMap.set(ip, entry);
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
  }
  res.set("X-RateLimit-Remaining", String(RATE_LIMIT - entry.count));
  next();
});

// Cleanup stale rate limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW;
  for (const [ip, entry] of rateMap) {
    if (entry.start < cutoff) rateMap.delete(ip);
  }
}, 300_000);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post("/api/generate", (req, res) => {
  const validation = validateDomain(req.body?.domain);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  const typos = generateTypoDomains(validation.domain);
  res.json({ original: validation.domain, count: typos.length, typos });
});

app.get("/api/check", async (req, res) => {
  const { domain } = req.query;
  if (!domain) {
    return res.status(400).json({ error: "Domain parameter required" });
  }
  const result = await checkDomain(domain);
  res.json(result);
});

app.post("/api/check-batch", async (req, res) => {
  const { domains } = req.body;
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: "Provide an array of domains" });
  }
  const clean = domains
    .filter((d) => typeof d === "string" && d.includes("."))
    .slice(0, 20);

  const results = await checkBatch(clean, 20);
  res.json({ results });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
