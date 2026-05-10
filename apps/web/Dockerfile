# ──────────────────────────────────────────────────────────────────
# ScanAI — Web Dockerfile (multi-stage for production)
# ──────────────────────────────────────────────────────────────────

FROM node:20-alpine AS base

# ── Dependencies stage ──
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* turbo.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN npm ci

# ── Build stage ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_ADMIN_APP_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_APP_URL=$NEXT_PUBLIC_ADMIN_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx turbo run build --filter=@scanai/web

# ── Production stage ──
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/web/public ./apps/web/public

RUN mkdir -p apps/web/.next
RUN chown -R nextjs:nodejs apps/web/.next

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
