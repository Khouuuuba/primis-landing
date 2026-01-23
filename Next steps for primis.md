# Next Steps for Primis

A roadmap from demo to production-ready v1.

---

## 🎉 MVP Status: COMPLETE

All core MVP features are working end-to-end:

| Feature | Status | Details |
|---------|--------|---------|
| Authentication | ✅ Live | Privy (email, Google, Solana wallets) |
| Capital Provider Staking | ✅ Live | Real SOL staking on Solana devnet |
| Staking Contract | ✅ Deployed | `Bp4pmvckwNicvQrxafeCgrM35WnTE1qz2MbvGWA4GhDf` |
| Yield Economics | ✅ On-chain | 70% stakers / 20% subsidy / 10% reserve |
| Credit Purchases | ✅ Live | Stripe checkout ($25, $95, $450 packages) |
| GPU Job Submission | ✅ Live | Real RunPod GPU provisioning |
| Batch Image Generation | ✅ Live | SDXL via RunPod Serverless |
| Backend API | ✅ Live | Express.js + PostgreSQL |

---

## 📋 What Was Built (Complete Feature List)

### Landing Page & Marketing
- [x] Brand identity & messaging
- [x] Email capture (Formspree integration)
- [x] Responsive design
- [x] Deployed on Vercel (primisprotocol.ai)
- [x] 11-slide HTML pitch deck
- [x] Mobile responsive presentation

### Capital Provider Demo (`capital-provider-demo/`)
- [x] Real authentication via Privy (email, Google, wallet)
- [x] Solana wallet connection (Phantom, Solflare)
- [x] **Real SOL staking on devnet** (10 SOL minimum)
- [x] **Real SOL withdrawal from contract**
- [x] Portfolio dashboard with total earnings
- [x] Yield breakdown (base staking + compute income)
- [x] APY comparison (Primis vs regular staking)
- [x] Allocation visualization (pie chart)
- [x] Earnings history (sparkline)
- [x] Activity feed
- [x] Deposit/Withdraw modals with devnet badge
- [x] Toast notifications
- [x] Institutional dark theme

### AI Builder Demo (`ai-builder-demo/`)
- [x] Real authentication via Privy
- [x] GPU instance marketplace (real RunPod inventory)
- [x] Real pricing with Primis discount display
- [x] Job configurator (workload type, GPU count, duration)
- [x] **Real GPU pod provisioning via RunPod**
- [x] Job queue with live progress
- [x] Job termination with refund
- [x] Credits/billing system (Stripe)
- [x] Usage page with transaction history
- [x] **Batch Image Generation** (NEW)
  - SDXL model via RunPod Serverless
  - Multi-prompt submission
  - Real-time progress tracking
  - Image gallery with lightbox
  - Download all functionality
  - Retry for failed jobs
- [x] Institutional dark theme

### Backend API (`backend/`)
- [x] Express.js REST API (port 3001)
- [x] PostgreSQL database (Supabase)
- [x] Privy authentication middleware
- [x] User management API
- [x] Staking API
- [x] Jobs API with RunPod integration
- [x] Payments API with Stripe
- [x] **Batch Processing API** (NEW)
  - `GET /api/batch/templates` — Available models
  - `POST /api/batch/estimate` — Cost estimation
  - `POST /api/batch/jobs` — Submit batch job
  - `GET /api/batch/jobs` — List user's jobs
  - `GET /api/batch/jobs/:id` — Job details + results
  - `POST /api/batch/jobs/:id/process` — Start processing
  - `POST /api/batch/jobs/:id/retry` — Retry failed job

### Solana Smart Contract (`primis-staking/`)
- [x] Anchor vault program
- [x] PDAs for vault state and user stake accounts
- [x] Deposit/withdraw with 10 SOL minimum
- [x] Yield distribution (70/20/10 split)
- [x] Admin pause/unpause
- [x] 15 passing tests
- [x] **Deployed to devnet**

---

