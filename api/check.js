import { checkDomain } from "../lib/domainChecker.js";
import { rateLimit, isValidDomain } from "./_rateLimit.js";

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;

  const { domain } = req.query;
  if (!isValidDomain(domain)) {
    return res.status(400).json({ error: "Valid domain parameter required" });
  }

  const result = await checkDomain(domain);
  res.json(result);
}
