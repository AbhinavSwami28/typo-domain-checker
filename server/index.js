import express from "express";
import cors from "cors";
import { generateTypoDomains } from "./domainGenerator.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/**
 * POST /api/generate
 * Body: { domain: "example.com" }
 * Returns list of typo domain permutations.
 */
app.post("/api/generate", (req, res) => {
  const { domain } = req.body;

  if (!domain || !domain.includes(".")) {
    return res.status(400).json({ error: "Please provide a valid domain (e.g. example.com)" });
  }

  // Basic domain validation
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/;
  if (!domainRegex.test(domain)) {
    return res.status(400).json({ error: "Invalid domain format" });
  }

  const typos = generateTypoDomains(domain.toLowerCase().trim());
  res.json({ original: domain, count: typos.length, typos });
});

/**
 * GET /api/check?domain=example.com
 * Checks domain registration status via RDAP (free, open protocol).
 */
app.get("/api/check", async (req, res) => {
  const { domain } = req.query;

  if (!domain) {
    return res.status(400).json({ error: "Domain parameter required" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json" },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();

      // Extract useful info from RDAP response
      const registrar =
        data.entities?.find((e) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find(
          (v) => v[0] === "fn"
        )?.[3] || "Unknown";

      const events = data.events || [];
      const created = events.find((e) => e.eventAction === "registration")?.eventDate || null;
      const expires = events.find((e) => e.eventAction === "expiration")?.eventDate || null;

      const nameservers = (data.nameservers || []).map(
        (ns) => ns.ldhName || ns.unicodeName
      );

      res.json({
        domain,
        registered: true,
        registrar,
        created,
        expires,
        nameservers: nameservers.slice(0, 4),
        status: data.status || [],
      });
    } else if (response.status === 404) {
      res.json({ domain, registered: false });
    } else {
      // Some TLDs may not support RDAP yet
      res.json({ domain, registered: null, note: "RDAP not available for this TLD" });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      res.json({ domain, registered: null, note: "Lookup timed out" });
    } else {
      res.json({ domain, registered: null, note: "Lookup failed" });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
