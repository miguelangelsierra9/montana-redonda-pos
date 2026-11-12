FROM node:20-alpine AS base
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @mrp/backend run build

EXPOSE 4000
CMD ["pnpm", "--filter", "@mrp/backend", "run", "start"]

