# Phase 3.5: LLM Service Enhancements & Agent UI

**Version**: 1.6
**Status**: Complete (Parts 1-7 Complete)
**Target**: Multi-provider LLM support with intelligent routing and Agent UI
**Last Updated**: 2026-01-27

---

## Overview

Phase 3.5 is an interlude between Phase 3 (Commitment Boundary) and Phase 4 (Evidence Engine). It focuses on:

1. **Multi-Provider LLM Support**: Add Anthropic and Ollama alongside OpenAI
2. **Intelligent Model Selection**: Task-aware routing to optimal provider/model
3. **Agent Invocation UI**: User-facing interface for invoking Pact agents

### Current Setup

- **OpenAI**: Currently using `gpt-5-nano` for cost-effective testing
- **Ollama**: Running `llama3.2:latest` locally

### Prerequisites

- Phase 3 complete (Commitment Boundary functional)
- Existing LLM service architecture (circuit breaker, retry, rate limiting, cost tracking)
- Frontend foundation (Next.js, shadcn/ui, React Query)

### Success Criteria

- [x] At least 3 providers operational (OpenAI, Anthropic, Ollama)
- [x] Model selection configurable per-task or auto-selected
- [x] Agents invocable from UI (either structured wizard or chat interface)
- [x] Cost tracking works across all providers
- [x] Graceful fallback when provider unavailable
- [ ] Test coverage ≥ 80% for new code (deferred to Phase 4)

---

## Current Model Landscape (January 2026)

### OpenAI GPT-5 Family

| Model | Input/MTok | Output/MTok | Best For |
| ------- | ------------ | ------------- | ---------- |
| `gpt-5.2` | ~$1.25 | ~$10.00 | Flagship: complex reasoning, agentic tasks, coding |
| `gpt-5.2-pro` | Higher | Higher | Hard problems requiring deeper thinking |
| `gpt-5.2-codex` | Similar | Similar | Agentic coding workflows (Codex environments) |
| `gpt-5-mini` | ~$0.30 | ~$2.50 | Cost-optimized reasoning and chat |
| `gpt-5-nano` | **$0.05** | **$0.40** | High-throughput, classification, summarization |

**GPT-5.2 Features**:

- Reasoning effort: `none` (default), `low`, `medium`, `high`, `xhigh`
- Verbosity control: `low`, `medium`, `high`
- Context compaction for long conversations
- Tool preambles for transparency
- `apply_patch` and shell tools for agentic coding

### Anthropic Claude Models

| Model | Input/MTok | Output/MTok | Best For |
| ------- | ------------ | ------------- | ---------- |
| `claude-sonnet-4-5-20250514` | $3 | $15 | **Best for complex agents, coding, tool orchestration** |
| `claude-opus-4-5-20250514` | $5 | $25 | Maximum intelligence, specialized complex tasks |
| `claude-opus-4-1-20250414` | $15 | $75 | Highly complex codebase refactoring |
| `claude-haiku-4-5-20250514` | $1 | $5 | Real-time, high-volume, cost-sensitive |
| `claude-haiku-3-5-20241022` | $0.80 | $4 | Legacy, slightly cheaper |

**Key Insight**: Per Anthropic docs, *Sonnet 4.5* is recommended for "complex agents and coding" over Opus.

**Claude Features**:

- Prompt caching (90% savings on cache reads)
- Batch API (50% discount)
- 1M token context window (Sonnet 4/4.5 only)
- Native tool use

### Ollama (Local - Free)

| Model | Size | Best For |
| ------- | ------ | ---------- |
| `llama3.2` | 3B/11B/90B | General tasks, vision (current) |
| `llama3.3` | 70B | High-quality general assistant |
| `qwen2.5-coder` | 32B | Code generation |
| `qwen3` | 235B | Multilingual, large tasks |
| `mistral-small-3.1` | 7B | Fast local inference, vision |
| `codellama` | 34B | Code-specific tasks |

