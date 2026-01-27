# LLM Provider Architecture

**Version**: 1.0
**Last Updated**: 2026-01-27
**Status**: Complete (Phase 3.5)

---

## Overview

Pact supports multiple LLM providers through a unified abstraction layer, enabling intelligent model selection, cross-provider fallback, and comprehensive cost tracking.

### Supported Providers

| Provider | Type | Best For |
|----------|------|----------|
| **OpenAI** | Cloud | GPT-5 family - reasoning, high-throughput tasks |
| **Anthropic** | Cloud | Claude models - complex agents, coding |
| **Ollama** | Local | Privacy-sensitive tasks, cost-free operation |

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        LLM Module                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   LLMService │───▶│ ModelRouter  │───▶│   Provider   │       │
│  │  (Facade)    │    │ (Selection)  │    │   Registry   │       │
│  └──────────────┘    └──────────────┘    └──────┬───────┘       │
│                                                  │               │
│                    ┌─────────────────────────────┼───────────┐  │
│                    │                             │           │  │
│                    ▼                             ▼           ▼  │
│           ┌──────────────┐            ┌──────────────┐  ┌─────┐ │
│           │   OpenAI     │            │  Anthropic   │  │Ollama│ │
│           │   Provider   │            │   Provider   │  │     │ │
│           └──────────────┘            └──────────────┘  └─────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Provider Interface (`LLMProvider`)

All providers implement a common interface:

```typescript
interface LLMProvider {
  name: LLMProviderType;
  supportedModels: string[];

  invoke(request: ProviderRequest): Promise<ProviderResponse>;
  getTokenCount(text: string): number;
  isAvailable(): Promise<boolean>;
  getModelCapabilities(model: string): ModelCapabilities;
}
```

#### 2. Provider Registry

Manages provider instances with:
- Lazy initialization (providers init on first use)
- Health caching (avoid repeated connection checks)
- Provider status monitoring

```typescript
class ProviderRegistry {
  getProvider(name: LLMProviderType): LLMProvider;
  getProviderStatuses(): ProviderStatus[];
  getAllAvailableModels(): ModelInfo[];
  getModelCapabilities(model: string): ModelCapabilities;
}
```

#### 3. Model Router

Intelligent model selection based on:
- Task type (atomization, refinement, chat, etc.)
- Budget mode (normal, economy, strict)
- Provider availability
- Cost constraints

```typescript
class ModelRouter {
  selectModel(taskType: AgentTaskType, budgetMode?: BudgetMode): ModelSelection;
  getRecommendedModels(taskType: AgentTaskType, budgetMode?: BudgetMode): ModelRecommendation[];
  estimateTaskCost(taskType: AgentTaskType, inputTokens: number, outputTokens: number): CostEstimate;
}
```

---

## Provider Details

### OpenAI Provider

**Models**:
- `gpt-5.2` - Flagship reasoning and agentic tasks
- `gpt-5.2-codex` - Agentic coding workflows
- `gpt-5-mini` - Cost-optimized reasoning
- `gpt-5-nano` - High-throughput, classification ($0.05/$0.40 per 1M tokens)

**Features**:
- Reasoning effort control (`none`, `low`, `medium`, `high`, `xhigh`)
- Verbosity control
- Function calling support
- Responses API support

**Configuration**:
```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano  # Default
```

### Anthropic Provider

**Models**:
- `claude-sonnet-4-5-20250929` - Best for complex agents and coding ($3/$15)
- `claude-opus-4-5-20250929` - Maximum intelligence ($5/$25)
- `claude-haiku-4-5-20250929` - Fast, real-time ($1/$5)

**Features**:
- Native tool use
- Prompt caching (90% savings on cache reads)
- 1M token context window
- Batch API (50% discount)

**Configuration**:
```env
ANTHROPIC_API_KEY=sk-ant-...
```

### Ollama Provider

**Models**:
- `llama3.2` - General tasks (default)
- `llama3.3` - High-quality assistant
- `qwen2.5-coder` - Code generation
- `codellama` - Code-specific tasks
- `mistral-small-3.1` - Fast local inference

**Features**:
- Local execution (no API costs)
- Privacy-preserving
- Auto-detect available models
- Configurable endpoint

**Configuration**:
```env
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.2
```

---

## Model Selection Strategy

### Default Routing Rules

