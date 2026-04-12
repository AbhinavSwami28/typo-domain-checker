async function checkOne(domain) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`https://rdap.org/domain/${domain}`, {
      signal: controller.signal,
      headers: { Accept: "application/rdap+json" },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();

      const registrar =
        data.entities?.find((e) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find(
          (v) => v[0] === "fn"
        )?.[3] || "Unknown";

      const events = data.events || [];
      const created = events.find((e) => e.eventAction === "registration")?.eventDate || null;
      const expires = events.find((e) => e.eventAction === "expiration")?.eventDate || null;

      return { domain, registered: true, registrar, created, expires };
    } else if (response.status === 404) {
      return { domain, registered: false };
    } else {
      return { domain, registered: null, note: "RDAP not available for this TLD" };
    }
  } catch (err) {
    return {
      domain,
      registered: null,
      note: err.name === "AbortError" ? "Timed out" : "Lookup failed",
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { domains } = req.body;

  if (!Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: "Provide an array of domains" });
  }

  // Cap at 20 per batch to stay within serverless time limits
  const batch = domains.slice(0, 20);
  const results = await Promise.all(batch.map(checkOne));

  res.json({ results });
}
