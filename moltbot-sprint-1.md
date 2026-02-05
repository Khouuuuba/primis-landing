# Moltbot Integration: Sprint 1 Breakdown

> **Goal**: Validate technical feasibility of 1-click Moltbot deployment through Primis
> **Timeline**: 2-3 days
> **Success Criteria**: Working Moltbot instance in a container, accessible via chat app

---

## Sprint 1.1: Analyze Moltbot Architecture
**Duration**: 2 hours
**Status**: ✅ COMPLETE

### Objective
Understand Moltbot's technical requirements by analyzing the codebase and documentation.

### Tasks
- [x] Clone `github.com/moltbot/moltbot` repository
- [x] Analyze `package.json` for dependencies
- [x] Document all required environment variables
- [x] Identify external service dependencies

---

## 📊 SPRINT 1.1 FINDINGS

### System Requirements

| Requirement | Value | Notes |
|-------------|-------|-------|
| **Node.js** | ≥22.12.0 | ⚠️ Not 20! Needs latest LTS |
| **Package Manager** | pnpm 10.23.0 | Not npm! |
| **Build Tool** | Bun | Required for build scripts |
| **RAM** | 2048MB | From fly.toml recommendation |
| **CPU** | shared-cpu-2x | Fly.io default |
| **Storage** | Persistent volume | For config + workspace |

### Key Dependencies (50+ total)

| Category | Package | Purpose |
|----------|---------|---------|
| **WhatsApp** | @whiskeysockets/baileys 7.0.0 | WhatsApp Web API |
| **Telegram** | grammy 1.39.3 | Telegram Bot API |
| **Discord** | @buape/carbon 0.14.0 | Discord integration |
| **Slack** | @slack/bolt 4.6.0 | Slack Bot |
| **Line** | @line/bot-sdk 10.6.0 | Line messaging |
| **Browser** | playwright-core 1.58.0 | Web automation |
| **Database** | sqlite-vec 0.1.7 | Vector memory storage |
| **AI Agent** | @mariozechner/pi-agent-core 0.49.3 | Core agent logic |
| **TTS** | node-edge-tts 1.2.9 | Text-to-speech |
| **PDF** | pdfjs-dist 5.4.530 | Document reading |
| **Image** | sharp 0.34.5 | Image processing |
| **Optional** | node-llama-cpp 3.15.0 | Local LLM support |

### Environment Variables (from docker-compose.yml)

| Variable | Required | Who Provides | Description |
|----------|----------|--------------|-------------|
| `CLAWDBOT_GATEWAY_TOKEN` | Yes | Auto-generated | Internal auth token |
| `CLAUDE_AI_SESSION_KEY` | Optional | User | Claude API access |
| `CLAUDE_WEB_SESSION_KEY` | Optional | User | Claude web session |
| `ANTHROPIC_API_KEY` | Optional | User | Anthropic API key |
| `OPENAI_API_KEY` | Optional | User | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | Optional | User | Telegram bot token |
| `DISCORD_BOT_TOKEN` | Optional | User | Discord bot token |

### 🎉 GREAT NEWS: Docker Already Supported!

Moltbot has **official Docker support**:

```dockerfile
# Official Dockerfile
FROM node:22-bookworm
# Installs Bun, pnpm, builds everything
# Runs as non-root user (security hardened)
CMD ["node", "dist/index.js"]
```

**docker-compose.yml** exposes:
- Port 18789: Gateway API
- Port 18790: Bridge API
- Volume mounts for config + workspace

**fly.toml** shows production deployment:
- 2GB RAM
- shared-cpu-2x
- Persistent volume at `/data`
- Auto HTTPS

### Implications for Primis

| Finding | Impact |
|---------|--------|
| Docker ready | ✅ No Dockerfile work needed |
| Fly.io config | ✅ Can use same specs for RunPod |
| Node 22 required | ⚠️ Need Node 22 base image |
| pnpm required | ⚠️ Can't use npm install |
| 2GB RAM | 💰 Higher container cost (~$15-20/mo) |

---

