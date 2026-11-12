FROM node:20-alpine AS base
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @mrp/frontend run build

EXPOSE 3000
CMD ["pnpm", "--filter", "@mrp/frontend", "run", "start"]

