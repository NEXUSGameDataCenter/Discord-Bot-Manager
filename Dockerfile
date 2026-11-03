# One image definition, two targets: `web` and `bot`.
FROM node:22-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm --filter @nexus/db generate

FROM base AS bot
ENV NODE_ENV=production
# Apply DB schema, then start the long-lived gateway worker (never serverless).
CMD ["sh", "-c", "pnpm db:deploy && pnpm --filter @nexus/bot start"]

FROM base AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @nexus/web build
EXPOSE 3000
CMD ["pnpm", "--filter", "@nexus/web", "start"]