## Sprint 1.3: Local Installation Test
**Duration**: 1 hour
**Status**: ⚠️ BLOCKED (Node 22 required)

### Attempted Steps
1. ✅ Ran `npm install -g clawdbot`
2. ❌ Failed: Node 18.20.4 installed, but **Node 22.12.0+ required**
3. ✅ Installed Node 22.22.0 via nvm
4. ❌ npm global prefix config conflict preventing Node 22 activation

### Key Finding: Installation Requires Node 22+

```
npm error ❌ This package requires Node.js 20+ to run reliably.
npm error    You are using Node.js 18.20.4.
npm error    Please upgrade to Node.js 20+ to proceed.
```

**This confirms a major user friction point!**

Most developers run Node 18 LTS. Requiring Node 22 is a significant barrier.

### Validation: Docker is the Path Forward

Since:
1. Local npm install requires Node 22 (unusual)
2. Moltbot already has official Docker support
3. Primis deployment will be containerized anyway

**Recommendation**: Skip local testing. Test with Docker/RunPod directly.

### Updated Primis Value Proposition

```
┌─────────────────────────────────────────────────────────────┐
│  WITHOUT PRIMIS                                             │
│  ─────────────────                                          │
│  1. Upgrade to Node 22 (many devs stuck on 18/20)          │
│  2. Fix nvm/npm conflicts                                   │
│  3. Install globally                                        │
│  4. Configure env vars                                      │
│  5. Set up process manager                                  │
│  6. Configure webhooks, SSL                                 │
│  7. Debug at 3am                                            │
│                                                             │
│  WITH PRIMIS ($30/mo)                                       │
│  ───────────────────                                        │
│  1. Paste API key                                           │
│  2. Click Deploy                                            │
│  3. Done                                                    │
└─────────────────────────────────────────────────────────────┘
```

The Node 22 requirement **strengthens** our value proposition!

---

## Sprint 1.4: Chat Integration Requirements
**Duration**: 1 hour
**Status**: ✅ COMPLETE

### Supported Channels (from docs/channels/)

| Channel | Complexity | User Provides | Automatable |
|---------|------------|---------------|-------------|
| **Telegram** | 🟢 Easy | Bot token from @BotFather | ✅ Yes |
| **Discord** | 🟡 Medium | Bot token + enable intents | ⚠️ Partial |
| **WhatsApp** | 🔴 Hard | QR code scan (phone needed) | ❌ No |
| **Slack** | 🟡 Medium | OAuth app setup | ⚠️ Partial |
| **Signal** | 🔴 Hard | Phone number + captcha | ❌ No |
| **iMessage** | 🔴 Hard | macOS only + Apple ID | ❌ No |
| **Line** | 🟡 Medium | Channel access token | ⚠️ Partial |
| **MS Teams** | 🔴 Hard | Azure AD app registration | ❌ No |

### MVP Recommendation: Telegram + Discord First

**Telegram (Easiest)**
```
User steps:
1. Open Telegram → @BotFather
2. /newbot → get token
3. Paste token in Primis → Deploy

Config needed:
- TELEGRAM_BOT_TOKEN: "123:abc"
```

**Discord (Medium)**
```
User steps:
1. Discord Developer Portal → Create App
2. Bot → Add Bot → Copy token
3. Enable Message Content Intent
4. Generate invite URL with bot + commands scopes
5. Invite to server
6. Paste token in Primis → Deploy

Config needed:
- DISCORD_BOT_TOKEN: "xyz"
```

### Primis Deploy Form (MVP)