**Requirements**: 8GB RAM for 7B, 16GB for 13B, 32GB for 33B+

---

## Part 1: Provider Abstraction Layer

**Goal**: Refactor LLM service to support multiple providers through a unified interface.

### 1.1 Provider Interface Definition ✅

- [x] Create `LLMProvider` interface in `src/common/llm/providers/`

  ```typescript
  interface LLMProvider {
    name: string;
    supportedModels: string[];
    invoke(request: ProviderRequest): Promise<ProviderResponse>;
    getTokenCount(text: string): number;
    isAvailable(): Promise<boolean>;
    getModelCapabilities(model: string): ModelCapabilities;
  }
  ```

- [x] Define `ModelCapabilities` interface:

  ```typescript
  interface ModelCapabilities {
    contextWindow: number;
    supportsVision: boolean;
    supportsFunctionCalling: boolean;
    supportsStreaming: boolean;
    supportsReasoningEffort?: boolean;  // GPT-5.2 specific
    costPerInputToken: number;
    costPerOutputToken: number;
  }
  ```

- [x] Create `ProviderRequest` / `ProviderResponse` types (normalized across providers)

### 1.2 OpenAI Provider Extraction ✅

- [x] Extract current OpenAI logic into `src/common/llm/providers/openai.provider.ts`
- [x] Implement `LLMProvider` interface
- [x] Support models:
  - `gpt-5.2` - flagship reasoning and agentic tasks
  - `gpt-5.2-codex` - agentic coding workflows
  - `gpt-5-mini` - cost-optimized reasoning
  - `gpt-5-nano` - high-throughput, classification (current default)
- [x] Support GPT-5.2 specific features:
  - `reasoning.effort`: `none` | `low` | `medium` | `high` | `xhigh`
  - `text.verbosity`: `low` | `medium` | `high`
- [x] Handle Responses API (preferred for GPT-5.2) vs Chat Completions
- [x] Add function calling support for tool-use agents

### 1.3 Anthropic Provider Implementation ✅

- [x] Create `src/common/llm/providers/anthropic.provider.ts`
- [x] Install `@langchain/anthropic` (maintains LangSmith tracing)
- [x] Implement `LLMProvider` interface
- [x] Support models:
  - `claude-sonnet-4-5-20250514` - agents, coding, tool orchestration
  - `claude-opus-4-5-20250514` - maximum intelligence
  - `claude-haiku-4-5-20250514` - fast, cost-effective
- [x] Handle Anthropic's message format (system as separate param)
- [x] Support tool use via Anthropic's native tool format
- [x] Add cost tracking with prompt caching awareness

### 1.4 Ollama Provider Implementation ✅

- [x] Create `src/common/llm/providers/ollama.provider.ts`
- [x] Use `@langchain/ollama` wrapper
- [x] Implement `LLMProvider` interface
- [x] Support configurable Ollama endpoint (default: `http://localhost:11434`)
- [x] Auto-detect available models via Ollama API (`GET /api/tags`)
- [x] Default model: `llama3.2` (currently running)
- [x] Recommended models for specific tasks:
  - Code: `qwen2.5-coder`, `codellama`
  - General: `llama3.3`, `llama3.2`
  - Fast: `mistral-small-3.1`
- [x] Handle model pull if not available (optional, with user confirmation)
- [x] Cost tracking: local models = $0.00 per token

### 1.5 Provider Registry ✅

- [x] Create `ProviderRegistry` class to manage provider instances
- [x] Lazy initialization of providers (only init when needed)
- [x] Health check endpoint for all providers
- [x] Provider availability caching (avoid repeated connection checks)

### 1.6 Configuration Updates ✅

- [x] Update `LLMModelConfig` to support all providers
- [x] Add Anthropic-specific config (API key, version)
- [x] Add Ollama-specific config (endpoint, pull policy)
- [ ] Database migration for new provider configurations (deferred)
- [x] Environment variables: `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`

