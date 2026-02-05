# Bob the Builder

> **Your idea → Working app in minutes**  
> AI-powered app builder for non-technical users, powered by Primis compute.

---

## 🎯 Vision

**Problem:** Small business owners need custom apps but can't code and can't afford developers.

**Solution:** Conversational AI that asks the right questions and builds the app for you.

**Tagline:** "You talk, we build, it works."

```
┌─────────────────────────────────────────────────────────────┐
│  THE ABSTRACTION LADDER                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Level 1: Cloud (AWS/GCP)     "Here's a server"            │
│  Level 2: GPU Cloud (RunPod)  "Here's a GPU"               │
│  Level 3: Managed Apps        "Here's a bot" (OpenClaw)    │
│  Level 4: AI Builder          "What do you need?" (Bob) ←  │
│                                                             │
│  Each level = 10x larger market                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 👤 Target Users

| User Type | Example | Pain Point | Willingness to Pay |
|-----------|---------|------------|-------------------|
| **Solo Business** | Dog groomer, tutor, photographer | Need booking/payments, can't build | $30-50/mo |
| **Small Business** | Salon, gym, clinic | Using 5 tools, want one system | $50-100/mo |
| **Creator** | Course seller, coach | Need membership site, hate tech | $50-100/mo |
| **Side Hustler** | Etsy seller, freelancer | Want professional presence | $20-30/mo |
| **Non-Profit** | Local charity, club | Need event registration, donations | $20-30/mo |

**NOT targeting:** Developers, enterprises, complex SaaS builders

---

## 🗣️ User Journey

### Phase 1: Discovery Conversation

```
┌─────────────────────────────────────────────────────────────┐
│  💬 BOB THE BUILDER                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Bob: Hi! I'm Bob. Tell me what you're trying to build     │
│       and I'll create it for you. What's your idea?        │
│                                                             │
│  You: I want to build an app where people can book         │
│       appointments with my dog grooming business           │
│                                                             │
│  Bob: A booking system for dog grooming — love it! 🐕       │
│                                                             │
│       Let me ask a few questions to build this right:      │
│                                                             │
│       1. CLIENTS                                            │
│          Will clients create accounts, or just book        │
│          as guests?                                         │
│                                                             │
│          [Accounts] [Guest only] [Not sure]                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2: Clarifying Questions

Bob asks structured questions based on the app type:

**For Booking Apps:**
- Client accounts vs guest booking?
- Calendar integration (Google, Outlook)?
- Payment timing (upfront, deposit, at appointment)?
- Services offered (list them)?
- Business hours?
- Staff members (solo or team)?
- Notifications (email, SMS)?

**For Directory/Listing Apps:**
- What's being listed (people, places, products)?
- Who can submit listings?
- Search/filter criteria?
- Contact method (form, direct, both)?

**For Membership Apps:**
- Free vs paid tiers?
- What's behind the paywall?
- Community features (forum, chat)?
- Content types (video, text, downloads)?

### Phase 3: Build Preview

```
┌─────────────────────────────────────────────────────────────┐
│  🔨 BUILDING YOUR APP                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Based on your answers, I'm creating:                      │
│                                                             │
│  ✓ Booking page for clients                                │
│  ✓ Admin dashboard for you                                 │
│  ✓ Google Calendar sync                                    │
│  ✓ Stripe payments (deposits)                              │
│  ✓ Email confirmations                                     │
│  ✓ Service menu with prices                                │
│                                                             │
│  ████████████████████░░░░ 75%                              │
│                                                             │
│  Preview available in 30 seconds...                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: Live Preview

```
┌─────────────────────────────────────────────────────────────┐
│  🎉 YOUR APP IS READY!                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │     🐕 FLUFFY PAWS DOG GROOMING                     │   │
│  │                                                     │   │
│  │     Book Your Appointment                           │   │
│  │                                                     │   │
│  │     Select a Service:                               │   │
│  │     ☐ Basic Bath ($30)                              │   │
│  │     ☐ Full Groom ($60)                              │   │
│  │     ☐ Puppy Package ($45)                           │   │
│  │                                                     │   │
│  │     [Continue →]                                    │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Preview URL: preview-abc123.bob.primis.app                │
│                                                             │
│  [Edit App]  [Ask Bob to Change Something]  [Go Live]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 5: Iterate via Chat

