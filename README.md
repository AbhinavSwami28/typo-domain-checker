# Typo Domain Checker

A tool that generates lookalike typo domains for a given domain and checks their registration status in real time.

## Open Source Technologies Used

### Frontend
- **[React](https://react.dev/)** — UI library for building the interactive interface
- **[Vite](https://vitejs.dev/)** — Fast build tool and dev server with hot module replacement

### Backend
- **[Express](https://expressjs.com/)** — Minimal Node.js web framework for the API server
- **[cors](https://github.com/expressjs/cors)** — Express middleware for handling Cross-Origin Resource Sharing

### Domain Availability Check
- **[RDAP (Registration Data Access Protocol)](https://about.rdap.org/)** — The open, standardized successor to WHOIS. We query the public RDAP bootstrap service at `rdap.org` to check domain registration status, registrar info, creation/expiration dates, and nameservers. No API key required.

### Dev Tooling
- **[concurrently](https://github.com/open-cli-tools/concurrently)** — Runs the backend and frontend dev servers in parallel with a single command

## Typo Generation

Domain permutations are generated entirely in-house (no external API) using 10 techniques commonly used in typosquatting detection:

1. Character Omission
2. Transposition
3. Adjacent Key Replacement (QWERTY layout)
4. Character Duplication
5. Character Insertion
6. Homoglyph Substitution
7. TLD Swap
8. Dot Insertion
9. Hyphen Insertion
10. Vowel Swap

## Getting Started

```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..
npm run dev
```

Frontend runs at `http://localhost:5173`, backend at `http://localhost:3001`.
