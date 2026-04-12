import { checkBatch } from "../lib/domainChecker.js";

const MAX_BATCH = 20;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { domains } = req.body;
  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: "Provide an array of domains" });
  }

  // Validate and cap
  const clean = domains
    .filter((d) => typeof d === "string" && d.includes("."))
    .slice(0, MAX_BATCH);

  const results = await checkBatch(clean, 10);
  res.json({ results });
}