## 🚀 V1 Roadmap

V1 transforms the MVP into a production-ready platform. Each sprint has clear deliverables and success metrics.

### V1 Overview

| Sprint | Focus | Duration | Key Deliverable |
|--------|-------|----------|-----------------|
| 1 | Production Infrastructure | 1 week | Mainnet-ready deployment |
| 2 | Automated Yield System ✅ | 1-2 weeks | Hands-off yield distribution |
| 3 | **GPU Instance Workflow** | 2-3 weeks | Full training/inference pipeline |
| 4 | LST Support | 2 weeks | mSOL + jitoSOL staking |
| 5 | Multi-Provider GPU | 1-2 weeks | Lambda Labs + fallback |
| 6 | API Keys & SDK | 1 week | Programmatic access |
| 7 | Billing & Invoicing | 1 week | Full financial system |
| 8 | Security & Audit | 2-3 weeks | Audit-ready code |
| 9 | Mainnet Launch | 1 week | Production go-live |

**Total estimated time:** 12-17 weeks

---

## Sprint 1: Production Infrastructure
**Duration:** 1 week  
**Goal:** Move from devnet/localhost to production-ready infrastructure

### Tasks

#### 1.1 Environment Setup
- [ ] Create production PostgreSQL database (Supabase Pro or Railway)
- [ ] Set up production environment variables
- [ ] Configure CORS for production domains
- [ ] Set up SSL certificates

**Success metric:** Backend responds at `api.primisprotocol.ai`

#### 1.2 Backend Deployment
- [ ] Deploy backend to Railway or Render
- [ ] Set up auto-restart on crash
- [ ] Configure health check monitoring
- [ ] Set up log aggregation (Papertrail or Logtail)

**Success metric:** 99.9% uptime over 7 days

#### 1.3 Frontend Deployment
- [ ] Deploy Capital Provider demo to Vercel
- [ ] Deploy AI Builder demo to Vercel
- [ ] Configure custom domains
- [ ] Set up preview deployments for PRs

**Success metric:** Both apps accessible at custom domains

#### 1.4 Solana Mainnet Prep
- [ ] Audit contract code review
- [ ] Test on mainnet-beta with small amounts
- [ ] Set up mainnet RPC endpoint (Helius or Quicknode)
- [ ] Configure program authority multisig

**Success metric:** Contract deployed to mainnet (paused)

### Deliverables
- Production backend at `api.primisprotocol.ai`
- Production frontends at `app.primisprotocol.ai` and `build.primisprotocol.ai`
- Monitoring dashboard with uptime alerts
- Mainnet contract (paused, ready for launch)

---

## Sprint 2: Automated Yield System ✅ IMPLEMENTED
**Duration:** 1-2 weeks  
**Goal:** Remove manual yield distribution, make it trustless and automatic
**Status:** Core implementation complete, ready for devnet testing

### What Was Built

#### 2.1 Database Schema (`backend/src/db/yield-schema.sql`)
- [x] `yield_distributions` table - tracks each yield distribution event
- [x] `yield_claims` table - records user claim transactions  
- [x] `yield_snapshots` table - daily state for analytics
- [x] User columns for estimated claimable yield

**Run in Supabase SQL Editor to activate**

#### 2.2 Backend API (`backend/src/routes/yield.js`)
- [x] `GET /api/yield/stats` - overall yield statistics
- [x] `GET /api/yield/distributions` - distribution history
- [x] `GET /api/yield/claimable/:wallet` - user's claimable amount
- [x] `POST /api/yield/claim` - record a claim (after on-chain tx)
- [x] `GET /api/yield/claims/:wallet` - user's claim history

#### 2.3 Distribution Service (`backend/scripts/distribute-yield.js`)
- [x] Calculates daily yield based on 12% APY (7% base + 5% compute)
- [x] Supports `--dry-run` mode for testing
- [x] Funds vault with yield (devnet simulation)
- [x] Calls on-chain `distribute_yield()` instruction
- [x] Records distribution in database
- [x] Takes daily snapshots for analytics

