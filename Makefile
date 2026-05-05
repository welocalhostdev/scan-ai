# ──────────────────────────────────────────────────────────────────
# ScanAI — Makefile
# ──────────────────────────────────────────────────────────────────

.PHONY: dev dev-build dev-down dev-logs prod prod-build prod-down logs \
        db-shell redis-shell api-shell worker-shell clean help

# ── Development ─────────────────────────────────────────────────

dev: ## Start all services in dev mode (hot-reload)
	docker compose -f docker-compose-dev.yml up

dev-build: ## Build & start dev services (rebuild images)
	docker compose -f docker-compose-dev.yml up --build

dev-down: ## Stop dev services
	docker compose -f docker-compose-dev.yml down

dev-logs: ## Tail dev logs
	docker compose -f docker-compose-dev.yml logs -f

# ── Production ──────────────────────────────────────────────────

prod: ## Start all services in production mode
	docker compose up -d

prod-build: ## Build & start production services
	docker compose up -d --build

prod-down: ## Stop production services
	docker compose down

logs: ## Tail production logs
	docker compose logs -f

# ── Shell Access ────────────────────────────────────────────────

db-shell: ## Open psql shell
	docker compose -f docker-compose-dev.yml exec db psql -U scanai

redis-shell: ## Open redis-cli shell
	docker compose -f docker-compose-dev.yml exec redis redis-cli

api-shell: ## Open bash in the API container
	docker compose -f docker-compose-dev.yml exec api bash

worker-shell: ## Open bash in the worker container
	docker compose -f docker-compose-dev.yml exec worker bash

# ── Setup ───────────────────────────────────────────────────────

setup: ## Initial project setup (copy env, build)
	@test -f .env || cp .env.example .env
	@echo "✓ .env ready — fill in GEMINI_API_KEY"
	docker compose -f docker-compose-dev.yml build

# ── Cleanup ─────────────────────────────────────────────────────

clean: ## Remove all containers, volumes, and build cache
	docker compose -f docker-compose-dev.yml down -v --rmi local
	docker compose down -v --rmi local

# ── Help ────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
