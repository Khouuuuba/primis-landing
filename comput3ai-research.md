# Comput3.AI Research

> Analysis of [Comput3.AI GitHub](https://github.com/orgs/comput3ai/repositories) for Primis inspiration

---

## 1. What is Comput3.AI?

Based on their GitHub repositories, Comput3.AI (C3) appears to be a **decentralized AI compute platform** offering:

- GPU compute infrastructure for AI workloads
- OpenAI-compatible APIs
- Ready-to-use AI tools and interfaces
- Integration with AI agent frameworks

**21 public repositories** as of January 2026.

---

## 2. Repository Breakdown

### Core Infrastructure

| Repo | Tech | Description | Relevance to Primis |
|------|------|-------------|---------------------|
| **c3-vllm** | Python | vLLM integration for high-throughput LLM serving | ⭐⭐⭐ Could use for self-hosted models |
| **vllm** | Python | Fork of vLLM (memory-efficient inference) | ⭐⭐⭐ Core inference engine |
| **c3-docker-images** | Python | Docker images for their infra | ⭐⭐ Container templates |
| **c3-node-proxy** | Go | Node proxy for routing | ⭐⭐ Load balancing inspiration |
| **c3-launcher** | Python | Workload launcher | ⭐⭐ How they start jobs |

### User Interfaces

| Repo | Tech | Description | Relevance to Primis |
|------|------|-------------|---------------------|
| **c3-open-webui** | JavaScript | AI chat interface (17k stars on original) | ⭐⭐⭐ Could fork for Chip UI |
| **comput3-webui** | JavaScript | Another AI interface fork | ⭐⭐ Similar to above |
| **tamashii-website-frontend** | TypeScript | Their website frontend | ⭐ Marketing reference |

### Ready-to-Use AI Tools (Gradio Apps)

| Repo | Tech | Description | Relevance to Primis |
|------|------|-------------|---------------------|
| **c3-whisperx-gradio** | Python | Audio transcription (WhisperX) | ⭐⭐⭐ Could offer as Primis tool |
| **c3-rembg-gradio** | Python | Background removal | ⭐⭐ Image processing tool |
| **c3-trellis-gradio** | Python | 3D generation (Trellis) | ⭐⭐ Advanced AI tool |
| **c3-unirig-gradio** | Python | Character rigging | ⭐ Niche tool |
| **c3-csm-gradio** | Python | Unknown (CSM) | ⭐ Need to investigate |
| **c3-perplexica** | TypeScript | AI search engine (Perplexity clone) | ⭐⭐⭐ Cool product idea |

### AI Agent Integrations

| Repo | Tech | Description | Relevance to Primis |
|------|------|-------------|---------------------|
| **eliza** | TypeScript | Fork of Eliza AI agent framework | ⭐⭐⭐ Agent hosting potential |
| **eliza-plugin-comput3ai** | TypeScript | C3 plugin for Eliza | ⭐⭐⭐ How to integrate with agents |
| **plugin-comput3ai-mcp** | TypeScript | MCP (Model Context Protocol) plugin | ⭐⭐ Cursor/Claude integration |

### Performance Optimization

| Repo | Tech | Description | Relevance to Primis |
|------|------|-------------|---------------------|
| **SageAttention** | CUDA | 2-5x faster attention mechanism | ⭐⭐ Performance edge |
| **c3-llamacpp** | Python | llama.cpp integration | ⭐⭐ Local model running |

### Examples & Docs

| Repo | Tech | Description | Relevance to Primis |
|------|------|-------------|---------------------|
| **c3-examples** | TypeScript | API usage examples | ⭐⭐⭐ See their API design |
| **c3-render-backend** | Python | Render backend | ⭐ Video/image rendering |

---

## 3. Key Insights for Primis

### What C3 Does Well

1. **OpenAI-Compatible API**
   - Drop-in replacement for OpenAI
   - Easy migration for developers
   - `c3-examples` shows how they structured this

2. **Pre-built AI Tools**
   - Transcription (WhisperX)
   - Background removal (rembg)
   - Search (Perplexica)
   - 3D generation (Trellis)
   - All wrapped in Gradio UIs

3. **AI Agent Integration**
   - Eliza plugin means AI agents can use C3 compute
   - MCP plugin means Cursor/Claude can use C3

4. **Open Source Everything**
   - All repos are public
   - MIT/Apache licenses
   - Community can contribute

### What Primis Could Learn

| C3 Approach | Primis Opportunity |
|-------------|-------------------|
| Pre-built Gradio tools | Could offer similar tools powered by staker compute |
| Eliza integration | Chip could be an "agent" or integrate with agents |
| OpenAI-compatible API | Make Primis API a drop-in OpenAI replacement |
| MCP plugin | Let Cursor/Claude users use Primis compute |

---

## 4. Specific Repos to Study

### 1. `c3-examples` - API Design
```
How they structure their API for launching workloads.
Could inform Primis API design.
```

### 2. `c3-open-webui` - Chat Interface
```
Fork of Open WebUI (17k stars).
Could be starting point for Chip's interface.
Already supports OpenAI API, Ollama, etc.
```

### 3. `eliza-plugin-comput3ai` - Agent Integration
```
Shows how to make compute accessible to AI agents.
Could create "primis-plugin" for Eliza.
```

### 4. `c3-whisperx-gradio` - Productized AI Tool
```
Example of a specific AI capability as a product.
Primis could offer similar tools:
- Transcription
- Image generation
- Code completion (Chip!)
```

### 5. `c3-perplexica` - AI Search
```
Perplexity clone running on C3.
Shows how to build consumer products on compute infra.
```

---

## 5. Strategic Comparison

| Aspect | Comput3.AI | Primis |
|--------|------------|--------|
| **Compute funding** | Unknown (likely VC/token) | SOL staking |
| **Target users** | AI developers, agents | Consumers (Chip), then developers |
| **First product** | API + tools | Chip (mobile app builder) |
| **Differentiation** | Decentralized compute | Staker-funded compute |
| **Crypto integration** | Eliza (AI agents) | Solana staking |

### Where Primis Can Differentiate

1. **Staker-funded compute** - Unique economic model
2. **Consumer product first** - Chip, not just API
3. **Mobile focus** - C3 doesn't have mobile-specific tools
4. **Solana-native** - Deep crypto integration, not just agent plugins

---

## 6. Ideas to Steal (Ethically)

### Immediate

| Idea | How to Apply |
|------|--------------|
| **Open WebUI fork** | Use as base for Chip's chat interface |
| **Gradio tool pattern** | Could offer transcription, image tools alongside Chip |
| **OpenAI-compatible API** | Make Primis API work with existing OpenAI clients |

### Medium Term

| Idea | How to Apply |
|------|--------------|
| **Eliza plugin** | Create `primis-plugin` for AI agent ecosystem |
| **MCP integration** | Let Cursor users route to Primis compute |
| **Perplexica-style product** | Build consumer AI products on Primis infra |

### Long Term

| Idea | How to Apply |
|------|--------------|
| **vLLM hosting** | Offer self-hosted model inference |
| **Multi-tool platform** | Chip + Transcription + Image Gen + Search |

---

## 7. Technical Stack Reference

Based on C3's repos, their stack appears to be:

```
Frontend: TypeScript (React)
Backend: Python (FastAPI likely)
Inference: vLLM, llama.cpp
UI Framework: Gradio (for quick tools)
Containerization: Docker
Proxy/Routing: Go
```

### For Chip MVP

Could adopt similar approach:
```
Frontend: React (Vite) - already have this
Backend: Node.js (Express) - already have this
AI: Claude API (initially), could add vLLM later
Preview: Expo Web
```

---

## 8. Questions to Answer

1. **How does C3 price their API?** - Need to find their pricing page
2. **What's their token/economic model?** - Is it similar to Primis staking?
3. **How many users do they have?** - Market validation
4. **Are they Solana-based?** - Eliza integration suggests crypto-native

---

## 9. Action Items

- [ ] Look at `c3-examples` code to understand their API structure
- [ ] Explore `c3-open-webui` as potential Chip UI base
- [ ] Research their pricing model
- [ ] Consider building `primis-plugin` for Eliza
- [ ] Evaluate if any Gradio tools could run on Primis

---

## 10. Summary

**Comput3.AI is doing something similar to Primis** - decentralized AI compute. Their approach:

1. Build the infrastructure (vLLM, Docker, proxy)
2. Create OpenAI-compatible API
3. Ship pre-built tools (Gradio apps)
4. Integrate with AI agents (Eliza, MCP)

**What Primis does differently:**
- Staker-funded economics (novel)
- Consumer product first (Chip)
- Mobile app focus (gap in market)

**Key repos to study:**
- `c3-open-webui` - Chat UI
- `c3-examples` - API design
- `eliza-plugin-comput3ai` - Agent integration
- `c3-whisperx-gradio` - Productized AI tool

---

*Research conducted: January 27, 2026*
*Source: [github.com/orgs/comput3ai](https://github.com/orgs/comput3ai/repositories)*