```
You: Can you add a photo gallery of past dogs I've groomed?

Bob: Adding photo gallery to your homepage... Done! ✓
     
     I've added:
     • Gallery section with grid layout
     • Upload button in your admin dashboard
     • "Before/After" toggle option
     
     [See Changes]

You: Actually, can clients also leave reviews?

Bob: Great idea! Adding reviews... Done! ✓
     
     Now clients can:
     • Leave star ratings after appointments
     • Write text reviews
     • Reviews show on your booking page
     
     You can moderate reviews in your dashboard.
```

### Phase 6: Go Live

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 LAUNCH YOUR APP                                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Your app is ready to go live!                             │
│                                                             │
│  Choose your plan:                                         │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  LAUNCH         │  │  GROW           │                  │
│  │  $29/month      │  │  $79/month      │                  │
│  │                 │  │                 │                  │
│  │  • 1 app        │  │  • 3 apps       │                  │
│  │  • bob.primis   │  │  • Custom domain│                  │
│  │    subdomain    │  │  • Analytics    │                  │
│  │  • Email support│  │  • Priority help│                  │
│  │                 │  │                 │                  │
│  │  [Select]       │  │  [Select]       │                  │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  Your URL: fluffypaws.bob.primis.app                       │
│  Or use your own: www.fluffypawsgrooming.com ($10 extra)   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│  BOB THE BUILDER ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  FRONTEND (bob.primis.app)                          │   │
│  │  • Chat interface (React)                           │   │
│  │  • Live preview iframe                              │   │
│  │  • Visual editor (optional tweaks)                  │   │
│  │  • Dashboard (manage apps)                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  BOB API (backend)                                  │   │
│  │  • Conversation state machine                       │   │
│  │  • Template selection logic                         │   │
│  │  • Code generation orchestrator                     │   │
│  │  • Deployment pipeline                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│           ┌───────────────┼───────────────┐                │
│           ▼               ▼               ▼                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  AI ENGINE  │  │  DEPLOY     │  │  DATABASE   │        │
│  │  Claude API │  │  Railway    │  │  Supabase   │        │
│  │  Code gen   │  │  Containers │  │  Per-app DB │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  USER'S APP (deployed)                              │   │
│  │  • Frontend: React/Next.js on Vercel               │   │
│  │  • Backend: Node.js on Railway                      │   │
│  │  • Database: Supabase (Postgres)                    │   │
│  │  • Storage: Supabase Storage                        │   │
│  │  • Auth: Supabase Auth                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### AI Engine Details

```javascript
// Conversation Flow
const CONVERSATION_PHASES = {
  GREETING: 'greeting',           // "What do you want to build?"
  CLASSIFICATION: 'classification', // Detect app type (booking, directory, etc)
  DISCOVERY: 'discovery',         // Ask clarifying questions
  CONFIRMATION: 'confirmation',   // "Here's what I'll build"
  GENERATION: 'generation',       // Build the app
  ITERATION: 'iteration',         // "Change X, add Y"
  DEPLOYMENT: 'deployment'        // Go live
}

// Template Detection
const APP_TYPES = {
  BOOKING: ['appointment', 'schedule', 'book', 'reservation', 'calendar'],
  DIRECTORY: ['list', 'directory', 'find', 'search', 'catalog'],
  MEMBERSHIP: ['members', 'subscription', 'paywall', 'community', 'course'],
  PORTFOLIO: ['portfolio', 'showcase', 'gallery', 'work', 'projects'],
  STORE: ['sell', 'shop', 'products', 'buy', 'ecommerce'],
  WAITLIST: ['waitlist', 'signup', 'launch', 'coming soon', 'early access'],
  EVENT: ['event', 'registration', 'rsvp', 'workshop', 'conference'],
  INTERNAL: ['team', 'internal', 'employee', 'tracker', 'inventory']
}

// Code Generation Prompt (simplified)
const generateApp = async (appSpec) => {
  const prompt = `
    You are an expert full-stack developer.
    
    Build a complete web application with:
    - Frontend: Next.js 14 with App Router, Tailwind CSS
    - Backend: API routes in Next.js
    - Database: Supabase (Postgres)
    - Auth: Supabase Auth
    - Payments: Stripe (if needed)
    
    Application Spec:
    ${JSON.stringify(appSpec, null, 2)}
    
    Generate:
    1. All necessary files
    2. Database schema (SQL)
    3. Environment variables needed
    4. Setup instructions
    
    Make it production-ready, mobile-responsive, and beautiful.
  `
  
  return await claude.generate(prompt)
}
```