| Task Type | Primary | Fallback | Rationale |
|-----------|---------|----------|-----------|
| **Atomization** | Claude Sonnet ($3/$15) | GPT-5 Mini | Sonnet excels at structured analysis |
| **Refinement** | Claude Haiku ($1/$5) | GPT-5 Nano | Fast, cheap iterations |
| **Translation** | Ollama (free) | Claude Haiku | Privacy first for format conversion |
| **Analysis** | Claude Sonnet ($3/$15) | GPT-5.2 | Deep codebase understanding |
| **Chat** | Claude Haiku ($1/$5) | GPT-5 Nano | Fast, conversational |
| **Code Generation** | Ollama (free) | GPT-5 Nano | Privacy + cost efficiency |
| **Classification** | GPT-5 Nano ($0.05/$0.40) | Ollama | Cheapest cloud option |
| **Summarization** | GPT-5 Nano ($0.05/$0.40) | Ollama | High-throughput, simple task |

### Budget Modes

1. **Normal**: Balance between cost and quality
2. **Economy**: Prefer cheaper models (Ollama, GPT-5 Nano)
3. **Strict**: Use only free/local models when possible

### Fallback Strategy

When a provider fails:
1. Try next model from same provider
2. Try primary model from fallback provider
3. Try any available model
4. Return error with details

---

## Resilience Patterns

### Circuit Breaker

Per-provider circuit breaker prevents cascading failures:

```typescript
const circuitBreakerConfig = {
  failureThreshold: 5,      // Open after 5 failures
  successThreshold: 2,       // Close after 2 successes
  timeout: 30000,            // 30s timeout per request
  halfOpenRetries: 1,        // Test with 1 request when half-open
};
```

### Retry Logic

Exponential backoff with jitter:

```typescript
const retryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};
```

### Rate Limiting

Per-provider rate limits:

```typescript
const rateLimits = {
  openai: { requestsPerMinute: 60, tokensPerMinute: 90000 },
  anthropic: { requestsPerMinute: 60, tokensPerMinute: 100000 },
  ollama: { requestsPerMinute: 100 }, // Local, less restrictive
};
```

---

## Cost Tracking

### Usage Tracking Entity

```typescript
@Entity('llm_usage_tracking')
class LLMUsageTracking {
  provider: LLMProviderType;
  modelName: string;
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  totalCost: number;
  latencyMs: number;
  success: boolean;
  cacheHit: boolean;
  createdAt: Date;
}
```

### Cost Calculation

```typescript
const cost =
  inputTokens * capabilities.costPerInputToken +
  outputTokens * capabilities.costPerOutputToken;
```

### Budget Controls

- Daily and monthly limits
- Warning threshold (default: 80%)
- Hard stop option (block requests when exceeded)
- Alert email notifications

---

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/llm/providers` | GET | List providers with status |
| `/llm/models` | GET | List models with capabilities |
| `/llm/usage/summary` | GET | Usage statistics |
| `/llm/usage/trends` | GET | Trend data for charts |
| `/llm/estimate` | POST | Estimate cost for operation |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/llm/config` | GET | Get configuration |
| `/admin/llm/config` | PUT | Update configuration |
| `/admin/llm/providers/:provider` | PATCH | Update provider config |
| `/admin/llm/budget` | PATCH | Update budget config |
| `/admin/llm/test-provider` | POST | Test provider connectivity |

---

## Configuration

### Database Configuration

LLM configuration is stored in `llm_configurations` table:

```typescript
@Entity('llm_configurations')
class LLMConfiguration {
  id: UUID;
  isActive: boolean;
  providerConfigs: Record<string, ProviderConfig>;
  modelPreferences: ModelPreference[];
  budgetConfig: BudgetConfig;
  defaultBudgetMode: BudgetMode;
  preferLocalModels: boolean;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
}
```

### Environment Variables

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-nano

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Ollama
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama3.2

# Routing
LLM_ROUTING_MODE=rule_based
LLM_PREFER_LOCAL=false
```

---

## Best Practices

### Cost Optimization

1. **Use local models** for privacy-sensitive tasks
2. **Use GPT-5 Nano** for simple classification/summarization
3. **Reserve Claude Sonnet** for complex agent workflows
4. **Enable caching** to reduce repeated requests
5. **Set budget limits** to prevent overruns

### Reliability

1. **Configure fallback chains** for critical operations
2. **Monitor provider health** via dashboard
3. **Test connections** before production deployment
4. **Review circuit breaker** states during incidents

### Security

1. **Store API keys securely** (environment variables, not code)
2. **Use local models** when data privacy is required
3. **Enable hard stop** for budget control in production
4. **Audit usage logs** regularly

---

## Related Documentation

- [docs/implementation-checklist-phase3.5.md](../implementation-checklist-phase3.5.md) - Implementation details
- [docs/user-guide/configuring-llm.md](../user-guide/configuring-llm.md) - Configuration guide
- [docs/user-guide/using-agents.md](../user-guide/using-agents.md) - Agent usage guide

---

*This document describes the multi-provider LLM architecture introduced in Phase 3.5.*
