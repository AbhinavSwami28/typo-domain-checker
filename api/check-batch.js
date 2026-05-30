import { checkBatch } from "../lib/domainChecker.js";
import { rateLimit, isValidDomain } from "./_rateLimit.js";

const MAX_BATCH = 20;
const BATCH_CONCURRENCY = Number(process.env.BATCH_CONCURRENCY || 8);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!rateLimit(req, res)) return;

  const { domains } = req.body || {};
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: "Provide an array of domains" });
  }

  const clean = domains.filter(isValidDomain).slice(0, MAX_BATCH);
  if (clean.length === 0) {
    return res.status(400).json({ error: "No valid domains in request" });
  }

  const results = await checkBatch(clean, BATCH_CONCURRENCY);
  res.json({ results });
}