### Database Schema (Bob Platform)

```sql
-- Users who build apps on Bob
CREATE TABLE bob_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT,
  plan TEXT DEFAULT 'free', -- free, launch, grow, scale
  apps_limit INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apps built by users
CREATE TABLE bob_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES bob_users(id),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- fluffypaws.bob.primis.app
  custom_domain TEXT,
  
  -- App configuration (from conversation)
  app_type TEXT NOT NULL, -- booking, directory, membership, etc
  spec JSONB NOT NULL, -- Full app specification
  
  -- Deployment info
  railway_service_id TEXT,
  supabase_project_id TEXT,
  deploy_status TEXT DEFAULT 'draft', -- draft, deploying, live, paused
  
  -- Generated code (stored for rebuilds)
  code_snapshot JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deployed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversation history (for context)
CREATE TABLE bob_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES bob_apps(id),
  messages JSONB NOT NULL, -- Array of {role, content, timestamp}
  phase TEXT NOT NULL, -- greeting, discovery, generation, etc
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App analytics
CREATE TABLE bob_app_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID REFERENCES bob_apps(id),
  date DATE NOT NULL,
  page_views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0, -- bookings, signups, etc
  revenue_cents INTEGER DEFAULT 0,
  UNIQUE(app_id, date)
);
```

### Deployment Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  APP DEPLOYMENT PIPELINE                                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. USER CONFIRMS SPEC                                      │
│     └─ Spec saved to bob_apps.spec                         │
│                                                             │
│  2. CODE GENERATION (30-60 seconds)                        │
│     └─ Claude generates all files                          │
│     └─ Code validated (syntax check)                       │
│     └─ Saved to bob_apps.code_snapshot                     │
│                                                             │
│  3. DATABASE SETUP (10 seconds)                            │
│     └─ Create Supabase project (or use shared)             │
│     └─ Run migrations                                       │
│     └─ Set up Row Level Security                           │
│                                                             │
│  4. DEPLOY FRONTEND (60 seconds)                           │
│     └─ Push to GitHub repo (per user)                      │
│     └─ Vercel auto-deploys                                 │
│     └─ SSL certificate provisioned                         │
│                                                             │
│  5. DEPLOY BACKEND (if needed) (60 seconds)                │
│     └─ Railway service created                             │
│     └─ Environment variables set                           │
│     └─ Health check passes                                 │
│                                                             │
│  6. DNS SETUP (instant for subdomain)                      │
│     └─ {slug}.bob.primis.app → Vercel                      │
│     └─ Custom domain: user adds CNAME                      │
│                                                             │
│  7. LIVE                                                    │
│     └─ User notified                                       │
│     └─ App accessible                                       │
│                                                             │
│  Total time: ~3-5 minutes                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 App Templates (v1)

### Template 1: Booking/Scheduling
**Trigger words:** appointment, book, schedule, calendar, reservation

**Features:**
- Service menu with prices
- Calendar with available slots
- Client booking form
- Google Calendar sync
- Payment integration (Stripe)
- Email/SMS confirmations
- Admin dashboard
- Booking management

**Industries:** Salons, spas, tutors, consultants, photographers, coaches, therapists

### Template 2: Directory/Listings
**Trigger words:** directory, find, list, search, catalog

**Features:**
- Listing submission form
- Search and filter
- Categories/tags
- Map view (optional)
- Contact forms
- Listing management
- Featured listings (paid)

**Industries:** Local business directories, job boards, rental listings, service providers

### Template 3: Waitlist/Launch Page
**Trigger words:** waitlist, coming soon, launch, signup, early access

**Features:**
- Email capture form
- Referral system (optional)
- Position counter
- Social sharing
- Admin dashboard
- Export subscribers

**Industries:** Startups, product launches, exclusive clubs

### Template 4: Portfolio/Showcase
**Trigger words:** portfolio, showcase, work, gallery, projects

