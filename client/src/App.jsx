import { useState, useCallback, useRef } from "react";

const STATUS_LABELS = {
  checking: "Checking...",
  registered: "Registered",
  available: "Available",
  unknown: "Unknown",
};

const PAGE_SIZE = 50;

// Concurrent pool: runs fn for each item with max concurrency in-flight
async function runPool(items, concurrency, fn, signal) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      if (signal?.aborted) return;
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
}

// Levenshtein distance for risk scoring
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Known enterprise/corporate domain registrars used for brand protection
const CORPORATE_REGISTRARS = [
  "csc corporate domains",
  "markmonitor",
  "safenames",
  "comlaude",
  "nom-iq",
  "corsearch",
  "brandshelter",
  "gandi corporate",
];

function normalizeRegistrar(registrar) {
  if (!registrar) return "";
  return registrar.toLowerCase().replace(/[,.].*$/, "").trim();
}

function isSameRegistrar(regA, regB) {
  if (!regA || !regB) return false;
  const a = normalizeRegistrar(regA);
  const b = normalizeRegistrar(regB);
  if (a === b) return true;
  // Fuzzy: check if one contains the other (e.g., "CSC Corporate Domains" vs "CSC Corporate Domains, Inc.")
  return a.includes(b) || b.includes(a);
}

function isCorporateRegistrar(registrar) {
  if (!registrar) return false;
  const norm = registrar.toLowerCase();
  return CORPORATE_REGISTRARS.some((cr) => norm.includes(cr));
}

