# Primis Moltbot Container
# Based on official Moltbot Dockerfile with Primis optimizations
# 
# This Dockerfile is used for Railway deployments

FROM node:22-bookworm

# Install Bun (required for Moltbot build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# Clone Moltbot from official repo
# This ensures we always get the latest version
RUN git clone --depth 1 https://github.com/moltbot/moltbot.git . && \
    rm -rf .git

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the application
RUN CLAWDBOT_A2UI_SKIP_MISSING=1 pnpm build
ENV CLAWDBOT_PREFER_PNPM=1
RUN pnpm ui:install
RUN pnpm ui:build

# Production settings
ENV NODE_ENV=production

# Create data directory for persistent storage
RUN mkdir -p /data && chown node:node /data

# Security: Run as non-root user
USER node

# Expose gateway port
EXPOSE 3000

# Default command (can be overridden)
CMD ["node", "dist/index.js", "gateway", "--allow-unconfigured", "--port", "3000", "--bind", "lan"]