**Usage:**
```bash
# Preview distribution (no transactions)
node backend/scripts/distribute-yield.js --dry-run

# Execute distribution (requires AUTHORITY_KEYPAIR_PATH in .env)
node backend/scripts/distribute-yield.js
```

#### 2.4 Frontend Claim UI (`capital-provider-demo/src/components/ClaimYield.jsx`)
- [x] Shows claimable yield amount with SOL value
- [x] Breakdown: base staking (7%) vs compute bonus (5%)
- [x] "Claim Yield" button triggers on-chain transaction
- [x] Success state with Solscan link
- [x] Last claim history display
- [x] Informational tooltip about yield accrual

### How to Test on Devnet

1. **Run the database schema** in Supabase SQL Editor:
   ```
   backend/src/db/yield-schema.sql
   ```

2. **Set up authority keypair** (optional, for on-chain distribution):
   ```bash
   # Export your devnet wallet keypair to a file
   # Add to backend/.env:
   AUTHORITY_KEYPAIR_PATH=/path/to/keypair.json
   ```

3. **Run a test distribution**:
   ```bash
   cd backend
   node scripts/distribute-yield.js --dry-run  # Preview
   node scripts/distribute-yield.js            # Execute
   ```

4. **Open Capital Provider demo**:
   - Go to http://localhost:5173
   - Connect wallet with active stake
   - See "Yield Available" card with claimable amount
   - Click "Claim Yield" to execute on-chain claim

#### 2.5 Automated Scheduler (`backend/src/yield-scheduler.js`)
- [x] `node-cron` integration for scheduled tasks
- [x] Auto-starts with backend server
- [x] Configurable schedule via `YIELD_SCHEDULE` env var
- [x] On-chain distribution + database recording
- [x] Status API endpoint (`GET /api/scheduler/status`)
- [x] Manual trigger endpoint (`POST /api/scheduler/trigger`)

**Default schedule:** Every hour (`0 * * * *`)  
**Production schedule:** Daily at midnight (`0 0 * * *`)

**Configuration (in `backend/.env`):**
```bash
YIELD_SCHEDULE=0 0 * * *           # Daily at midnight (production)
YIELD_SCHEDULE=0 * * * *           # Every hour (testing)
ENABLE_YIELD_SCHEDULER=false       # Disable scheduler
AUTHORITY_KEYPAIR_PATH=/path/to/keypair.json  # Required for on-chain
```

### Success Metrics
| Metric | Target | Status |
|--------|--------|--------|
| Yield calculation accuracy | ±0.1% of on-chain | ✅ |
| Automated distribution | Every hour | ✅ Complete |
| User claim UX | <3 clicks | ✅ |
| Yield breakdown visibility | Real-time | ✅ |
| Scheduler auto-starts | With server | ✅ |

### Remaining Tasks
- [x] ~~Set up cron job for automated daily distribution~~ ✅ Done
- [ ] Email notifications for claimable yield
- [ ] Yield history chart in dashboard

---

## Sprint 3: GPU Instance Workflow
**Duration:** 2-3 weeks  
**Goal:** Enable full GPU instance rental with file upload, terminal access, and custom training workflows

This sprint transforms the GPU marketplace from a UI shell into a complete training/inference platform where AI builders can:
- Upload datasets and model files
- SSH into GPU instances
- Run custom training scripts
- Download results

### Phase 3.1: File Storage System
**Duration:** 3-4 days

#### 3.1.1 Storage Infrastructure
- [ ] Set up Supabase Storage buckets for user files
- [ ] Create folder structure: `/{user_id}/datasets/`, `/{user_id}/models/`, `/{user_id}/outputs/`
- [ ] Implement file upload API endpoint (`POST /api/files/upload`)
- [ ] Add multipart upload for large files (>100MB)

**Success metric:** Users can upload files up to 10GB via API

