import { useState, useCallback, useRef } from "react";

const STATUS_LABELS = {
  checking: "Checking...",
  registered: "Registered",
  available: "Available",
  unknown: "Unknown",
};

// Concurrent pool: runs `fn` for each item with max `concurrency` in-flight
async function runPool(items, concurrency, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

export default function App() {
  const [domain, setDomain] = useState("");
  const [typos, setTypos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const cancelledRef = useRef(false);

  const checkBatch = useCallback(async (domains, startIndex) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch("/api/check-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();

      setTypos((prev) => {
        const updated = [...prev];
        for (const result of data.results) {
          const idx = updated.findIndex((t) => t.domain === result.domain);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              status:
                result.registered === true
                  ? "registered"
                  : result.registered === false
                    ? "available"
                    : "unknown",
              registrar: result.registrar ?? null,
              created: result.created ?? null,
              expires: result.expires ?? null,
              note: result.note ?? null,
            };
          }
        }
        return updated;
      });

      setProgress((p) => ({ ...p, done: p.done + domains.length }));
    } catch {
      // Mark all in this batch as unknown
      setTypos((prev) => {
        const updated = [...prev];
        for (const d of domains) {
          const idx = updated.findIndex((t) => t.domain === d);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], status: "unknown", note: "Batch failed" };
          }
        }
        return updated;
      });
      setProgress((p) => ({ ...p, done: p.done + domains.length }));
    }
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setTypos([]);
    setStats(null);
    setFilter("all");
    cancelledRef.current = false;

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
      setChecking(true);

      // Split into chunks of 15 (backend batch limit)
      const BATCH_SIZE = 15;
      const chunks = [];
      for (let i = 0; i < typoList.length; i += BATCH_SIZE) {
        chunks.push(typoList.slice(i, i + BATCH_SIZE).map((t) => t.domain));
      }

      setProgress({ done: 0, total: typoList.length });

      // Run 4 batch requests concurrently — each batch checks 15 domains
      // server-side in parallel. So effectively 60 domains checked at once.
      await runPool(chunks, 4, async (chunk, i) => {
        if (cancelledRef.current) return;
        await checkBatch(chunk, i * BATCH_SIZE);
      });

      setChecking(false);
    } catch {
      setError("Failed to connect to server. Is the backend running?");
      setLoading(false);
      setChecking(false);
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

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

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
          {checking && (
            <span className="stats-progress">
              Checking... {progress.done}/{progress.total} ({pct}%)
            </span>
          )}
          {!checking && typos.length > 0 && (
            <span className="stats-done">All checks complete</span>
          )}
        </div>
      )}

      {checking && (
        <div className="progress-bar-wrapper">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
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
                        <span className="note-text"> ({t.note})</span>
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
