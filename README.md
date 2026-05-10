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
Next.js Web App ─── POST /api/scans
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
Poll /api/scans/{id} → Web app shows results
```

## Tech Stack

| Layer | Tech |
|-------|------|
| **Web app** | Next.js 16, Tailwind CSS v4, shadcn/ui |
| **Admin app** | Separate Next.js 16 app in `apps/admin`, sharing the same cookie auth |
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
| `SCHEDULER_TOKEN` | Shared internal token used by the BullMQ scheduler service | `scanai-scheduler-dev` |
| `SMTP_HOST` / `SMTP_PORT` | SMTP server used to email completed PDF reports | — / `587` |
| `SMTP_USER` / `SMTP_PASSWORD` | SMTP credentials for report delivery | — |
| `SMTP_FROM` | Sender displayed on report emails | `SMTP_USER` |
| `EMAIL_RATE_LIMIT_MAX` | Max emails per throttle window | `10` |
| `EMAIL_RATE_LIMIT_DURATION_MS` | Email throttle window in milliseconds | `60000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth web client credentials for one-click sign-in | — |
| `GOOGLE_OAUTH_REDIRECT_URI` | Callback registered in Google Cloud Console | `http://localhost:3000/api/auth/google/callback` |
| `GOOGLE_ALLOWED_DOMAIN` | Optional Google Workspace / Cloud Identity hosted-domain restriction | — |
| `SECRET_KEY` | Application secret key | `change-me-in-production` |
| `AUTH_COOKIE_DOMAIN` | Optional cookie domain for sharing login across web/admin subdomains, e.g. `.welocalhost.com` | — |
| `ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:3000` |
| `MAX_SCANS_PER_IP` | Max concurrent scans per IP | `1` |
| `PAID_BETA_MODE` | Enables paid-beta guardrails in health/readiness metadata | `true` |
| `REQUIRE_TARGET_VERIFICATION` | Require DNS TXT target verification before customer scans | `true` |
| `BETA_MONTHLY_SCAN_LIMIT` | Default monthly scans for new beta users | `25` |
| `BETA_ACTIVE_SCAN_LIMIT` | Default concurrent scans for new beta users | `1` |
| `BETA_SCHEDULE_LIMIT` | Default recurring schedules for new beta users | `3` |
| `SCAN_TIMEOUT_SECONDS` | Hard timeout for entire scan | `480` |
| `TOOL_TIMEOUT_SECONDS` | Timeout per individual tool | `120` |
| `TLS_DEEP_SCAN_ENABLED` | Enable focused `testssl.sh` deep TLS pass in addition to fast `tlsx` inventory | `true` |
| `TLS_DEEP_SCAN_TIMEOUT_SECONDS` | Timeout for focused `testssl.sh` pass | `45` |

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

### Web app only

```bash
npm install
npm run dev -- --filter=@scanai/web
```

### Admin app only

```bash
npm install
npm run dev -- --filter=@scanai/admin
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