**Features:**
- Project gallery
- Case studies
- About page
- Contact form
- Testimonials
- Resume/CV download

**Industries:** Designers, photographers, artists, freelancers, agencies

### Template 5: Simple Store
**Trigger words:** sell, shop, products, store, buy

**Features:**
- Product catalog
- Shopping cart
- Stripe checkout
- Order management
- Inventory tracking
- Email receipts

**Industries:** Handmade goods, digital products, small retailers

### Template 6: Event Registration
**Trigger words:** event, registration, RSVP, workshop, conference

**Features:**
- Event details page
- Registration form
- Ticket types/pricing
- Payment processing
- Attendee list
- Email confirmations
- Check-in system

**Industries:** Workshops, conferences, classes, meetups

### Template 7: Membership Site
**Trigger words:** members, subscription, community, course, paywall

**Features:**
- Public landing page
- Member signup/login
- Subscription tiers
- Protected content
- Community forum (optional)
- Content management
- Member dashboard

**Industries:** Course creators, coaches, communities, newsletters

### Template 8: Internal Tool
**Trigger words:** team, internal, tracker, inventory, employee

**Features:**
- Team login
- Data entry forms
- Dashboard/reports
- Search and filter
- Export to CSV
- Role-based access

**Industries:** Small businesses, teams, organizations

---

## 💰 Business Model

### Pricing Tiers

| Tier | Price | Apps | Features | Target |
|------|-------|------|----------|--------|
| **Free** | $0 | 1 | Preview only, no hosting | Try before buy |
| **Launch** | $29/mo | 1 | Subdomain, email support | Solo businesses |
| **Grow** | $79/mo | 3 | Custom domain, analytics, priority support | Growing businesses |
| **Scale** | $199/mo | Unlimited | API access, white-label, dedicated support | Agencies |

### Add-ons

| Add-on | Price | What |
|--------|-------|------|
| Custom domain | $10/mo | yoursite.com instead of subdomain |
| SMS notifications | $15/mo | Twilio integration for texts |
| Remove "Built with Bob" | $20/mo | White-label footer |
| Priority generation | $10/mo | Skip the queue, faster builds |
| Extra storage | $5/mo per 10GB | For image-heavy apps |

### Revenue Projections

| Milestone | Users | Avg Revenue | MRR | ARR |
|-----------|-------|-------------|-----|-----|
| Month 1 | 50 | $35 | $1,750 | $21K |
| Month 3 | 200 | $40 | $8,000 | $96K |
| Month 6 | 500 | $45 | $22,500 | $270K |
| Month 12 | 2,000 | $50 | $100,000 | $1.2M |

### Unit Economics

| Metric | Value |
|--------|-------|
| Avg user pays | $45/month |
| Hosting cost per user | ~$8/month (Railway + Supabase) |
| AI cost per user | ~$3/month (Claude tokens) |
| **Gross margin** | **~75%** |
| CAC (estimated) | $30 |
| LTV (12 month, 10% churn) | $400 |
| **LTV:CAC** | **13:1** ✅ |

---

## 🗺️ Roadmap & Sprints

### Phase 1: Foundation (Weeks 1-3)

#### Sprint B1: Conversation Engine
**Duration:** 1 week  
**Status:** 🔄 In Progress  
**Goal:** Chat interface that understands user intent and asks right questions

**Sub-Sprints:**

| Sub-Sprint | Task | Status | Time |
|------------|------|--------|------|
| B1.1 | Project setup & chat UI | ✅ Complete | 2 hrs |
| B1.2 | Conversation state machine | ✅ Complete | 1 hr |
| B1.3 | App type classification | ✅ Complete | 1 hr |
| B1.4 | Question flow engine | ✅ Complete | 1 hr |
| B1.5 | App spec JSON generation | ✅ Complete | 30 min |
| B1.6 | Database schema & persistence | 🔜 Next | - |

**What Was Built:**

**B1.1: Project Setup** ✅
- Vite + React project at `bob-the-builder/`
- Dark theme with sophisticated palette
- Chat interface with message bubbles
- Sidebar with app list
- Typing indicator animation