#### 3.1.2 File Management UI
- [ ] Add "Files" tab to AI Builder demo
- [ ] Create drag-and-drop upload zone
- [ ] Show upload progress with percentage
- [ ] Display file browser with folders (datasets, models, outputs)
- [ ] Add file actions: download, delete, rename

**Success metric:** Users can manage files in <3 clicks

#### 3.1.3 File Quotas & Limits
- [ ] Implement per-user storage quotas (10GB free tier)
- [ ] Track storage usage in database
- [ ] Show storage usage in UI
- [ ] Add upgrade prompts when approaching limit

**Success metric:** Storage tracked accurately, quota enforced

### Phase 3.2: Instance Provisioning
**Duration:** 3-4 days

#### 3.2.1 RunPod Pod API Integration
- [ ] Implement `createPod()` using RunPod GraphQL API
- [ ] Support GPU selection (A100, H100, RTX 4090, etc.)
- [ ] Configure persistent volume attachment
- [ ] Set up automatic SSH key injection

**Success metric:** Can provision GPU pod with storage in <60 seconds

#### 3.2.2 Instance Configuration UI
- [ ] Create "Launch Instance" modal
- [ ] Add GPU type selector with real-time availability
- [ ] Add storage size selector (50GB, 100GB, 500GB)
- [ ] Show estimated hourly cost
- [ ] Add "Environment" dropdown (PyTorch, TensorFlow, Custom)

**Success metric:** Users can configure and launch instance in <5 clicks

#### 3.2.3 Instance Management
- [ ] Add "Running Instances" section to dashboard
- [ ] Show instance status (starting, running, stopped)
- [ ] Display uptime and current cost
- [ ] Add Stop/Restart/Terminate buttons
- [ ] Implement auto-shutdown timer option

**Success metric:** Users can manage instances without leaving platform

### Phase 3.3: Terminal Access
**Duration:** 4-5 days

#### 3.3.1 Web Terminal Backend
- [ ] Integrate xterm.js for web-based terminal
- [ ] Set up WebSocket proxy to RunPod SSH
- [ ] Implement terminal authentication (user → instance)
- [ ] Add terminal session persistence

**Success metric:** Terminal connects to instance in <3 seconds

#### 3.3.2 Terminal UI
- [ ] Add "Terminal" tab to instance view
- [ ] Implement full-screen terminal mode
- [ ] Add copy/paste support
- [ ] Support multiple terminal tabs per instance
- [ ] Add terminal theme selector (dark, light, custom)

**Success metric:** Terminal UX matches native SSH experience

#### 3.3.3 SSH Key Management
- [ ] Generate SSH keypair per user on signup
- [ ] Store public keys in database
- [ ] Inject keys into new instances automatically
- [ ] Add "SSH Keys" settings page
- [ ] Allow users to add custom public keys

**Success metric:** Users can SSH from any client with their keys

### Phase 3.4: File Sync & Workflows
**Duration:** 3-4 days

#### 3.4.1 File Mount System
- [ ] Mount user's Supabase storage to instance at `/workspace`
- [ ] Implement real-time sync (instance ↔ storage)
- [ ] Add sync status indicator
- [ ] Support selective sync for large directories

**Success metric:** Files appear in instance within 10 seconds of upload

#### 3.4.2 Output Retrieval
- [ ] Auto-detect new files in `/workspace/outputs`
- [ ] Trigger download notification when job completes
- [ ] Add "Download Results" button in job details
- [ ] Support bulk download as ZIP
- [ ] Generate shareable download links (24h expiry)

**Success metric:** Users can retrieve results without manual download

#### 3.4.3 Job Templates & Scripts
- [ ] Create template library (fine-tuning, inference, training)
- [ ] Add "Run Script" quick-action
- [ ] Pre-populate common commands (pip install, python train.py)
- [ ] Save user's command history
- [ ] Support job scheduling (run at specific time)

**Success metric:** Users can start common workflows in 1 click