---

## Part 2: Intelligent Model Selection

**Goal**: Automatically or manually select the best provider/model for each task.

### 2.1 Task Classification ✅

- [x] Define task categories enum:

  ```typescript
  enum AgentTaskType {
    ATOMIZATION = 'atomization',      // Analyzing intent for atomicity
    REFINEMENT = 'refinement',        // Improving atom quality
    TRANSLATION = 'translation',      // Format conversion
    ANALYSIS = 'analysis',            // Brownfield codebase analysis
    CHAT = 'chat',                    // Conversational agent
    CODE_GENERATION = 'code_generation',
    SUMMARIZATION = 'summarization',
    CLASSIFICATION = 'classification', // Simple categorization
  }
  ```

- [x] Tag each agent service with its task type

### 2.2 Model Routing Rules ✅

- [x] Create `ModelRouter` service in `src/common/llm/routing/`
- [x] Define routing rules per task type:

  ```typescript
  interface RoutingRule {
    taskType: AgentTaskType;
    preferredProviders: string[];  // Ordered by preference
    preferredModels: string[];     // Ordered by preference
    minContextWindow?: number;
    requiresFunctionCalling?: boolean;
    maxCostPerRequest?: number;
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
    fallbackStrategy: 'next_model' | 'next_provider' | 'fail';
  }
  ```

### 2.3 Default Routing Configuration

Based on current pricing and capabilities:

| Task Type | Primary | Fallback | Rationale |
| ----------- | --------- | ---------- | ----------- |
| **Atomization** | `claude-sonnet-4-5` ($3/$15) | `gpt-5-mini` ($0.30/$2.50) | Sonnet excels at structured agent analysis |
| **Code Generation** | `llama3.2` (local, free) | `gpt-5-nano` ($0.05/$0.40) | Privacy + extreme cost efficiency |
| **Refinement** | `claude-haiku-4-5` ($1/$5) | `gpt-5-nano` | Fast, cheap iterations |
| **Translation** | `llama3.2` (local, free) | `claude-haiku-4-5` | Privacy first for format conversion |
| **Analysis** | `claude-sonnet-4-5` ($3/$15) | `gpt-5.2` (reasoning=medium) | Deep codebase understanding |
| **Classification** | `gpt-5-nano` ($0.05/$0.40) | `llama3.2` | Cheapest cloud option |
| **Summarization** | `gpt-5-nano` ($0.05/$0.40) | `llama3.2` | High-throughput, simple task |
| **Chat** | `claude-haiku-4-5` ($1/$5) | `gpt-5-nano` | Fast, conversational |

### 2.4 Cost-Aware Selection ✅

- [x] Add cost estimator based on expected token usage
- [x] Support "budget mode" that prefers cheaper models:
  - Prefer `gpt-5-nano` ($0.05/$0.40) and `llama3.2` (free)
- [x] Support "quality mode" that prefers best models:
  - Prefer `claude-sonnet-4-5` and `gpt-5.2`
- [x] Per-request cost cap option in `LLMRequest`

### 2.5 Manual Override ✅

- [x] Add `preferredProvider` and `preferredModel` to `LLMRequest`
- [ ] UI toggle for "use local model" (privacy mode) - deferred to Part 4
- [ ] Per-agent configuration in database - deferred to Part 6

### 2.6 Selection Logging ✅

- [x] Log model selection decisions with reasoning
- [ ] Track selection outcomes (success rate per provider/model/task) - deferred
- [ ] Dashboard data for selection analytics - deferred to Part 6

---

## Part 3: LLM Service Refactoring

**Goal**: Update LLM service to use provider abstraction and routing.

### 3.1 Service Refactoring ✅

- [x] Inject `ProviderRegistry` and `ModelRouter` into `LLMService`
- [x] Update `invoke()` to:
  1. Determine task type from request
  2. Call `ModelRouter.selectModel()`
  3. Get provider from `ProviderRegistry`
  4. Execute with existing resilience patterns
