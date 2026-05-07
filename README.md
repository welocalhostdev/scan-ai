# ScanAI — AI-Powered Web Security Scanner

> Find vulnerabilities before hackers do. AI-powered security scanning with plain-English reports.

![Stack](https://img.shields.io/badge/Stack-Next.js_+_FastAPI_+_Celery-blue)
![AI](https://img.shields.io/badge/AI-OpenRouter-purple)
![License](https://img.shields.io/badge/License-MIT-green)

---

## What It Does

User enters a URL → ScanAI runs a 7-step security pipeline → OpenRouter generates a plain-English report with vulnerabilities, severity ratings, and step-by-step fixes.

## Architecture

```
User enters URL
      │
      ▼
Next.js Frontend ─── POST /api/scans
      │
      ▼
FastAPI Backend ──── validates URL (blocks RFC1918, localhost)
      │               creates scan record (PostgreSQL)
      ▼
Celery Task Queue (Redis broker)
      │
      ▼
Worker Container runs pipeline:
  ┌─────────────────────────────────────────┐
  │  1. subfinder → subdomains              │
  │  2. httpx     → live hosts + tech stack │
  │  3. naabu     → open ports              │
  │  4. katana    → crawl endpoints         │
  │  5. nuclei    → vuln scan (JSON output) │
  │  6. testssl   → TLS/SSL issues (JSON)   │
  │  7. OpenRouter → structured report       │
  └─────────────────────────────────────────┘
      │
      ▼
Store report → PostgreSQL
Poll /api/scans/{id} → Frontend shows results
```

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | Next.js 14, Tailwind CSS v4, shadcn/ui |
| **Backend** | Python FastAPI |
| **Queue** | Celery + Redis |
| **Database** | PostgreSQL + SQLAlchemy |
| **Scanners** | subfinder, httpx, naabu, katana, nuclei, testssl.sh |
| **AI** | OpenRouter (model configurable) |
| **Infra** | Docker Compose |

## Quick Start

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Add your OpenRouter API key to .env
#    GEMINI_API_KEY=your-key-here

# 3. Build and start all services with Docker (production)
docker compose build
docker compose up -d
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | **Required.** Your Google Gemini API key | — |
| `OPENROUTER_MODEL` | Model to use on OpenRouter | `openrouter/free` |
| `OPENROUTER_MODEL_FALLBACKS` | Comma-separated fallback models | — |
| `OPENROUTER_BASE_URL` | OpenRouter base URL | `https://openrouter.ai/api/v1` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://scanai:scanai@db:5432/scanai` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379/0` |
| `SECRET_KEY` | Application secret key | `change-me-in-production` |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:3000` |
| `MAX_SCANS_PER_IP` | Max concurrent scans per IP | `1` |
| `SCAN_TIMEOUT_SECONDS` | Hard timeout for entire scan | `480` |
| `TOOL_TIMEOUT_SECONDS` | Timeout per individual tool | `120` |

## API Endpoints

### `POST /api/scans`
Create a new scan.

```bash
curl -X POST http://localhost:8000/api/scans \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Response: `{"scan_id": "uuid-here"}`

### `GET /api/scans/{scan_id}`
Get scan status and results.

Response:
```json
{
  "id": "uuid",
  "url": "https://example.com",
  "status": "complete",
  "progress_step": 7,
  "report": {
    "summary": "...",
    "risk_score": 45,
    "findings": [...]
  }
}
```

### `GET /api/health`
Health check.

## Security Features

- **SSRF Protection**: Blocks RFC1918 IPs, loopback, link-local addresses
- **DNS Rebinding Prevention**: Resolves hostnames and validates IPs
- **Rate Limiting**: 1 active scan per IP (configurable)
- **Hard Timeout**: 8-minute maximum scan duration
- **URL Validation**: Max 2048 chars, http/https only

## Development

### Backend only (without Docker)

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

### Test with curl

```bash
# Create a scan
curl -X POST localhost:8000/api/scans -d '{"url":"https://example.com"}' -H "Content-Type: application/json"

# Check status
curl localhost:8000/api/scans/{scan_id}
```

## V2 Roadmap

- [ ] User accounts + scan history
- [ ] Email report delivery
- [ ] Scheduled recurring scans
- [ ] Slack/webhook notifications
- [ ] CVE lookup via cvemap
- [ ] PDF report export
