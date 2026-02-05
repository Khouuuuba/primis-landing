# Primis Desktop Agent

> **Bridge the gap between cloud convenience and local power**

The Primis Desktop Agent is a lightweight application that runs on the user's computer, enabling their cloud-deployed OpenClaw bot to access local resources like files, camera, apps, and more.

---

## 🎯 Vision

```
"Your AI assistant lives in the cloud, but can reach into your laptop when needed."
```

**User Experience:**
1. User deploys OpenClaw via Primis (cloud) ✅ Already done
2. User downloads Primis Desktop Agent (one click)
3. Agent auto-connects to their cloud bot
4. User messages bot: "Summarize my latest PDF"
5. Bot asks local agent → Agent reads file → Bot responds

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER'S COMPUTER                              │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  PRIMIS DESKTOP AGENT                         │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │
│  │  │    File     │  │   Camera    │  │    Apps     │          │   │
│  │  │   Access    │  │   Access    │  │   Control   │          │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │   │
│  │                                                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │
│  │  │  Terminal   │  │   Screen    │  │  Clipboard  │          │   │
│  │  │   Access    │  │   Capture   │  │   Access    │          │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │              WebSocket Connection                        │ │   │
│  │  │              (Secure, Encrypted)                         │ │   │
│  │  └────────────────────────┬────────────────────────────────┘ │   │
│  └───────────────────────────┼──────────────────────────────────┘   │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         PRIMIS CLOUD                                  │
│                                                                       │
│  ┌────────────────────┐         ┌────────────────────┐              │
│  │    Agent Gateway   │◄───────►│    OpenClaw Bot    │              │
│  │  (WebSocket Hub)   │         │    (On Railway)    │              │
│  └────────────────────┘         └─────────┬──────────┘              │
│                                           │                          │
└───────────────────────────────────────────┼──────────────────────────┘
                                            │
                                            ▼
                                  ┌────────────────────┐
                                  │  Telegram/Discord  │
                                  │   (User Messages)  │
                                  └────────────────────┘
