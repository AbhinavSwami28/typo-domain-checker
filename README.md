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
│  │  25 typo     │    │  │  2. DNS (native+DoH)  │   │   │
│  │  techniques  │    │  │  3. HTTP Probe         │   │   │
│  └─────────────┘    │  │  4. Direct RDAP        │   │   │
│                      │  │  5. RDAP Proxy         │   │   │
│                      │  │  6. WHOIS (whoiser)    │   │   │
│                      │  └──────────────────────┘   │   │
│                      └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Features

### Typo Generation (25 techniques)

Techniques derived from industry tools like [dnstwist](https://github.com/elceef/dnstwist) and URLCrazy:

| # | Technique | Example (for `my-example.com`) |
|---|---|---|
| 1 | Character Omission | `my-exmple.com` |
| 2 | Transposition | `my-exapmle.com` |
| 3 | Adjacent Key (QWERTY) | `my-exanple.com` |
| 4 | Character Duplication | `my-exxample.com` |
| 5 | Character Insertion | `my-exaample.com` |
| 6 | Homoglyph Substitution | `my-examp1e.com` |
| 7 | TLD Swap | `my-example.net`, `my-example.io` |
| 8 | Dot Insertion | `my-ex.ample.com` |
| 9 | Hyphen Insertion | `my-ex-ample.com` |
| 10 | Vowel Swap | `my-axample.com` |
| 11 | Bitsquatting | `my-gxample.com` (single-bit flip) |
| 12 | Word Swap | `example-my.com` |
| 13 | Word Omission | `my.com`, `example.com` |
| 14 | Hyphen Omission | `myexample.com` |
| 15 | WWW Prefix | `wwwmy-example.com` |
| 16 | Prefix Addition | `login-my-example.com`, `secure-my-example.com` |
| 17 | Suffix Addition | `my-example-online.com`, `my-example-login.com` |
| 18 | ccTLD Variants | `my-example.co.uk`, `my-example.com.au` |
| 19 | Singular/Plural | `my-examples.com` |
| 20 | Numeric Addition | `my-example1.com`, `my-example-365.com` |
| 21 | Adjacent Key (QWERTZ) | German keyboard layout variants |
| 22 | Adjacent Key (AZERTY) | French keyboard layout variants |
| 23 | Cyrillic IDN Homograph | `my-ехаmрlе.com` (Cyrillic lookalikes) |
| 24 | Homophones | `mail-sale.com` → `male-sale.com` |
| 25 | Common Misspellings | `accommodasion.com` (tion→sion) |

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

### Risk Scoring

Each typo domain is assigned a threat risk score (0-100) calculated from four factors:

| Factor | Effect on Score |
|---|---|
| **Edit distance** (Levenshtein) | Base score: `100 - (distance * 25)`. Closer = higher risk. |
| **TLD match** | -20 points if the TLD differs from the original |
| **Typo type** | +15 for Homoglyphs (visually deceptive), +10 for Transpositions (common typo) |
| **Registration status** | +20 if the domain is actually registered |

Risk levels:

| Score | Label | Meaning |
|---|---|---|
| 80-100 | **Critical** | Very close lookalike, likely registered maliciously |
| 60-79 | **High** | Convincing typosquat, worth investigating |
| 40-59 | **Medium** | Moderate risk, less likely to fool users |
| 0-39 | **Low** | Distant variant, low deception potential |

### Frontend Features
- **Risk scoring** — each typo scored and color-coded by threat level (see above)
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
      "source": "rdap+dns+http"
    }
  ]
}
```

#### Response fields

| Field | Type | Description |
|---|---|---|
| `domain` | string | The domain that was checked |
| `registered` | `true` / `false` / `null` | Registration status (`null` = all sources failed) |
| `registrar` | string or null | Registrar name (from RDAP or WHOIS) |
| `created` | ISO 8601 or null | Registration date |
| `expires` | ISO 8601 or null | Expiration date |
| `nameservers` | string[] | Up to 4 nameservers |
| `source` | string | Which sources confirmed the result (see below) |
| `cached` | boolean | `true` if served from LRU cache |
| `note` | string or null | Human-readable explanation for edge cases |

#### `source` field values

The `source` field is a `+`-delimited string showing which lookup sources contributed to the result:

| Value | Meaning |
|---|---|
| `rdap` | Direct registry RDAP returned the result |
| `rdap-proxy` | RDAP via `rdap.org` proxy |
| `whois` | WHOIS via `whoiser` |
| `dns` | Confirmed via DNS resolution (native or DoH) |
| `http` | Confirmed via HTTP HEAD probe (web server responded) |
| `none` | All sources failed |

Combined examples: `rdap+dns+http` (all three confirmed), `dns` (only DNS confirmed, RDAP/WHOIS unavailable), `whois+dns` (WHOIS provided details, DNS confirmed).

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

## Performance

Benchmarks for `netflix.com` (409 generated variants, 294 registered):

| Metric | Value |
|---|---|
| Typo generation (25 techniques) | ~1.4ms |
| Full batch check (409 domains, 7 sources) | ~112s |
| Average per-domain check | ~274ms (with parallelism) |
| Cache hit | <1ms |
| Unknown/failed lookups | 0 out of 409 |
| Batch throughput | ~60 domains checked concurrently (4 batches x 10 workers) |

Frontend batching: 16 domains per batch, 4 batches in-flight concurrently. Backend runs 10 concurrent lookups per batch. Effectively checks ~60 domains at once.

## Limitations & Known Caveats

### Upstream rate limits
- **rdap.org proxy** — no published rate limit, but aggressive querying may trigger temporary blocks. Direct registry RDAP servers (Verisign, etc.) are preferred when available.
- **Google DoH / Cloudflare DoH** — generous public limits, but may throttle under sustained high-volume use.
- **WHOIS servers** — many registrars limit to ~30-50 queries/minute per IP. The `whoiser` library handles this internally with timeouts, but bursts can fail.

### Data accuracy
- **WHOIS under GDPR** — European registrars redact registrant details (name, email, org) under GDPR. Registrar name, dates, and nameservers are still available.
- **RDAP coverage** — not all TLDs support RDAP yet. The tool falls back to WHOIS, but some obscure ccTLDs may return no data.
- **DNS-only results** — when RDAP and WHOIS both fail, DNS can confirm a domain is registered but cannot provide registrar details. These appear as "Registered (confirmed via dns, details unavailable)".

### Serverless (Vercel) caveats
- **Cold starts** — first request after inactivity may take 1-3s as the serverless function initializes.
- **Cache is per-invocation** — the LRU cache lives in-memory per function instance. On Vercel, each function invocation may get a fresh instance, so cache hits mainly help within a single batch scan, not across separate user sessions.
- **Function timeout** — Vercel Hobby plan has a 10s function timeout. Large batches are capped at 20 domains per request to stay within limits.

### Generation limits
- **IDN/Cyrillic domains** — generated but may not be registerable on all TLDs. Some registries reject mixed-script domains.
- **Homophones & misspellings** — only trigger for domains containing common English words. Proper nouns (company names) won't match the built-in dictionaries.

## Contributing

Contributions are welcome. To get started:

```bash
# Fork and clone the repo
git clone https://github.com/<your-username>/typo-domain-checker.git
cd typo-domain-checker

# Install dependencies
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..

# Start dev environment
npm run dev
```

### Areas where contributions would help
- **Expanded RDAP direct server mappings** — add more TLDs to `DIRECT_RDAP` in `lib/domainChecker.js`
- **Homophone/misspelling dictionaries** — expand the built-in word lists in `lib/domainGenerator.js`
- **Additional keyboard layouts** — Dvorak, Colemak, or regional layouts
- **Test suite** — unit tests for generation and checking logic
- **Internationalized domain support** — better handling of IDN/punycode edge cases

### Reporting issues
Open an issue at [github.com/AbhinavSwami28/typo-domain-checker/issues](https://github.com/AbhinavSwami28/typo-domain-checker/issues) with:
- The domain you tested
- Expected vs actual behavior
- Browser/OS if it's a frontend issue

## License

MIT