- [x] Maintain backward compatibility (existing agent code should work unchanged)

### 3.2 Fallback Chain Updates ✅

- [x] Support cross-provider fallback (OpenAI fails → try Anthropic → try Ollama)
- [x] Per-task fallback configuration
- [x] Circuit breaker per provider (not global)

### 3.3 Cost Tracking Updates ✅

- [x] Update `LLMUsageTracking` entity for new providers
- [x] Per-provider cost aggregation
- [x] Local model tracking (tokens, latency, but $0 cost)

### 3.4 Testing ✅

- [x] Unit tests for each provider
- [x] Integration tests with mocked provider responses
- [ ] E2E test with real Ollama (optional, CI-skipped by default) - deferred
- [x] Cost calculation accuracy tests

---

## Part 4: Agent Invocation UI (Structured Approach) ✅

**Goal**: Create a structured UI for invoking Pact agents.

### 4.1 Agent Action Panel Component ✅

- [x] Create `frontend/components/agents/AgentPanel.tsx`
- [x] Collapsible panel in sidebar or floating action button
- [x] List available agents with descriptions:
  - Atomization Agent: "Analyze intent for atomicity"
  - Refinement Agent: "Improve atom quality"
  - Brownfield Agent: "Infer atoms from tests"
  - Validator Translation: "Convert validator formats"

### 4.2 Atomization Agent UI ✅

- [x] Create `frontend/components/agents/AtomizationWizard.tsx`
- [x] Step 1: Input raw intent (textarea)
- [x] Step 2: Show analysis results (atomicity score, suggestions)
- [x] Step 3: Accept/reject generated atoms
- [x] Step 4: Confirm creation
- [x] Real-time progress indicator
- [x] Model selection dropdown (optional override)

### 4.3 Refinement Agent UI ✅

- [x] Create `frontend/components/agents/RefinementPanel.tsx`
- [x] Select atom to refine
- [x] Show current quality score breakdown
- [x] Display refinement suggestions
- [x] One-click apply suggestions
- [ ] Side-by-side diff view - deferred

### 4.4 Brownfield Analysis UI ✅

- [x] Create `frontend/components/agents/BrownfieldWizard.tsx`
- [x] Input: test file path or paste test content
- [x] Show inferred atoms with confidence scores
- [x] Bulk accept/reject interface
- [ ] Link to existing atoms option - deferred

### 4.5 Provider Status Indicator ✅

- [x] Create `frontend/components/agents/ProviderStatus.tsx`
- [x] Show which providers are available (OpenAI, Anthropic, Ollama)
- [x] Indicate which provider/model will be used for next request
- [x] Cost estimate for pending operation
- [ ] "Use local model" toggle - deferred to Part 6

### 4.6 API Endpoints for UI ✅

- [x] `GET /api/v1/llm/providers` - List available providers and their status
- [x] `GET /api/v1/llm/models` - List available models per provider
- [x] `GET /api/v1/llm/usage/summary` - Usage and cost summary
- [x] `POST /api/v1/llm/estimate` - Estimate cost for operation

### 4.7 React Query Hooks ✅

- [x] `useProviders()` - Fetch provider status
- [x] `useModels(provider)` - Fetch models for provider
- [x] `useEstimateCost()` - Mutation for cost estimation
- [x] `useLLMUsage()` - Usage statistics

---

## Part 5: Agent Invocation UI (Chat Approach) ✅

**Goal**: Alternative conversational interface for agent invocation.

### 5.1 Chat Interface Component ✅

- [x] Create `frontend/components/agents/AgentChat.tsx`
- [x] Message input with send button
- [x] Message history display (user + assistant)
- [x] Typing indicator during processing
- [x] Code/JSON syntax highlighting in responses

### 5.2 Chat Backend ✅