```

---

## 📦 Components

### 1. Desktop Agent (Electron/Tauri App)

**Tech Stack Options:**

| Option | Pros | Cons | Size |
|--------|------|------|------|
| **Electron** | Easy, cross-platform, JS | Heavy, resource hungry | ~150MB |
| **Tauri** | Lightweight, Rust backend | Newer, smaller ecosystem | ~10MB |
| **Native (Swift/Rust)** | Best performance | Platform-specific | ~5MB |

**Recommendation:** Start with **Tauri** for best balance of size and ease.

### 2. Agent Gateway (Backend Service)

New Primis service that:
- Manages WebSocket connections from desktop agents
- Routes commands from cloud bots to local agents
- Handles authentication and encryption

### 3. OpenClaw Integration

Modify deployed bots to:
- Detect when local agent is available
- Route local commands through gateway
- Fall back gracefully when agent offline

---

## 🔐 Security Model

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. PAIRING                                                  │
│     ├─ User gets pairing code from Primis dashboard         │
│     ├─ Enters code in desktop agent                         │
│     └─ Establishes encrypted channel                        │
│                                                              │
│  2. AUTHENTICATION                                           │
│     ├─ JWT tokens for API calls                             │
│     ├─ Refresh tokens with short expiry                     │
│     └─ Device fingerprinting                                │
│                                                              │
│  3. PERMISSIONS                                              │
│     ├─ User explicitly grants each capability               │
│     ├─ Files: Read-only by default                          │
│     ├─ Camera: Explicit prompt each time                    │
│     └─ Apps: Allowlist only                                 │
│                                                              │
│  4. SANDBOXING                                               │
│     ├─ File access limited to user-approved folders         │
│     ├─ No system file access                                │
│     └─ Command execution in sandbox                         │
│                                                              │
│  5. AUDIT LOG                                                │
│     ├─ Every action logged locally                          │
│     ├─ User can review what bot accessed                    │
│     └─ Revoke access anytime                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Capabilities (Phased)

### Phase 1: Files (MVP)
- [ ] Read files from approved folders
- [ ] List directory contents
- [ ] Search files by name/content
- [ ] Create/write files (with permission)

### Phase 2: Screen & Clipboard
- [ ] Take screenshots (with permission)
- [ ] Read clipboard
- [ ] Write to clipboard

### Phase 3: Camera & Audio
- [ ] Take photos
- [ ] Record short audio clips
- [ ] Voice transcription

### Phase 4: Apps (macOS focus)
- [ ] Apple Notes - read/create
- [ ] Apple Reminders - read/create
- [ ] Calendar - read events
- [ ] Contacts - search

### Phase 5: Advanced
- [ ] Terminal command execution
- [ ] Browser automation
- [ ] Smart home (Hue, Sonos)
- [ ] Screen sharing for assistance

---

## 💬 Command Protocol

### Request Format (Cloud → Agent)
```json
{
  "id": "cmd_abc123",
  "type": "file.read",
  "params": {
    "path": "~/Documents/report.pdf"
  },
  "timeout": 30000,
  "requiresPermission": true
}
```

### Response Format (Agent → Cloud)
```json
{
  "id": "cmd_abc123",
  "success": true,
  "result": {
    "content": "base64-encoded-content",
    "mimeType": "application/pdf",
    "size": 1024000
  }
}
```

### Command Types

| Category | Commands |
|----------|----------|
| **Files** | `file.read`, `file.write`, `file.list`, `file.search`, `file.delete` |
| **Screen** | `screen.capture`, `screen.region` |
| **Clipboard** | `clipboard.read`, `clipboard.write` |
| **Camera** | `camera.capture`, `camera.list` |
| **Audio** | `audio.record`, `audio.transcribe` |
| **Apps** | `app.notes.list`, `app.reminders.add`, `app.calendar.events` |
| **System** | `system.info`, `system.notify`, `terminal.exec` |

---

## 🖥️ Desktop Agent UI

### System Tray Icon
```
┌──────────────────────────────┐
│  🦞 Primis Agent             │
│  ─────────────────────────── │
│  ● Connected to: My Bot      │
│  ─────────────────────────── │
│  📁 Files: Allowed (3 folders) │
│  📷 Camera: Ask each time    │
│  📋 Clipboard: Allowed       │
│  ─────────────────────────── │
│  ⚙️ Settings                  │
│  📊 Activity Log             │
│  🔌 Disconnect               │
│  ❌ Quit                      │
└──────────────────────────────┘
```

### Settings Window
```
┌────────────────────────────────────────────────────────────────┐
│  Primis Desktop Agent                               ─ □ ✕    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  CONNECTION                                                    │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Status: 🟢 Connected                                    │ │
│  │  Bot: My Assistant (OpenClaw)                            │ │
│  │  Connected since: 2 hours ago                            │ │
│  │                                          [Disconnect]    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  PERMISSIONS                                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  📁 File Access                              [Configure] │ │
│  │     ~/Documents ✓                                        │ │
│  │     ~/Downloads ✓                                        │ │
│  │                                                          │ │
│  │  📷 Camera                                   ○ Ask  ● Off│ │
│  │  📋 Clipboard                                ● On   ○ Off│ │
│  │  🔊 Audio                                    ○ On   ● Off│ │
│  │  🖥️ Screen Capture                           ○ Ask  ● Off│ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ACTIVITY LOG                                 [View Full Log] │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  2 min ago   📁 Read ~/Documents/notes.md               │ │
│  │  5 min ago   📋 Copied text to clipboard                │ │
│  │  1 hour ago  📁 Listed ~/Downloads                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 📱 User Flow

### First Time Setup

```
1. USER DEPLOYS OPENCLAW (Already done via Primis)
   └─► Bot running on Railway

2. USER DOWNLOADS AGENT
   └─► primis.app/agent → Download for macOS/Windows/Linux

3. USER PAIRS AGENT
   ┌─────────────────────────────────────────┐
   │  Welcome to Primis Agent! 🦞            │
   │                                         │
   │  Enter your pairing code:               │
   │  ┌─────────────────────────────────┐   │
   │  │  XXXX-XXXX-XXXX                 │   │
   │  └─────────────────────────────────┘   │
   │                                         │
   │  Find this code in your Primis         │
   │  dashboard under OpenClaw settings.     │
   │                                         │
   │              [Connect]                  │
   └─────────────────────────────────────────┘

4. USER GRANTS PERMISSIONS
   ┌─────────────────────────────────────────┐
   │  What can your bot access? 🔐           │
   │                                         │
   │  ☑ Read files                           │
   │    Select folders: [Choose...]          │
   │                                         │
   │  ☐ Camera (will ask each time)          │
   │  ☑ Clipboard                            │
   │  ☐ Screen capture                       │
   │                                         │
   │  You can change these anytime.          │
   │                                         │
   │              [Finish Setup]             │
   └─────────────────────────────────────────┘

5. AGENT RUNS IN BACKGROUND
   └─► System tray icon shows connected
```

### Daily Usage

```
USER: "Hey, can you summarize the PDF I downloaded today?"

BOT (thinking): User wants file access. Let me check with local agent.

BOT → AGENT: { "type": "file.list", "params": { "path": "~/Downloads", "filter": "*.pdf" } }

AGENT → BOT: { "files": ["report-2024.pdf", "invoice.pdf"] }

BOT: "I found 2 PDFs in your Downloads:
      1. report-2024.pdf
      2. invoice.pdf
      Which one should I summarize?"

USER: "The report"

BOT → AGENT: { "type": "file.read", "params": { "path": "~/Downloads/report-2024.pdf" } }

AGENT → BOT: { "content": "base64...", "mimeType": "application/pdf" }

BOT: "Here's the summary of report-2024.pdf:
      [AI-generated summary...]"
```