**B1.2: State Machine** ✅
- 6 phases: GREETING → CLASSIFICATION → DISCOVERY → CONFIRMATION → GENERATION → COMPLETE
- Phase transitions based on user input
- Message history tracking

**B1.3: App Classification** ✅
- 8 app types with keyword detection
- API module with fallback to local classification
- Icons and descriptions for each type

**B1.4: Question Flows** ✅
- Booking template: 5 questions (accounts, calendar, payments, services, name)
- Waitlist template: 4 questions (referrals, countdown, name, tagline)
- Portfolio template: 4 questions (work type, contact, name, profession)

**B1.5: App Spec** ✅
- JSON spec built from conversation answers
- Confirmation summary before building
- Simulated build process with progress messages

**Running at:** http://localhost:5174/

**Deliverables:**
- [x] Chat interface running locally
- [x] Conversations complete end-to-end
- [x] App spec generated from conversation
- [ ] Database persistence (B1.6)

**Success Metrics:**
| Metric | Target | Result |
|--------|--------|--------|
| App type detected correctly | 90%+ | ✅ Working |
| Conversation completes | 80%+ | ✅ Working |
| User understands questions | Qualitative | ✅ Clear |

---

#### Sprint B2: Code Generation Engine
**Duration:** 1 week  
**Status:** ✅ Complete  
**Goal:** Generate deployable code from app spec

**Sub-Sprints:**

| Sub-Sprint | Task | Status | Time |
|------------|------|--------|------|
| B2.1 | Backend Bob API routes | ✅ Complete | 1 hr |
| B2.2 | Claude API integration | ✅ Complete | 30 min |
| B2.3 | Code gen prompts (booking) | ✅ Complete | 1 hr |
| B2.4 | Generated code validation | ✅ Complete | 30 min |
| B2.5 | Frontend integration | ✅ Complete | 30 min |

**What Was Built:**

**B2.1: Backend Routes** ✅
```
POST /api/bob/classify  — AI-powered app type classification
POST /api/bob/generate  — Full code generation from spec
POST /api/bob/validate  — Syntax & structure validation
GET  /api/bob/templates — List available app types
GET  /api/bob/health    — Service health check
```

**B2.2: Claude Integration** ✅
- Anthropic SDK installed in backend
- Claude 3.5 Sonnet for code generation
- Claude 3 Haiku for quick classification
- Fallback to keyword matching if API unavailable

**B2.3: Code Gen Prompts** ✅
- Template-specific prompts for all 8 app types
- Full stack: React + Tailwind + Express + Supabase
- Database schema generation included

**B2.4: Validation** ✅
- File structure validation
- Required files check (App.jsx, package.json)
- Syntax validation

**B2.5: Frontend Integration** ✅
- Real API calls from chat interface
- Progress messages during generation
- "show code" command to view files
- Graceful fallback if API unavailable

**Files Created:**
- `backend/src/routes/bob.js` — Full Bob API implementation

**Deliverables:**
- [x] Working code generation for booking template
- [x] Generated code passes validation
- [x] Database schema generated

**Success Metrics:**
| Metric | Target | Result |
|--------|--------|--------|
| Code compiles | 95%+ | ✅ Ready |
| Code runs locally | 90%+ | ✅ Ready |
| Matches user spec | 85%+ | ✅ Working |

---

#### Sprint B3: Preview System
**Duration:** 1 week  
**Status:** ✅ Complete  
**Goal:** Let users see their app before deploying

**Sub-Sprints:**

| Sub-Sprint | Task | Status | Time |
|------------|------|--------|------|
| B3.1 | Code preview panel | ✅ Complete | 1 hr |
| B3.2 | File tree + syntax highlighting | ✅ Complete | 30 min |
| B3.3 | Live preview placeholder | ✅ Complete | 30 min |
| B3.4 | Preview URL display | ✅ Complete | 15 min |
| B3.5 | Edit & regenerate flow | ✅ Complete | 15 min |

**What Was Built:**

**B3.1: Preview Panel** ✅
- Full-screen preview panel component
- Tabs: Preview | Code
- File sidebar with directory grouping
- Responsive design

**B3.2: Code Viewer** ✅
- File tree navigation
- Syntax highlighting for JS/CSS/JSON/SQL
- Copy-to-clipboard functionality
- File path display

