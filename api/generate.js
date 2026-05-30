import { validateDomain, generateTypoDomains } from "../lib/domainGenerator.js";
import { rateLimit } from "./_rateLimit.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!rateLimit(req, res)) return;

  const validation = validateDomain(req.body?.domain);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const typos = generateTypoDomains(validation.domain);
  res.json({ original: validation.domain, count: typos.length, typos });
}