### Phase 3.5: Monitoring & Logging
**Duration:** 2-3 days

#### 3.5.1 Resource Monitoring
- [ ] Display GPU utilization in real-time
- [ ] Show memory usage (GPU + RAM)
- [ ] Add disk usage indicator
- [ ] Create resource usage charts (last 1h, 24h)

**Success metric:** Users see live GPU metrics

#### 3.5.2 Job Logs
- [ ] Capture stdout/stderr from running processes
- [ ] Store logs in database with timestamps
- [ ] Add log viewer UI with search
- [ ] Support log download (txt, json)
- [ ] Implement log streaming (tail -f style)

**Success metric:** Users can debug jobs without SSH access

#### 3.5.3 Alerts & Notifications
- [ ] Alert when GPU utilization drops to 0%
- [ ] Notify when storage is 80% full
- [ ] Email when long-running job completes
- [ ] Add Slack/Discord webhook integration

**Success metric:** Users notified of important events

### Sprint 3 Deliverables
- File upload/download system with 10GB free storage
- Full GPU instance provisioning via UI
- Web-based terminal with SSH access
- Real-time file sync between storage and instances
- Resource monitoring dashboard
- Job logging system

### Sprint 3 Success Metrics
| Metric | Target |
|--------|--------|
| File upload success rate | >99% |
| Instance launch time | <60 seconds |
| Terminal connection time | <3 seconds |
| File sync latency | <10 seconds |
| GPU utilization visibility | Real-time (<5s delay) |

---

## Sprint 4: LST Support
**Duration:** 2 weeks  
**Goal:** Accept mSOL and jitoSOL as staking assets

### Tasks

#### 3.1 Contract Updates
- [ ] Add SPL token vault accounts for mSOL, jitoSOL
- [ ] Implement `deposit_lst()` instruction
- [ ] Implement `withdraw_lst()` instruction
- [ ] Update yield calculation for LST positions

**Success metric:** Contract accepts mSOL/jitoSOL deposits

#### 3.2 Price Oracle Integration
- [ ] Integrate Pyth price feeds for SOL, mSOL, jitoSOL
- [ ] Implement fair value calculation (SOL-equivalent)
- [ ] Add slippage protection on withdrawals
- [ ] Cache prices with 60-second refresh

**Success metric:** Accurate pricing within 0.5% of market

#### 3.3 Frontend Updates
- [ ] Add asset selector to deposit modal
- [ ] Show user's mSOL/jitoSOL balances
- [ ] Display position breakdown by asset
- [ ] Update APY display per asset type

**Success metric:** Users can deposit mSOL/jitoSOL from UI

#### 3.4 LST Analytics
- [ ] Track TVL by asset type
- [ ] Show historical LST allocation
- [ ] Compare yield rates across assets
- [ ] Add LST-specific activity feed items

**Success metric:** Dashboard shows complete LST breakdown

### Deliverables
- Contract supporting SOL + mSOL + jitoSOL
- Multi-asset deposit/withdraw UI
- Price oracle integration
- LST analytics dashboard

---

## Sprint 5: Multi-Provider GPU
**Duration:** 1-2 weeks  
**Goal:** Add Lambda Labs as secondary provider, implement failover

### Tasks

#### 4.1 Lambda Labs Integration
- [ ] Implement Lambda Labs API client
- [ ] Map GPU types to Lambda inventory
- [ ] Implement instance provisioning
- [ ] Add instance termination

**Success metric:** Can launch Lambda Labs GPU via API

#### 4.2 Provider Abstraction
- [ ] Create unified provider interface
- [ ] Implement provider selection algorithm (price, availability)
- [ ] Add provider health checks
- [ ] Store provider metadata per job

**Success metric:** Jobs route to cheapest available provider

#### 4.3 Failover System
- [ ] Implement automatic failover on provider error
- [ ] Add retry with alternate provider
- [ ] Alert on repeated failures
- [ ] Track provider reliability metrics