```
┌─────────────────────────────────────────────────────────────┐
│  DEPLOY MOLTBOT                                    $30/mo   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. AI Provider (required)                                  │
│     ○ Claude (Anthropic)                                    │
│       API Key: [sk-ant-•••••••••••••••••] ✓                │
│     ○ GPT (OpenAI)                                          │
│       API Key: [sk-•••••••••••••••••••••]                  │
│                                                             │
│  2. Chat Channel (choose one or more)                       │
│                                                             │
│     □ Telegram                                              │
│       Bot Token: [123456:ABC-DEF•••••••••] ✓               │
│       [How to get token →]                                  │
│                                                             │
│     □ Discord                                               │
│       Bot Token: [•••••••••••••••••••••••]                 │
│       [Setup guide →]                                       │
│                                                             │
│     □ WhatsApp (coming soon)                                │
│     □ Slack (coming soon)                                   │
│                                                             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  [🚀 Deploy Moltbot]                                        │
│                                                             │
│  ✓ 24/7 uptime  ✓ Auto-updates  ✓ No Node.js needed        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Environment Variables Summary

| Variable | Required | Source |
|----------|----------|--------|
| `ANTHROPIC_API_KEY` | If Claude | User |
| `OPENAI_API_KEY` | If GPT | User |
| `TELEGRAM_BOT_TOKEN` | If Telegram | User |
| `DISCORD_BOT_TOKEN` | If Discord | User |
| `CLAWDBOT_STATE_DIR` | Yes | Primis (auto) |
| `NODE_OPTIONS` | Yes | Primis (auto) |
| `NODE_ENV` | Yes | Primis (auto: "production") |

---

## Sprint 1.2: Document Environment Variables
**Duration**: 1 hour
**Status**: ⬜ Pending

### Objective
Create a complete map of all configuration options for Moltbot deployment.

### Tasks
- [ ] Extract env vars from codebase (`grep -r "process.env"`)
- [ ] Categorize: Required vs Optional
- [ ] Identify which are user-provided (API keys) vs system-managed
- [ ] Document default values and validation rules

### Deliverables

**Expected Env Var Categories:**

| Category | Examples | Who Provides |
|----------|----------|--------------|
| **LLM Keys** | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | User |
| **Chat Integrations** | `TELEGRAM_BOT_TOKEN`, `DISCORD_TOKEN` | User (via OAuth) |
| **System Config** | `PORT`, `DATA_DIR`, `LOG_LEVEL` | Primis (auto) |
| **Webhooks** | `WEBHOOK_URL`, `WEBHOOK_SECRET` | Primis (auto) |

### Success Metrics

| Metric | Target |
|--------|--------|
| Env vars discovered | All |
| User-provided vars identified | Separate list |
| Auto-configurable vars identified | Separate list |

---

## Sprint 1.3: Local Installation Test
**Duration**: 1-2 hours
**Status**: ⬜ Pending

### Objective
Successfully run Moltbot locally to understand the full setup flow.

### Tasks
- [ ] Install Moltbot via npm (`npm i -g clawdbot`)
- [ ] Run onboarding (`clawdbot onboard`)
- [ ] Document each onboarding step
- [ ] Test basic functionality (send message, get response)
- [ ] Measure resource usage (RAM, CPU, disk)

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Installation log | Full terminal output |
| Onboarding steps | Numbered list with screenshots |
| Resource profile | RAM/CPU/Disk measurements |
| First message test | Proof of working bot |

### Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Installation success | ✓ | — |
| Onboarding completion | ✓ | — |
| First response time | < 5s | — |
| RAM usage (idle) | < 500MB | — |
| Disk usage | < 1GB | — |

### Commands to Run
```bash
# Install globally
npm i -g clawdbot

# Run onboarding
clawdbot onboard

# Check resource usage (macOS)
ps aux | grep -i moltbot
top -pid $(pgrep -f moltbot)

# Check disk usage
du -sh ~/.moltbot 2>/dev/null || du -sh ~/.clawdbot
```

---

## Sprint 1.4: Map Chat Integration Requirements
**Duration**: 1-2 hours
**Status**: ⬜ Pending

### Objective
Understand what's needed to connect Moltbot to each supported chat platform.

### Chat Platforms to Analyze

| Platform | Priority | Complexity |
|----------|----------|------------|
| Telegram | P0 | Low (bot token only) |
| Discord | P0 | Medium (OAuth, bot setup) |
| WhatsApp | P1 | High (Business API or webhooks) |
| Slack | P1 | Medium (OAuth, app setup) |
| Signal | P2 | High (phone number, unofficial API) |
| iMessage | P2 | Very High (macOS only, Apple restrictions) |

### Tasks
- [ ] Document Telegram setup flow
- [ ] Document Discord setup flow  
- [ ] Identify webhook requirements for each
- [ ] List OAuth scopes needed
- [ ] Determine which can be fully automated

### Deliverables

**Per Platform:**
```markdown
## [Platform Name]