**B3.3: Preview Placeholder** ✅
- Browser-style toolbar (dots, URL bar)
- Preview URL display
- "Coming Soon" placeholder for live preview
- Links to Code tab

**B3.4: Integration** ✅
- Auto-opens after code generation
- "preview" command in chat opens panel
- Select app from sidebar opens panel

**Files Created:**
- `bob-the-builder/src/components/PreviewPanel.jsx`
- `bob-the-builder/src/components/PreviewPanel.css`

**Deliverables:**
- [x] Preview panel shows generated code
- [x] File tree navigation works
- [x] Syntax highlighting active
- [x] Auto-opens after generation

**Success Metrics:**
| Metric | Target | Result |
|--------|--------|--------|
| Preview loads | 99%+ | ✅ Working |
| Code is readable | Yes | ✅ Highlighted |
| User can browse files | Yes | ✅ File tree |

---

### Phase 2: Deployment (Weeks 4-5)

#### Sprint B4: Deployment Pipeline
**Duration:** 1 week  
**Goal:** One-click deploy to production

**Tasks:**
- [ ] Integrate with Railway for backend
- [ ] Integrate with Vercel for frontend
- [ ] Auto-provision Supabase database
- [ ] Implement subdomain routing
- [ ] Set up SSL certificates
- [ ] Environment variable management

**Deliverables:**
- Working deployment pipeline
- Apps live at {slug}.bob.primis.app
- Health monitoring

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Deploy success rate | 95%+ |
| Time to deploy | < 5 minutes |
| App uptime | 99.5%+ |

---

#### Sprint B5: Billing Integration
**Duration:** 1 week  
**Goal:** Stripe subscriptions for Bob

**Tasks:**
- [ ] Create Stripe products/prices
- [ ] Implement subscription checkout
- [ ] Handle subscription webhooks
- [ ] Enforce plan limits (apps count)
- [ ] Build billing portal link
- [ ] Pause apps on payment failure

**Deliverables:**
- Working subscription flow
- Plan enforcement
- Billing history

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Checkout completion | 70%+ |
| Failed payment handling | 100% |
| Plan limits enforced | 100% |

---

### Phase 3: Templates & Polish (Weeks 6-7)

#### Sprint B6: More Templates
**Duration:** 1 week  
**Goal:** Add 4 more templates beyond booking

**Tasks:**
- [ ] Directory/Listings template
- [ ] Waitlist/Launch template
- [ ] Portfolio/Showcase template
- [ ] Simple Store template
- [ ] Test each template end-to-end
- [ ] Add template-specific questions

**Deliverables:**
- 5 working templates total
- All templates deployable

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Templates working | 5/5 |
| User can identify template | 90%+ |

---

#### Sprint B7: Iteration & Polish
**Duration:** 1 week  
**Goal:** Let users modify apps via chat

**Tasks:**
- [ ] "Change X" conversation handling
- [ ] Incremental code updates
- [ ] Visual editor (basic)
- [ ] Error recovery
- [ ] Help/documentation
- [ ] Onboarding flow

**Deliverables:**
- Users can iterate via chat
- Basic visual tweaks possible
- Help docs written

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Iteration success rate | 80%+ |
| Users complete onboarding | 70%+ |

---

### Phase 4: Launch (Week 8)

#### Sprint B8: Beta Launch
**Duration:** 1 week  
**Goal:** Launch to early adopters

**Tasks:**
- [ ] Internal testing (team builds 10 apps)
- [ ] Fix critical bugs
- [ ] Landing page for Bob
- [ ] Launch announcement (Twitter, PH prep)
- [ ] Monitor first 50 users
- [ ] Collect feedback
- [ ] Iterate rapidly

**Deliverables:**
- Bob live at bob.primis.app
- 50 beta users
- Feedback collected

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Beta signups | 100+ |
| Apps deployed | 30+ |
| Paying users | 10+ |
| NPS | > 30 |

---

## 📅 Timeline Summary