function areDatesClose(dateA, dateB, thresholdDays = 365) {
  if (!dateA || !dateB) return false;
  try {
    const diff = Math.abs(new Date(dateA) - new Date(dateB));
    return diff <= thresholdDays * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function computeRisk(original, typo, originalInfo) {
  const origName = original.split(".")[0];
  const typoName = typo.domain.split(".")[0];
  const dist = levenshtein(origName, typoName);
  const sameTld = original.split(".").slice(1).join(".") === typo.domain.split(".").slice(1).join(".");

  // Closer edit distance + same TLD = higher risk
  let score = Math.max(0, 100 - dist * 25);
  if (!sameTld) score = Math.max(0, score - 20);
  if (typo.type === "Homoglyph") score = Math.min(100, score + 15);
  if (typo.type === "Transposition") score = Math.min(100, score + 10);
  if (typo.status === "registered") score = Math.min(100, score + 20);

  // Defensive registration detection: reduce risk if same registrar as original
  if (typo.status === "registered" && originalInfo?.registrar && typo.registrar) {
    const sameReg = isSameRegistrar(originalInfo.registrar, typo.registrar);
    const corpReg = isCorporateRegistrar(typo.registrar);
    const datesClose = areDatesClose(originalInfo.created, typo.created);

    if (sameReg) {
      // Same registrar as the original domain — very likely defensive
      score = Math.max(0, score - 40);
      if (datesClose) {
        // Same registrar AND registered around the same time — almost certainly defensive
        score = Math.max(0, score - 20);
      }
    } else if (corpReg) {
      // Different registrar but it's a known corporate registrar — likely legitimate
      score = Math.max(0, score - 20);
    }
  }

  return score;
}

function getRiskLabel(score) {
  if (score >= 80) return { label: "Critical", cls: "risk-critical" };
  if (score >= 60) return { label: "High", cls: "risk-high" };
  if (score >= 40) return { label: "Medium", cls: "risk-medium" };
  if (score >= 10) return { label: "Low", cls: "risk-low" };
  return { label: "Defensive", cls: "risk-defensive" };
}

function exportCSV(typos, original, originalInfo) {
  const header = "Domain,Type,Status,Risk Score,Registrar,Created,Expires,Source\n";
  const rows = typos.map((t) => {
    const risk = computeRisk(original, t, originalInfo);
    return [
      t.domain,
      t.type,
      t.status,
      risk,
      t.registrar || "",
      t.created || "",
      t.expires || "",
      t.source || "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  const blob = new Blob([header + rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `typo-domains-${original}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState(null); // null | "risk" | "domain" | "status"
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advFilters, setAdvFilters] = useState({
    type: "",
    registrar: "",
    source: "",
    createdFrom: "",
    createdTo: "",
    expiresFrom: "",
    expiresTo: "",
  });
  const abortRef = useRef(null);

  const checkBatch = useCallback(async (domains, signal) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    if (signal) signal.addEventListener("abort", () => controller.abort());

    try {
      const res = await fetch("/api/check-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error("Bad response"); }

      setTypos((prev) => {
        const updated = [...prev];
        for (const result of data.results) {
          const idx = updated.findIndex((t) => t.domain === result.domain);
          if (idx !== -1) {
            updated[idx] = {
              ...updated[idx],
              status: result.registered === true ? "registered"
                : result.registered === false ? "available" : "unknown",
              registrar: result.registrar ?? null,
              created: result.created ?? null,
              expires: result.expires ?? null,
              nameservers: result.nameservers ?? [],
              note: result.note ?? null,
              source: result.source ?? null,
              cached: result.cached ?? false,
            };
          }
        }
        return updated;
      });
      setProgress((p) => ({ ...p, done: p.done + domains.length }));
    } catch (err) {
      if (err.name === "AbortError") return;
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

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setChecking(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError("");
    setTypos([]);
    setStats(null);
    setFilter("all");
    setPage(0);
    setSortBy(null);
    setShowAdvanced(false);
    setAdvFilters({ type: "", registrar: "", source: "", createdFrom: "", createdTo: "", expiresFrom: "", expiresTo: "" });
    handleCancel();

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

      // Look up the original domain to get its registrar for risk comparison
      let originalInfo = null;
      try {
        const origRes = await fetch(`/api/check?domain=${encodeURIComponent(trimmed)}`);
        if (origRes.ok) {
          originalInfo = await origRes.json();
        }
      } catch { /* proceed without original info */ }

      setStats({ original: data.original, count: data.count, originalInfo });
      setLoading(false);
      setChecking(true);

      const BATCH_SIZE = 16;
      const chunks = [];
      for (let i = 0; i < typoList.length; i += BATCH_SIZE) {
        chunks.push(typoList.slice(i, i + BATCH_SIZE).map((t) => t.domain));
      }
      setProgress({ done: 0, total: typoList.length });

      const ac = new AbortController();
      abortRef.current = ac;

      await runPool(chunks, 4, (chunk) => checkBatch(chunk, ac.signal), ac.signal);

      if (!ac.signal.aborted) setChecking(false);
    } catch {
      setError("Failed to connect to server.");
      setLoading(false);
      setChecking(false);
    }
  };

  // Compute dynamic filter options (only from completed results)
  const checksComplete = !checking && typos.length > 0;
  const filterOptions = checksComplete ? {
    types: [...new Set(typos.map((t) => t.type))].sort(),
    registrars: [...new Set(typos.filter((t) => t.registrar).map((t) => t.registrar))].sort(),
    sources: [...new Set(typos.filter((t) => t.source).map((t) => t.source))].sort(),
  } : { types: [], registrars: [], sources: [] };

  const updateAdvFilter = (key, val) => {
    setAdvFilters((prev) => ({ ...prev, [key]: val }));
    setPage(0);
  };

  const hasActiveAdvFilters = Object.values(advFilters).some((v) => v !== "");

  const clearAdvFilters = () => {
    setAdvFilters({ type: "", registrar: "", source: "", createdFrom: "", createdTo: "", expiresFrom: "", expiresTo: "" });
    setPage(0);
  };

  // Filtering — status tabs + advanced filters (AND logic)
  const filtered = typos.filter((t) => {
    if (filter !== "all" && t.status !== filter) return false;
    if (advFilters.type && t.type !== advFilters.type) return false;
    if (advFilters.registrar && (t.registrar || "") !== advFilters.registrar) return false;
    if (advFilters.source && (t.source || "") !== advFilters.source) return false;
    if (advFilters.createdFrom && t.created) {
      if (new Date(t.created) < new Date(advFilters.createdFrom)) return false;
    }
    if (advFilters.createdTo && t.created) {
      if (new Date(t.created) > new Date(advFilters.createdTo + "T23:59:59")) return false;
    }
    if (advFilters.expiresFrom && t.expires) {
      if (new Date(t.expires) < new Date(advFilters.expiresFrom)) return false;
    }
    if (advFilters.expiresTo && t.expires) {
      if (new Date(t.expires) > new Date(advFilters.expiresTo + "T23:59:59")) return false;
    }
    // If a date filter is active but the domain has no date, exclude it
    if ((advFilters.createdFrom || advFilters.createdTo) && !t.created) return false;
    if ((advFilters.expiresFrom || advFilters.expiresTo) && !t.expires) return false;
    return true;
  });

  // Sorting
  const sorted = [...filtered];
  if (sortBy === "risk" && stats) {
    sorted.sort((a, b) => computeRisk(stats.original, b, stats.originalInfo) - computeRisk(stats.original, a, stats.originalInfo));
  } else if (sortBy === "domain") {
    sorted.sort((a, b) => a.domain.localeCompare(b.domain));
  } else if (sortBy === "status") {
    const order = { registered: 0, available: 1, unknown: 2, checking: 3 };
    sorted.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }

  // Pagination
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return "N/A"; }
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const handleSort = (col) => {
    setSortBy((prev) => (prev === col ? null : col));
    setPage(0);
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
          aria-label="Domain name"
        />
        <button type="submit" className="btn-generate" disabled={loading}>
          {loading ? "Generating..." : "Generate & Check"}
        </button>
        {checking && (
          <button type="button" className="btn-cancel" onClick={handleCancel}>
            Cancel
          </button>
        )}
      </form>

      {error && <div className="error" role="alert">{error}</div>}

      {stats && (
        <div className="stats-bar">
          <span className="stats-original">
            Target: <strong>{stats.original}</strong>
          </span>
          <span className="stats-count">{stats.count} variants</span>
          {stats.originalInfo?.registrar && (
            <span className="stats-registrar">
              Registrar: <strong>{stats.originalInfo.registrar}</strong>
            </span>
          )}
          {checking && (
            <span className="stats-progress">
              Checking... {progress.done}/{progress.total} ({pct}%)
            </span>
          )}
          {!checking && typos.length > 0 && (
            <>
              <span className="stats-done">All checks complete</span>
              <button
                className="btn-export"
                onClick={() => exportCSV(typos, stats.original, stats.originalInfo)}
                title="Download results as CSV"
              >
                Export CSV
              </button>
            </>
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
                onClick={() => { setFilter(f); setPage(0); }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
              </button>
            ))}
            {checksComplete && (
              <button
                className={`filter-btn filter-btn-advanced ${showAdvanced ? "active" : ""}`}
                onClick={() => setShowAdvanced((v) => !v)}
              >
                Filters {hasActiveAdvFilters ? "*" : ""}
              </button>
            )}
          </div>

          {showAdvanced && checksComplete && (
            <div className="advanced-filters">
              <div className="adv-filter-row">
                <label>
                  <span>Type</span>
                  <select value={advFilters.type} onChange={(e) => updateAdvFilter("type", e.target.value)}>
                    <option value="">All types</option>
                    {filterOptions.types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  <span>Registrar</span>
                  <select value={advFilters.registrar} onChange={(e) => updateAdvFilter("registrar", e.target.value)}>
                    <option value="">All registrars</option>
                    {filterOptions.registrars.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label>
                  <span>Source</span>
                  <select value={advFilters.source} onChange={(e) => updateAdvFilter("source", e.target.value)}>
                    <option value="">All sources</option>
                    {filterOptions.sources.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <div className="adv-filter-row">
                <label>
                  <span>Created from</span>
                  <input type="date" value={advFilters.createdFrom} onChange={(e) => updateAdvFilter("createdFrom", e.target.value)} />
                </label>
                <label>
                  <span>Created to</span>
                  <input type="date" value={advFilters.createdTo} onChange={(e) => updateAdvFilter("createdTo", e.target.value)} />
                </label>
                <label>
                  <span>Expires from</span>
                  <input type="date" value={advFilters.expiresFrom} onChange={(e) => updateAdvFilter("expiresFrom", e.target.value)} />
                </label>
                <label>
                  <span>Expires to</span>
                  <input type="date" value={advFilters.expiresTo} onChange={(e) => updateAdvFilter("expiresTo", e.target.value)} />
                </label>
              </div>
              {hasActiveAdvFilters && (
                <button className="btn-clear-filters" onClick={clearAdvFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          )}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "45px" }}>#</th>
                  <th
                    style={{ width: "220px", cursor: "pointer" }}
                    onClick={() => handleSort("domain")}
                  >
                    Domain {sortBy === "domain" ? "▲" : ""}
                  </th>
                  <th style={{ width: "120px" }}>Type</th>
                  <th
                    style={{ width: "110px", cursor: "pointer" }}
                    onClick={() => handleSort("status")}
                  >
                    Status {sortBy === "status" ? "▲" : ""}
                  </th>
                  <th
                    style={{ width: "90px", cursor: "pointer" }}
                    onClick={() => handleSort("risk")}
                  >
                    Risk {sortBy === "risk" ? "▼" : ""}
                  </th>
                  <th style={{ width: "170px" }}>Registrar</th>
                  <th style={{ width: "110px" }}>Created</th>
                  <th style={{ width: "110px" }}>Expires</th>
                  <th style={{ width: "60px" }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((t, i) => {
                  const riskScore = stats ? computeRisk(stats.original, t, stats.originalInfo) : 0;
                  const risk = getRiskLabel(riskScore);
                  return (
                    <tr key={t.domain} className={`row-${t.status}`}>
                      <td className="col-num">{page * PAGE_SIZE + i + 1}</td>
                      <td className="col-domain">{t.domain}</td>
                      <td className="col-type">
                        <span className="badge-type">{t.type}</span>
                      </td>
                      <td className="col-status">
                        <span className={`badge-status badge-${t.status}`}>
                          {STATUS_LABELS[t.status]}
                        </span>
                      </td>
                      <td className="col-risk">
                        <span className={`badge-risk ${risk.cls}`}>
                          {risk.label}
                        </span>
                      </td>
                      <td className="col-registrar" title={t.registrar || ""}>
                        {t.status === "registered" ? (t.registrar || "N/A") : "-"}
                      </td>
                      <td className="col-date">
                        {t.status === "registered" ? formatDate(t.created) : "-"}
                      </td>
                      <td className="col-date">
                        {t.status === "registered" ? formatDate(t.expires) : "-"}
                      </td>
                      <td className="col-source">
                        {t.source ? (
                          <span className="badge-source" title={t.cached ? "Cached" : ""}>
                            {t.source}{t.cached ? " *" : ""}
                          </span>
                        ) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(0)}>
                First
              </button>
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <span className="page-info">
                Page {page + 1} of {totalPages} ({sorted.length} results)
              </span>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(totalPages - 1)}
              >
                Last
              </button>
            </div>
          )}
        </>
      )}

      {typos.length === 0 && !loading && !error && (
        <div className="empty-state">
          <div className="empty-icon">&#128269;</div>
          <p>
            Enter a domain above to generate lookalike typo variations and check
            if they are registered.
          </p>
          <div className="techniques">
            <h3>Detection Techniques</h3>
            <div className="technique-grid">
              {[
                "Character Omission", "Transposition",
                "Adjacent Key (QWERTY/QWERTZ/AZERTY)",
                "Character Duplication", "Character Insertion",
                "Homoglyph Substitution", "Double Homoglyph",
                "TLD Swap", "Dot Insertion",
                "Hyphen Insertion", "Vowel Swap", "Bitsquatting",
                "Word Swap", "Word Omission", "Hyphen Omission",
                "WWW Prefix", "Prefix/Suffix Addition", "ccTLD Variants",
                "Singular/Plural", "Numeric Addition",
                "Cyrillic IDN Homograph", "Homophones",
                "Common Misspellings", "Double Omission",
                "Vowel Omission",
              ].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
          <div className="techniques" style={{ marginTop: "24px" }}>
            <h3>Lookup Sources (Multi-Source)</h3>
            <div className="technique-grid">
              {[
                "Native DNS", "Google DoH", "Cloudflare DoH",
                "HTTP Probe", "Direct Registry RDAP",
                "RDAP Proxy (rdap.org)", "WHOIS (whoiser)",
              ].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