### User Provides
- Token/Key: [what exactly]
- Permissions: [what scopes]

### Primis Auto-Configures
- Webhook URL: [how generated]
- SSL: [how handled]

### Setup Steps (for user)
1. Step 1
2. Step 2
...

### Automation Potential
- [ ] Fully automatable
- [ ] Partially automatable (user does X)
- [ ] Manual only
```

### Success Metrics

| Metric | Target |
|--------|--------|
| Platforms documented | All 6 |
| Automation potential assessed | All 6 |
| Webhook requirements mapped | All 6 |

---

## Sprint 1.5: Container Proof of Concept
**Duration**: 2-3 hours
**Status**: ⬜ Pending

### Objective
Create a working Docker container that runs Moltbot headlessly.

### Tasks
- [ ] Create `Dockerfile` for Moltbot
- [ ] Configure for headless operation
- [ ] Test with mock API key
- [ ] Measure container size and startup time
- [ ] Test on RunPod (if time permits)

### Dockerfile Template
```dockerfile
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Moltbot
RUN npm i -g clawdbot

# Create data directory
RUN mkdir -p /data
ENV MOLTBOT_DATA_DIR=/data

# Expose webhook port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start Moltbot in headless mode
CMD ["clawdbot", "start", "--headless"]
```

### Deliverables

| Deliverable | Description |
|-------------|-------------|
| Dockerfile | Working, tested |
| docker-compose.yml | For local testing |
| Container metrics | Size, startup time, resource usage |
| RunPod test | (Optional) Deployed instance |

### Success Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Docker build success | ✓ | — |
| Container size | < 500MB | — |
| Startup time | < 30s | — |
| Health check passing | ✓ | — |
| Memory usage (running) | < 512MB | — |

### Commands to Run
```bash
# Build container
docker build -t primis-moltbot:test .

# Run container
docker run -d \
  --name moltbot-test \
  -p 3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-test \
  -v moltbot-data:/data \
  primis-moltbot:test

# Check logs
docker logs -f moltbot-test

# Check resource usage
docker stats moltbot-test

# Measure container size
docker images primis-moltbot:test --format "{{.Size}}"
```

---

## Sprint 1 Summary

### Timeline

| Sprint | Duration | Dependencies |
|--------|----------|--------------|
| 1.1 Analyze Architecture | 2h | None |
| 1.2 Document Env Vars | 1h | 1.1 |
| 1.3 Local Installation | 2h | 1.1 |
| 1.4 Chat Integrations | 2h | 1.3 |
| 1.5 Container PoC | 3h | 1.2, 1.3 |
| **Total** | **~10h** | |

### Critical Questions to Answer

| Question | Sprint | Answer |
|----------|--------|--------|
| What are the minimum system requirements? | 1.1 | — |
| Which env vars must user provide? | 1.2 | — |
| How much RAM does idle bot use? | 1.3 | — |
| Can Telegram be fully automated? | 1.4 | — |
| What's the container startup time? | 1.5 | — |

### Go/No-Go Criteria

**GO if:**
- [ ] Container runs successfully
- [ ] Resource usage < 512MB RAM
- [ ] At least 1 chat platform is automatable
- [ ] User only needs to provide API key + chat token

**NO-GO if:**
- Container requires > 2GB RAM
- No chat platforms can be automated
- Moltbot requires interactive onboarding (can't be headless)
- Licensing prevents hosted deployment

---

## Next Steps After Sprint 1

If **GO**:
→ Sprint 2: Build deployment API in Primis backend
→ Sprint 3: Build deploy UI in ai-builder-demo

If **NO-GO**:
→ Evaluate alternative AI agents (Open Interpreter, AutoGPT, etc.)
→ Document blockers for Moltbot team feedback

---

*Created: January 27, 2026*