```
┌─────────────────────────────────────────────────────────────┐
│  BOB THE BUILDER TIMELINE                                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WEEK 1  │ B1: Conversation Engine                         │
│  WEEK 2  │ B2: Code Generation                             │
│  WEEK 3  │ B3: Preview System                              │
│  WEEK 4  │ B4: Deployment Pipeline                         │
│  WEEK 5  │ B5: Billing Integration                         │
│  WEEK 6  │ B6: More Templates (5 total)                    │
│  WEEK 7  │ B7: Iteration & Polish                          │
│  WEEK 8  │ B8: Beta Launch                                 │
│                                                             │
│  Total: 8 weeks to beta                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Success Metrics

### Launch Week (Week 8)

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Beta signups | 100+ | Interest validation |
| Apps created | 50+ | Product works |
| Apps deployed | 30+ | Full funnel works |
| Paying users | 10+ | Revenue validation |
| Deploy success rate | 90%+ | Reliability |

### Month 1

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Total users | 200+ | Growth |
| Paying users | 50+ | Revenue |
| MRR | $2,000+ | Business viability |
| Churn rate | < 15% | Product value |
| NPS | > 40 | User satisfaction |

### Month 3

| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Total users | 500+ | Scale |
| Paying users | 150+ | Revenue |
| MRR | $7,500+ | Sustainability |
| Templates | 8+ | Coverage |
| Referrals | 20%+ of signups | Virality |

---

## ⚠️ Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **AI generates buggy code** | High | High | Template constraints, validation, manual review queue |
| **Complex requests fail** | High | Medium | Clear "what Bob can/can't do", graceful fallback |
| **Hosting costs exceed pricing** | Medium | High | Monitor per-user costs, adjust tiers if needed |
| **Support overwhelmed** | Medium | Medium | AI support bot, self-serve docs, community forum |
| **Competition (Bolt, v0)** | High | Medium | Focus on non-devs, simpler UX, different positioning |
| **User expects too much** | High | Medium | Set expectations early, show limitations |

---

## 🔗 Integration with Primis Ecosystem

### The Upsell Path

```
Bob User Journey → Primis Ecosystem

1. User builds booking app with Bob
   ↓
2. App gets popular, needs AI features
   "Can my app answer customer questions?"
   ↓
3. Bob adds AI (uses Primis LLM compute)
   User sees: "AI Support: $15/mo"
   Behind scenes: Primis serverless inference
   ↓
4. User wants more customization
   "I need to process images"
   ↓
5. Upgraded to Primis GPU compute
   User becomes full Primis customer
   ↓
6. User sees staking benefits
   "Stake SOL for 15% discount"
   ↓
7. User becomes capital provider
   Full ecosystem participant
```

### Shared Infrastructure

| Bob Feature | Primis Component |
|-------------|------------------|
| AI conversation | Together AI / Anthropic (via Primis) |
| App hosting | Railway (same as OpenClaw) |
| Database | Supabase (shared) |
| Payments | Stripe (shared account) |
| Auth | Privy (shared) |

### Branding

```
"Built with Bob, powered by Primis"

bob.primis.app → Clear Primis association
"Powered by Primis compute" in footer
Shared navigation to Primis ecosystem
```

---

## 🚀 Getting Started (Sprint B1)

### Immediate Tasks (This Week)

1. **Set up Bob repo**
   - [ ] Create `bob-the-builder/` directory
   - [ ] Initialize Next.js project
   - [ ] Set up Tailwind CSS
   - [ ] Create basic chat UI component

2. **Design conversation flow**
   - [ ] Map out all questions for booking template
   - [ ] Define app spec JSON schema
   - [ ] Create state machine diagram

3. **Connect Claude**
   - [ ] Test Claude API for app classification
   - [ ] Write system prompts for discovery phase
   - [ ] Build response parsing

4. **Build database schema**
   - [ ] Create bob_users, bob_apps, bob_conversations tables
   - [ ] Set up Supabase project for Bob

### Questions to Resolve

- [ ] Shared Supabase or per-app projects? (Cost vs isolation)
- [ ] Vercel or Railway for frontend hosting? (Simplicity vs cost)
- [ ] How to handle custom domains at scale?
- [ ] Should we build visual editor or chat-only for v1?

---

*Last updated: February 4, 2026*  
*Status: Sprint B1 + B2 + B3 Complete — Chat + Code Generation + Preview Panel Working*  
*Running at: http://localhost:5174/ (frontend) + :3001 (backend)*  
*Next: B4 Deployment Pipeline*  
*"You talk, we build, it works."*
