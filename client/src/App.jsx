import { useState, useCallback } from "react";

const STATUS_LABELS = {
  checking: "Checking...",
  registered: "Registered",
  available: "Available",
  unknown: "Unknown",
};

export default function App() {
  const [domain, setDomain] = useState("");
  const [typos, setTypos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("all");
  const [checkingCount, setCheckingCount] = useState(0);

  const checkDomain = useCallback(async (domainToCheck, index, setTyposFn) => {
    const MAX_RETRIES = 2;
    let lastErr = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(
          `/api/check?domain=${encodeURIComponent(domainToCheck)}`,
          { signal: controller.signal }
        );
        clearTimeout(timeout);
        const data = await res.json();

        setTyposFn((prev) => {
          const updated = [...prev];
          if (updated[index]) {
            updated[index] = {
              ...updated[index],
              status:
                data.registered === true
                  ? "registered"
                  : data.registered === false
                    ? "available"
                    : "unknown",
              registrar: data.registrar ?? null,
              created: data.created ?? null,
              expires: data.expires ?? null,
              note: data.note ?? null,
            };
          }
          return updated;
        });
        return; // success
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    // All retries exhausted
    setTyposFn((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          status: "unknown",
          note: lastErr?.name === "AbortError" ? "Timed out" : "Request failed",
        };
      }
      return updated;
    });
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setTypos([]);
    setStats(null);
    setFilter("all");

    const trimmed = domain.trim().toLowerCase();
    if (!trimmed || !trimmed.includes(".")) {
      setError("Please enter a valid domain (e.g. example.com)");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to generate typo domains");
        setLoading(false);
        return;
      }

      const typoList = data.typos.map((t) => ({ ...t, status: "checking" }));
      setTypos(typoList);
      setStats({ original: data.original, count: data.count });
      setLoading(false);

      // Check availability: batch of 3, await entire batch before next
      const BATCH_SIZE = 3;
      const BATCH_DELAY = 600;
      setCheckingCount(typoList.length);

      for (let i = 0; i < typoList.length; i += BATCH_SIZE) {
        const batch = typoList.slice(i, i + BATCH_SIZE);
        const promises = batch.map((t, batchIdx) =>
          checkDomain(t.domain, i + batchIdx, setTypos).finally(() =>
            setCheckingCount((c) => c - 1)
          )
        );

        // Wait for the entire batch to finish before starting the next
        await Promise.allSettled(promises);

        if (i + BATCH_SIZE < typoList.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }
      }
    } catch {
      setError("Failed to connect to server. Is the backend running?");
      setLoading(false);
    }
  };

  const filteredTypos = typos.filter((t) => {
    if (filter === "all") return true;
    return t.status === filter;
  });

  const counts = {
    all: typos.length,
    registered: typos.filter((t) => t.status === "registered").length,
    available: typos.filter((t) => t.status === "available").length,
    checking: typos.filter((t) => t.status === "checking").length,
    unknown: typos.filter((t) => t.status === "unknown").length,
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const displayField = (value) => {
    if (value === null || value === undefined || value === "" || value === "Unknown") {
      return "N/A";
    }
    return value;
  };

  return (
    <div className="app">
      <header>
        <h1>Typo Domain Checker</h1>
        <p className="subtitle">
          Generate lookalike typo domains and check their registration status
        </p>
      </header>

      <form onSubmit={handleGenerate} className="search-form">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Enter a domain (e.g. example.com)"
          className="domain-input"
          disabled={loading}
        />
        <button type="submit" className="btn-generate" disabled={loading}>
          {loading ? "Generating..." : "Generate & Check"}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {stats && (
        <div className="stats-bar">
          <span className="stats-original">
            Target: <strong>{stats.original}</strong>
          </span>
          <span className="stats-count">
            {stats.count} typo domains generated
          </span>
          {checkingCount > 0 && (
            <span className="stats-progress">
              Checking availability... ({checkingCount} remaining)
            </span>
          )}
          {checkingCount === 0 && typos.length > 0 && (
            <span className="stats-done">All checks complete</span>
          )}
        </div>
      )}

      {typos.length > 0 && (
        <>
          <div className="filter-bar">
            {["all", "registered", "available", "unknown", "checking"].map((f) => (
              <button
                key={f}
                className={`filter-btn ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
              </button>
            ))}
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "50px" }}>#</th>
                  <th style={{ width: "250px" }}>Domain</th>
                  <th style={{ width: "150px" }}>Type</th>
                  <th style={{ width: "120px" }}>Status</th>
                  <th style={{ width: "200px" }}>Registrar</th>
                  <th style={{ width: "130px" }}>Created</th>
                  <th style={{ width: "130px" }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {filteredTypos.map((t, i) => (
                  <tr key={t.domain} className={`row-${t.status}`}>
                    <td className="col-num">{i + 1}</td>
                    <td className="col-domain">{t.domain}</td>
                    <td className="col-type">
                      <span className="badge-type">{t.type}</span>
                    </td>
                    <td className="col-status">
                      <span className={`badge-status badge-${t.status}`}>
                        {STATUS_LABELS[t.status]}
                      </span>
                      {t.note && t.status === "unknown" && (
                        <span className="note-text" title={t.note}>
                          {" "}({t.note})
                        </span>
                      )}
                    </td>
                    <td className="col-registrar" title={t.status === "registered" ? (t.registrar || "") : ""}>
                      {t.status === "registered" ? displayField(t.registrar) : "-"}
                    </td>
                    <td className="col-date">
                      {t.status === "registered" ? formatDate(t.created) : "-"}
                    </td>
                    <td className="col-date">
                      {t.status === "registered" ? formatDate(t.expires) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {typos.length === 0 && !loading && !error && (
        <div className="empty-state">
          <div className="empty-icon">&#128269;</div>
          <p>Enter a domain above to generate lookalike typo variations and check if they are registered.</p>
          <div className="techniques">
            <h3>Detection Techniques Used</h3>
            <div className="technique-grid">
              <span>Character Omission</span>
              <span>Transposition</span>
              <span>Adjacent Key</span>
              <span>Character Duplication</span>
              <span>Character Insertion</span>
              <span>Homoglyph Substitution</span>
              <span>TLD Swap</span>
              <span>Dot Insertion</span>
              <span>Hyphen Insertion</span>
              <span>Vowel Swap</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