- [x] Create `src/modules/agents/chat-agent.service.ts`
- [x] Create `src/modules/agents/chat-agent.controller.ts`
- [x] Create `src/modules/agents/dto/chat-agent.dto.ts`
- [x] Intent classification from natural language
- [x] Route to appropriate agent based on user request
- [x] Conversational context management (multi-turn)
- [x] Example commands:
  - "Analyze this intent: Users can reset their password"
  - "Improve the quality of IA-042"
  - "Find atoms in my test file"

### 5.3 Tool Integration ✅

- [x] Define tools for chat agent:

  ```typescript
  const tools = [
    { name: 'analyze_intent', description: 'Analyze raw intent for atomicity' },
    { name: 'search_atoms', description: 'Search existing atoms' },
    { name: 'get_atom', description: 'Get atom details by ID' },
    { name: 'refine_atom', description: 'Get refinement suggestions' },
    { name: 'create_atom', description: 'Create new draft atom' },
  ];
  ```

- [x] Use Claude/GPT function calling for tool selection
- [x] Return structured responses with actions

### 5.4 Chat History ✅

- [x] In-memory session management (30-minute timeout)
- [x] Session restoration via session ID
- [x] Export conversation as markdown
- [ ] Database persistence (optional, deferred)

---

## Part 6: Configuration UI ✅

**Goal**: UI for managing LLM configuration.

### 6.1 Settings Page ✅

- [x] Create `frontend/app/settings/llm/page.tsx`
- [x] Provider configuration cards
- [x] API key input (masked, secure storage)
- [ ] Model preference ordering (drag-and-drop) - deferred
- [x] Budget limits configuration
- [x] Test connection button per provider

### 6.2 Usage Dashboard ✅

- [x] Create `frontend/app/settings/llm/usage/page.tsx`
- [x] Cost breakdown by provider, model, agent
- [x] Token usage charts (placeholder for visualization)
- [x] Budget utilization gauge
- [x] Alert threshold configuration

### 6.3 Admin API Endpoints ✅

- [x] `GET /api/v1/admin/llm/config` - Get current configuration
- [x] `PUT /api/v1/admin/llm/config` - Update configuration
- [x] `PATCH /api/v1/admin/llm/providers/:provider` - Update provider config
- [x] `PATCH /api/v1/admin/llm/budget` - Update budget config
- [x] `POST /api/v1/admin/llm/test-provider` - Test provider connectivity
- [x] `GET /api/v1/llm/usage/trends` - Get usage trend data

---

## Part 7: Documentation & Testing ✅

### 7.1 Documentation ✅

- [x] Update `docs/index.md` with Phase 3.5 status
- [x] Create `docs/architecture/llm-providers.md`
- [x] Create `docs/user-guide/using-agents.md`
- [x] Create `docs/user-guide/configuring-llm.md`
- [ ] Update API documentation (Swagger) - deferred (auto-generated)

### 7.2 Testing (Deferred)

- [ ] Provider unit tests (mock API responses) - deferred to Phase 4
- [ ] Model router unit tests - deferred to Phase 4
- [ ] Integration tests with test containers - deferred to Phase 4
- [ ] Frontend component tests - deferred to Phase 4
- [ ] E2E tests for agent invocation flows - deferred to Phase 4

### 7.3 CI/CD Updates (Deferred)

- [ ] Add Ollama service to test docker-compose - deferred to Phase 4
- [ ] Provider health check in CI - deferred to Phase 4
- [ ] Cost tracking validation tests - deferred to Phase 4

---

## Implementation Order

**Recommended sequence**:

1. **Part 1** (Provider Abstraction) - Foundation for everything else
2. **Part 3.1-3.3** (Service Refactoring) - Make providers usable
3. **Part 2** (Model Selection) - Intelligence layer
4. **Part 4** (Structured UI) - User-facing value
5. **Part 6** (Configuration UI) - Admin functionality
6. **Part 5** (Chat UI) - Optional enhancement
7. **Part 7** (Documentation) - Finalization