**Success metric:** <0.1% job failures due to provider issues

#### 4.4 Inventory Aggregation
- [ ] Combine availability from all providers
- [ ] Show "best price" with provider badge
- [ ] Real-time availability updates
- [ ] Historical pricing data

**Success metric:** Users see unified GPU marketplace

### Deliverables
- Lambda Labs API integration
- Smart provider selection
- Automatic failover
- Aggregated GPU marketplace

---

## Sprint 6: API Keys & SDK
**Duration:** 1 week  
**Goal:** Enable programmatic access for AI teams

### Tasks

#### 5.1 API Key System
- [ ] Generate secure API keys (prefix: `prmis_`)
- [ ] Store hashed keys in database
- [ ] Implement key rotation
- [ ] Add key scopes (read, write, admin)

**Success metric:** Users can create/revoke API keys

#### 5.2 API Authentication
- [ ] Add API key middleware
- [ ] Rate limiting per key (100 req/min default)
- [ ] Usage tracking per key
- [ ] Abuse detection

**Success metric:** API keys work with rate limiting

#### 5.3 SDK Development
- [ ] Create `@primis/sdk` npm package
- [ ] Implement core methods:
  ```javascript
  primis.jobs.create({ gpu: 'a100', hours: 4 })
  primis.jobs.list()
  primis.jobs.terminate(jobId)
  primis.batch.submit(prompts)
  primis.credits.balance()
  ```
- [ ] Add TypeScript types
- [ ] Write SDK documentation

**Success metric:** SDK published to npm

#### 5.4 Developer Portal
- [ ] API documentation page
- [ ] Interactive API explorer
- [ ] SDK quickstart guide
- [ ] Code examples (Python, Node.js)

**Success metric:** Developers can integrate in <30 minutes

### Deliverables
- API key management UI
- Rate-limited API authentication
- `@primis/sdk` npm package
- Developer documentation portal

---

## Sprint 7: Billing & Invoicing
**Duration:** 1 week  
**Goal:** Full financial system for AI builders

### Tasks

#### 6.1 Usage Metering
- [ ] Track per-second GPU usage
- [ ] Calculate accurate costs per job
- [ ] Store usage events in time-series
- [ ] Generate usage reports

**Success metric:** Usage matches actual runtime ±1 second

#### 6.2 Invoice Generation
- [ ] Monthly invoice PDF generation
- [ ] Itemized breakdown by job
- [ ] Include tax calculation (optional)
- [ ] Email invoice delivery

**Success metric:** Invoices sent by 3rd of each month

#### 6.3 Payment Methods
- [ ] Add saved cards (Stripe Customer Portal)
- [ ] Auto-charge on low balance (optional)
- [ ] Support for wire transfers (manual)
- [ ] Payment receipts

**Success metric:** Multiple payment methods available

#### 6.4 Billing Dashboard
- [ ] Current month spend
- [ ] Spend by GPU type chart
- [ ] Cost projection
- [ ] Budget alerts

**Success metric:** Users understand their spending

### Deliverables
- Per-second usage metering
- Monthly invoice system
- Multiple payment methods
- Billing analytics dashboard

---

## Sprint 8: Security & Audit
**Duration:** 2-3 weeks  
**Goal:** Production-grade security, audit-ready code

### Tasks

#### 7.1 Smart Contract Audit Prep
- [ ] Code freeze for audit
- [ ] Internal security review
- [ ] Fix all known issues
- [ ] Prepare audit documentation

**Success metric:** Code ready for external audit

#### 7.2 External Audit
- [ ] Engage audit firm (OtterSec, Sec3, Neodyme)
- [ ] Respond to findings
- [ ] Implement fixes
- [ ] Get final report

**Success metric:** Audit report with no critical issues

#### 7.3 Backend Security
- [ ] Penetration testing
- [ ] SQL injection prevention audit
- [ ] Rate limiting on all endpoints
- [ ] Input validation review
- [ ] Secrets management (Vault or AWS Secrets)

