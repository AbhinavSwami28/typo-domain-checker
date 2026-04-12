import { checkDomain } from "../lib/domainChecker.js";

export default async function handler(req, res) {
  const { domain } = req.query;
  if (!domain) {
    return res.status(400).json({ error: "Domain parameter required" });
  }

  const result = await checkDomain(domain);
  res.json(result);
}