---

## 📅 Development Roadmap

### Sprint DA1: Foundation (Week 1)
**Goal:** Basic agent that connects to cloud

| Task | Time | Deliverable |
|------|------|-------------|
| DA1.1 | Project setup (Tauri) | 2 hrs | Empty app builds |
| DA1.2 | WebSocket client | 4 hrs | Connects to server |
| DA1.3 | Agent Gateway backend | 4 hrs | Routes messages |
| DA1.4 | Pairing flow | 4 hrs | Code-based pairing |
| DA1.5 | System tray UI | 2 hrs | Basic tray menu |

**Deliverable:** Agent connects and shows "online"

---

### Sprint DA2: File Access (Week 2)
**Goal:** Bot can read/list files

| Task | Time | Deliverable |
|------|------|-------------|
| DA2.1 | File permission UI | 3 hrs | Folder selector |
| DA2.2 | File.list command | 2 hrs | List directories |
| DA2.3 | File.read command | 3 hrs | Read file contents |
| DA2.4 | File.search command | 3 hrs | Search by name |
| DA2.5 | OpenClaw integration | 4 hrs | Bot uses agent |

**Deliverable:** Bot can read files from user's computer

---

### Sprint DA3: Screen & Clipboard (Week 3)
**Goal:** Visual context for bot

| Task | Time | Deliverable |
|------|------|-------------|
| DA3.1 | Clipboard read/write | 2 hrs | Works |
| DA3.2 | Screenshot capture | 3 hrs | Full screen |
| DA3.3 | Region capture | 3 hrs | Selected area |
| DA3.4 | Permission prompts | 2 hrs | Ask before capture |
| DA3.5 | Activity logging | 2 hrs | All actions logged |

**Deliverable:** Bot can see user's screen when asked

---

### Sprint DA4: Polish & Distribution (Week 4)
**Goal:** Ready for beta users

| Task | Time | Deliverable |
|------|------|-------------|
| DA4.1 | Settings UI | 4 hrs | Full settings |
| DA4.2 | Auto-update | 3 hrs | Self-updating |
| DA4.3 | Code signing | 2 hrs | No security warnings |
| DA4.4 | Landing page | 3 hrs | Download page |
| DA4.5 | Docs & guides | 3 hrs | User documentation |

**Deliverable:** Public beta release

---

## 💰 Business Model Impact

### With Desktop Agent

| Feature | Cloud Only | + Desktop Agent |
|---------|------------|-----------------|
| Chat AI | ✅ | ✅ |
| Skills/Knowledge | ✅ | ✅ |
| File access | ❌ | ✅ |
| Screen context | ❌ | ✅ |
| App control | ❌ | ✅ |
| Smart home | ❌ | ✅ (Phase 5) |

### Pricing Tiers

| Tier | Price | Features |
|------|-------|----------|
| **Starter** | $30/mo | Cloud only |
| **Pro** | $50/mo | + Desktop Agent |
| **Team** | $100/mo | + Multi-device, Admin |

### Revenue Projection

| Users | Starter | Pro | Monthly Revenue |
|-------|---------|-----|-----------------|
| 100 | 70 | 30 | $3,600 |
| 500 | 300 | 200 | $19,000 |
| 1000 | 500 | 500 | $40,000 |

---

## ⚠️ Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Security breach** | Critical | Sandboxing, audit logs, permissions |
| **Platform approval** | High | Follow macOS/Windows guidelines |
| **Performance issues** | Medium | Lightweight Tauri, efficient protocol |
| **User confusion** | Medium | Clear onboarding, good docs |
| **Maintenance burden** | Medium | Auto-updates, cross-platform framework |

---

## 🏁 Success Metrics

| Metric | Target (Month 1) | Target (Month 3) |
|--------|------------------|------------------|
| Agent downloads | 100 | 500 |
| Daily active agents | 50 | 300 |
| File commands/day | 500 | 5,000 |
| Pro tier conversions | 20% | 35% |
| User satisfaction | 4.0/5 | 4.5/5 |

---

## 📋 Summary

**The Desktop Agent transforms OpenClaw from a "cloud chatbot" into a "true AI assistant" that can:**

1. ✅ Read your files
2. ✅ See your screen
3. ✅ Control your apps
4. ✅ Access your clipboard
5. ✅ (Future) Control smart home

**Development time:** ~4 weeks for MVP  
**Impact:** Massive differentiation from competitors  
**Revenue potential:** +$20/user/month for Pro tier

---

*Last updated: February 4, 2026*  
*Status: Scoped, Ready for Development*  
*"Your AI, everywhere you need it."*