**Success metric:** Zero critical vulnerabilities

#### 7.4 Operational Security
- [ ] Set up multi-sig for program authority
- [ ] Implement key rotation procedures
- [ ] Create incident response plan
- [ ] Set up security monitoring (alerts)

**Success metric:** Documented security procedures

### Deliverables
- External audit report
- Penetration test report
- Security documentation
- Multi-sig treasury setup

---

## Sprint 9: Mainnet Launch
**Duration:** 1 week  
**Goal:** Production go-live

### Tasks

#### 8.1 Final Testing
- [ ] End-to-end testing on mainnet-beta
- [ ] Load testing (100 concurrent users)
- [ ] Failure scenario testing
- [ ] Recovery procedure validation

**Success metric:** All tests pass

#### 8.2 Launch Checklist
- [ ] Unpause mainnet contract
- [ ] Enable production Stripe (live mode)
- [ ] Switch RPC to mainnet
- [ ] Update all environment configs
- [ ] Enable monitoring alerts

**Success metric:** All systems green

#### 8.3 Soft Launch
- [ ] Invite 10-20 beta users
- [ ] Monitor for issues
- [ ] Gather feedback
- [ ] Quick iteration on bugs

**Success metric:** Beta users complete full flows

#### 8.4 Public Launch
- [ ] Remove beta restrictions
- [ ] Announce on social media
- [ ] Publish blog post
- [ ] Enable public signups

**Success metric:** First 100 users onboarded

### Deliverables
- Live mainnet platform
- Monitoring dashboard
- Launch announcement
- Support documentation

---

## V1.5 Roadmap (Future)

After V1 launch, prioritize based on user feedback:

### User-Requested Features
- [ ] Team/organization accounts
- [ ] Spot/preemptible instances (cheaper, interruptible)
- [ ] Custom Docker images
- [ ] Jupyter notebook access
- [ ] File upload/download for jobs

### Infrastructure Expansion
- [ ] Own GPU hardware deployment
- [ ] Additional providers (Vast.ai, CoreWeave)
- [ ] Multi-region support
- [ ] Edge inference endpoints

### Ecosystem Growth
- [ ] Multi-chain support (Ethereum L2s)
- [ ] DAO governance
- [ ] Referral program
- [ ] Bug bounty program
- [ ] Public API for integrations

---

## Technical Decisions (Locked for V1)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth | Privy | Best UX for crypto + traditional users |
| Database | PostgreSQL (Supabase) | Reliable, scalable, familiar |
| Smart Contracts | Anchor (Solana) | Fast, cheap, good DevEx |
| GPU Provider (Primary) | RunPod | Best API, good pricing |
| GPU Provider (Secondary) | Lambda Labs | Reliability backup |
| Payments | Stripe | Industry standard, fiat-first |
| Hosting | Vercel + Railway | Easy deployment, good DX |
| Yield Split | 70/20/10 | Balanced incentives |
| Minimum Stake | 10 SOL | ~$1500 commitment |

---

## Success Metrics

### MVP (Complete ✅)
- [x] Users can stake real SOL
- [x] Users can buy credits
- [x] Users can launch real GPU jobs
- [x] Batch image generation works

### V1 Goals
- [ ] 100+ stakers with 10,000+ SOL TVL
- [ ] 500+ AI builder accounts
- [ ] $10,000+ monthly compute revenue
- [ ] 99.9% API uptime
- [ ] <5 minute average job start time
- [ ] Zero security incidents

### V1.5 Goals
- [ ] 1,000+ stakers with 100,000+ SOL TVL
- [ ] 5,000+ AI builder accounts
- [ ] $100,000+ monthly compute revenue
- [ ] Multi-provider GPU inventory
- [ ] Team accounts with 50+ organizations

---

*Last updated: January 23, 2026*
*MVP completed. Sprint 2 (Automated Yield System) fully implemented with hourly scheduler.*
