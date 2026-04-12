# Typo Domain Checker

A security-focused tool that generates lookalike typo domains for any given domain and checks their registration status in real time. Useful for brand protection, phishing detection, and domain security audits.

**Live:** [typo-domain-checker.vercel.app](https://typo-domain-checker.vercel.app)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React Frontend (Vite)                                  │
│  ┌─────────┐  ┌────────────┐  ┌──────────────────────┐ │
│  │  Input   │→ │  Generate  │→ │  Results Table       │ │
│  │  Form    │  │  Typos     │  │  + Risk Scores       │ │
│  │          │  │  (POST)    │  │  + Pagination        │ │
│  └─────────┘  └────────────┘  │  + Sort/Filter       │ │
│                               │  + CSV Export         │ │
│                               └──────────────────────┘ │
└───────────────────┬─────────────────────────────────────┘
                    │  /api/generate (POST)
                    │  /api/check-batch (POST)
                    ▼
┌─────────────────────────────────────────────────────────┐
│  Serverless API (Vercel Functions / Express)             │
│                                                         │
│  ┌─────────────┐    ┌──────────────────────────────┐   │
│  │  Domain      │    │  Domain Checker (lib/)       │   │
│  │  Generator   │    │                              │   │
│  │  (lib/)      │    │  ┌──────────────────────┐   │   │
│  │              │    │  │  1. LRU Cache (1000)  │   │   │
│  │  10 typo     │    │  │  2. DNS Pre-filter    │   │   │
│  │  techniques  │    │  │  3. Direct RDAP       │   │   │
│  └─────────────┘    │  │  4. RDAP Proxy        │   │   │
│                      │  │  5. WHOIS (whoiser)   │   │   │
│                      │  └──────────────────────┘   │   │
│                      └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Features

### Typo Generation (10 techniques)
| Technique | Example (for `example.com`) |
|---|---|
| Character Omission | `exmple.com` |
| Transposition | `exapmle.com` |
| Adjacent Key (QWERTY) | `exanple.com` |
| Character Duplication | `exxample.com` |
| Character Insertion | `exaample.com` |
| Homoglyph Substitution | `examp1e.com`, `exampl3.com` |
| TLD Swap | `example.net`, `example.io` |
| Dot Insertion | `ex.ample.com` |
| Hyphen Insertion | `ex-ample.com` |
| Vowel Swap | `axample.com` |

### Domain Availability Check (4-source fallback chain)

Each domain goes through a cascading lookup:

1. **DNS Pre-filter** — instant NS/A record check (~50ms). If records exist, the domain is definitely registered. Skips expensive RDAP/WHOIS for obvious cases.
2. **Direct Registry RDAP** — queries the authoritative RDAP server for the TLD (e.g., Verisign for `.com/.net`). Fastest and most reliable source.
3. **RDAP Proxy** — falls back to `rdap.org` bootstrap proxy if direct lookup fails.
4. **WHOIS** — uses `whoiser` (pure JS) to query WHOIS servers directly. Handles TLDs where RDAP isn't available.

Results are cached in a 1000-entry LRU cache to avoid redundant lookups.

### Frontend Features
- **Risk scoring** — each typo gets a risk score (Critical/High/Medium/Low) based on edit distance, TLD match, typo type, and registration status
- **Sortable columns** — click column headers to sort by domain, status, or risk
- **Pagination** — 50 results per page for smooth rendering
- **CSV export** — download all results with risk scores for reporting
- **Cancel** — abort in-progress checks at any time
- **Filter tabs** — filter by Registered / Available / Unknown / Checking

### Security
- CORS restricted to known origins
- Rate limiting (60 req/min per IP)
- Request body size limit (50KB)
- Input validation with domain length cap
- Type-checked batch inputs

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | [React](https://react.dev/) + [Vite](https://vitejs.dev/) | SPA with HMR |
| Backend | [Express](https://expressjs.com/) | Local dev server |
| Serverless | [Vercel Functions](https://vercel.com/docs/functions) | Production API |
| RDAP | [rdap.org](https://about.rdap.org/) + direct registries | Domain registration data |
| WHOIS | [whoiser](https://github.com/nicedoc/whoiser) | WHOIS fallback (pure JS) |
| DNS | Node.js `dns` module | Pre-filter for fast checks |
| Dev runner | [concurrently](https://github.com/open-cli-tools/concurrently) | Run server + client together |

## Getting Started

```bash
# Clone
git clone https://github.com/AbhinavSwami28/typo-domain-checker.git
cd typo-domain-checker

# Install all dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Run (starts backend on :3001, frontend on :5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## API Reference

### `POST /api/generate`
Generate typo permutations for a domain.

```json
// Request
{ "domain": "example.com" }

// Response
{
  "original": "example.com",
  "count": 312,
  "typos": [
    { "domain": "exmple.com", "type": "Omission" },
    { "domain": "exapmle.com", "type": "Transposition" }
  ]
}
```

### `POST /api/check-batch`
Check registration status for up to 20 domains.

```json
// Request
{ "domains": ["exmple.com", "exapmle.com"] }

// Response
{
  "results": [
    {
      "domain": "exmple.com",
      "registered": false,
      "source": "rdap"
    },
    {
      "domain": "exapmle.com",
      "registered": true,
      "registrar": "NameCheap, Inc.",
      "created": "2020-01-15T00:00:00Z",
      "expires": "2025-01-15T00:00:00Z",
      "source": "rdap"
    }
  ]
}
```

### `GET /api/check?domain=example.com`
Check a single domain (same response shape as batch results).

## Project Structure

```
typo-domain-checker/
├── api/                    # Vercel serverless functions
│   ├── generate.js
│   ├── check.js
│   └── check-batch.js
├── lib/                    # Shared modules (used by both api/ and server/)
│   ├── domainGenerator.js  # Typo generation algorithms
│   └── domainChecker.js    # Fallback chain + caching
├── server/                 # Express dev server
│   └── index.js
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   └── main.jsx
│   ├── index.html
│   └── vite.config.js
├── vercel.json
└── package.json
```

## License

MIT
