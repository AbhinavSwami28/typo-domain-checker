export default async function handler(req, res) {
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

      const registrar =
        data.entities?.find((e) => e.roles?.includes("registrar"))?.vcardArray?.[1]?.find(
          (v) => v[0] === "fn"
        )?.[3] || "Unknown";

      const events = data.events || [];
      const created = events.find((e) => e.eventAction === "registration")?.eventDate || null;
      const expires = events.find((e) => e.eventAction === "expiration")?.eventDate || null;
      const nameservers = (data.nameservers || []).map((ns) => ns.ldhName || ns.unicodeName).slice(0, 4);

      res.json({ domain, registered: true, registrar, created, expires, nameservers, status: data.status || [] });
    } else if (response.status === 404) {
      res.json({ domain, registered: false });
    } else {
      res.json({ domain, registered: null, note: "RDAP not available for this TLD" });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      res.json({ domain, registered: null, note: "Lookup timed out" });
    } else {
      res.json({ domain, registered: null, note: "Lookup failed" });
    }
  }
}
