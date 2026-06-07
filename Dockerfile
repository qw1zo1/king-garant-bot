FROM node:24-slim AS base

RUN npm install -g pnpm@10

WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json ./lib/db/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile

# Copy full source
COPY . .

# Build libs first (api-zod, api-spec), then api-server
RUN pnpm run typecheck:libs || true
RUN pnpm --filter @workspace/api-server run build

# ── Runtime stage ──
FROM node:24-slim AS runner

RUN npm install -g pnpm@10

WORKDIR /app

# Copy workspace config and all node_modules
COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/node_modules ./node_modules

# Copy built output
COPY --from=base /app/artifacts/api-server/dist ./artifacts/api-server/dist

# Copy image assets (needed by the bot at runtime)
COPY --from=base /app/artifacts/api-server/src/assets ./artifacts/api-server/src/assets

# Copy grammy (externalized from bundle, loaded at runtime)
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
