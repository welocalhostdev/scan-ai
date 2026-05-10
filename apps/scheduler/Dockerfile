FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/scheduler/package.json ./apps/scheduler/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm ci

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY apps/scheduler ./apps/scheduler

CMD ["npm", "run", "start", "--workspace=@scanai/scheduler"]
