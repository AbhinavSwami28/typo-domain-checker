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
│  │  10 typo     │    │  │  2. DNS (native+DoH)  │   │   │
│  │  techniques  │    │  │  3. HTTP Probe         │   │   │
│  └─────────────┘    │  │  4. Direct RDAP        │   │   │
│                      │  │  5. RDAP Proxy         │   │   │
│                      │  │  6. WHOIS (whoiser)    │   │   │
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

### Domain Availability Check (7-source multi-layer strategy)

Each domain is checked using a parallel + fallback strategy across 7 independent sources to maximize registered domain detection:

#### Phase 1 — Parallel (all run simultaneously)

| Source | What it does | Why it helps |
|---|---|---|
| **Native DNS** | NS/A record check via `dns.resolve` (~50ms) | Instant confirmation if domain has DNS records |
| **Google DNS-over-HTTPS** | Queries `dns.google/resolve` for A records | Reliable in serverless (Vercel) where native DNS can be flaky |
| **Cloudflare DNS-over-HTTPS** | Queries `cloudflare-dns.com/dns-query` | Redundant DoH provider for maximum coverage |
| **HTTP Probe** | HEAD request to `https://{domain}` | Detects active web servers — confirms registration + active use |
| **Direct Registry RDAP** | Queries authoritative RDAP server for the TLD | Fastest way to get registrar, dates, nameservers (20+ TLD mappings) |

#### Phase 2 — Sequential Fallbacks (only if RDAP didn't return details)

| Source | What it does | Why it helps |
|---|---|---|
| **RDAP Proxy** | Falls back to `rdap.org` bootstrap proxy | Covers TLDs without direct RDAP mappings |
| **WHOIS (whoiser)** | Pure-JS WHOIS client, queries WHOIS servers directly | Last resort for TLDs where RDAP is unavailable |

#### Deduplication & Merging

- DNS/HTTP sources confirm registration (boolean signal)
- RDAP/WHOIS provide details (registrar, dates, nameservers)
- If DNS confirms registered but RDAP/WHOIS fail, still reported as registered with a note
- `source` field shows which sources contributed (e.g., `rdap+dns+http`)
- Results are cached in a 1000-entry LRU cache to avoid redundant lookups

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
| DNS | Node.js `dns` module | Native NS/A record resolution |
| DNS-over-HTTPS | [Google DoH](https://developers.google.com/speed/public-dns/docs/doh) + [Cloudflare DoH](https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/) | Serverless-safe DNS checks (no API key) |
| HTTP Probe | Node.js `fetch` | Detect active web servers |
| RDAP | [rdap.org](https://about.rdap.org/) + direct registries | Domain registration data (registrar, dates) |
| WHOIS | [whoiser](https://github.com/nicedoc/whoiser) | WHOIS fallback (pure JS, no API key) |
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