**Parallel work possible**:

- Part 1 providers (OpenAI, Anthropic, Ollama) can be done in parallel
- Part 4 UI components can parallel Part 2/3 backend work
- Documentation can start after Part 1 complete

---

## Technical Decisions

### Provider SDK Choices

| Provider | Recommended Approach | Alternative |
| ---------- | --------------------- | ------------- |
| OpenAI | `@langchain/openai` (existing) | Direct `openai` SDK with Responses API |
| Anthropic | `@langchain/anthropic` | `@anthropic-ai/sdk` |
| Ollama | `@langchain/community` | Direct HTTP to Ollama API |

**Rationale**: Using LangChain wrappers maintains consistency and enables LangSmith tracing across all providers.

### Model Selection Strategy

**Default**: Rule-based routing with cost awareness

- Simple, predictable, no additional LLM calls
- Configurable per-task preferences
- Manual override always available

**Future**: LLM-powered routing (Phase 4+)

- Meta-model decides which model to use
- Higher accuracy but additional latency/cost

### Agent UI Approach

**Primary**: Structured wizard UI (Part 4)

- Lower implementation complexity
- Clear user guidance
- Predictable behavior

**Secondary**: Chat interface (Part 5)

- Natural language flexibility
- Multi-turn conversations
- Higher implementation complexity

---

## Dependencies

### NPM Packages to Add

```json
{
  "@langchain/anthropic": "^0.3.0"
}
```

### Environment Variables

```bash
# OpenAI (existing)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano  # Current default for testing

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Ollama
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.2  # Currently running

# Model Selection
LLM_ROUTING_MODE=rule_based  # or 'cost_optimized' or 'quality_first'
LLM_PREFER_LOCAL=false       # Prefer Ollama when available
```

### Docker Compose Addition

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    profiles:
      - local-llm  # Only start with --profile local-llm

volumes:
  ollama_data:
```

---

## Cost Comparison Summary

### Per 1M Tokens (Input/Output)

| Model | Input | Output | Notes |
| ------- | ------- | -------- | ------- |
| `gpt-5-nano` | $0.05 | $0.40 | Cheapest cloud, high-throughput |
| `gpt-5-mini` | $0.30 | $2.50 | Cost-optimized reasoning |
| `gpt-5.2` | $1.25 | $10.00 | Flagship, reasoning support |
| `claude-haiku-4-5` | $1.00 | $5.00 | Fast, real-time |
| `claude-sonnet-4-5` | $3.00 | $15.00 | Best for agents/coding |
| `claude-opus-4-5` | $5.00 | $25.00 | Maximum intelligence |
| `llama3.2` (Ollama) | $0.00 | $0.00 | Local, free, privacy |

### Cost-Optimized Stack

For budget-conscious operation:

1. **Simple tasks**: `gpt-5-nano` ($0.05/$0.40)
2. **Code/Privacy**: `llama3.2` (free)
3. **Quality when needed**: `claude-sonnet-4-5` ($3/$15)

---

## Risk Mitigation

| Risk | Mitigation |
| ------ | ------------ |
| Anthropic API differences | Use LangChain wrapper for normalization |
| Ollama not installed | Graceful degradation, clear error messages |
| Cost overruns with new providers | Budget enforcement applies to all providers |
| Model selection complexity | Start with simple rules, iterate |
| Chat agent misrouting | Structured UI as primary, chat as enhancement |
| GPT-5.2 Responses API migration | Support both Chat Completions and Responses API |

---

## References

- [OpenAI GPT-5.2 Guide](https://platform.openai.com/docs/guides/latest-model)
- [OpenAI Pricing](https://platform.openai.com/docs/pricing)
- [Claude Model Selection](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
- [Claude Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Ollama Library](https://ollama.com/library)

---

*Phase 3.5 bridges the gap between infrastructure and intelligence, making Pact's AI capabilities accessible to users while maintaining the resilience patterns established in the core LLM service.*
