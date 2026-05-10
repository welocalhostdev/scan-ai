# ──────────────────────────────────────────────────────────────────
# ScanAI — Admin Dockerfile (multi-stage for production)
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
ARG NEXT_PUBLIC_WEB_APP_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WEB_APP_URL=$NEXT_PUBLIC_WEB_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npx turbo run build --filter=@scanai/admin

# ── Production stage ──
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/admin/public ./apps/admin/public

RUN mkdir -p apps/admin/.next
RUN chown -R nextjs:nodejs apps/admin/.next

COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/admin/server.js"]
