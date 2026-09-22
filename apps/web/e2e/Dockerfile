# apps/web/e2e/Dockerfile
# Playwright E2E runner: browsers + system deps preinstalled.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /repo

# Install pnpm + deps first (better layer caching).
RUN npm install -g pnpm@9.0.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# Copy the project in.
COPY . .

# Browsers are in the base image; ensure the matching driver version.
RUN npx playwright install --with-deps chromium

WORKDIR /repo/apps/web
CMD ["npx", "playwright", "test"]
