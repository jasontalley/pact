# LLM Module

Global module providing LLM services to all parts of the application.

## Overview

The LLM module is marked as `@Global()` so it's automatically available to all modules without explicit import. It provides:

- **ProviderRegistry** - Manages LLM providers (OpenAI, Anthropic, Ollama)
- **ModelRouter** - Intelligent model selection based on task type
- **LLMService** - Main service for LLM invocation with resilience patterns

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       LLM Module                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────┐    ┌────────────────┐                   │
│  │ LLMController  │    │LLMAdminController│                  │
│  │ (public API)   │    │ (admin API)    │                   │
│  └───────┬────────┘    └───────┬────────┘                   │
│          │                     │                             │
│          └──────────┬──────────┘                             │
│                     │                                        │
│          ┌──────────▼──────────┐                             │
│          │     LLMService      │                             │
│          │ (invoke, stream)    │                             │
│          └──────────┬──────────┘                             │
│                     │                                        │
│     ┌───────────────┼───────────────┐                        │
│     │               │               │                        │
│  ┌──▼───┐     ┌────▼────┐     ┌────▼────┐                   │
│  │Model │     │Provider │     │ Usage   │                   │
│  │Router│     │Registry │     │Tracking │                   │
│  └──────┘     └─────────┘     └─────────┘                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Components

### ProviderRegistry

Manages available LLM providers:

```typescript
class ProviderRegistry {
  // Get provider instance
  getProvider(name: string): LLMProvider;

  // List available providers
  listProviders(): ProviderInfo[];

  // Check provider health
  checkHealth(name: string): Promise<HealthStatus>;
}
```

Supported providers:
- **OpenAI** - GPT-4, GPT-3.5-turbo
- **Anthropic** - Claude 3 Opus, Sonnet, Haiku
- **Ollama** - Local models (Llama, Mistral, etc.)

### ModelRouter

Intelligent model selection based on task characteristics:

```typescript
class ModelRouter {
  // Route to appropriate model
  route(task: TaskCharacteristics): ModelSelection;

  // Configure routing rules
  setRoutingConfig(config: RoutingConfig): void;
}

interface TaskCharacteristics {
  complexity: 'low' | 'medium' | 'high';
  tokenEstimate: number;
  requiresReasoning: boolean;
  latencySensitive: boolean;
}
```

### LLMService

Main service for LLM invocation:

```typescript
class LLMService {
  // Invoke LLM (non-streaming)
  invoke(request: LLMRequest): Promise<LLMResponse>;

  // Stream LLM response
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;

  // Invoke with retry and fallback
  invokeWithResilience(request: LLMRequest): Promise<LLMResponse>;
}

interface LLMRequest {
  messages: ChatMessage[];
  model?: string;          // Override routing
  temperature?: number;
  maxTokens?: number;
  agentName?: string;      // For tracking/logging
  purpose?: string;        // For tracking/logging
}
```

## Entities

### LLMConfiguration

Stores LLM configuration:

```typescript
interface LLMConfiguration {
  id: string;
  provider: string;       // openai, anthropic, ollama
  model: string;
  apiKey?: string;        // Encrypted
  baseUrl?: string;       // For Ollama or custom endpoints
  isDefault: boolean;
  settings: {
    temperature?: number;
    maxTokens?: number;
    // ... other settings
  };
}
```

### LLMUsageTracking

Tracks LLM usage for monitoring and cost analysis:

```typescript
interface LLMUsageTracking {
  id: string;
  provider: string;
  model: string;
  agentName?: string;
  purpose?: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
}
```

## API Endpoints

### Public API (LLMController)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/llm/providers` | List available providers |
| GET | `/llm/providers/:name/health` | Check provider health |
| GET | `/llm/models` | List available models |
| GET | `/llm/usage` | Get usage statistics |
| GET | `/llm/usage/by-agent` | Usage breakdown by agent |

### Admin API (LLMAdminController)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/llm/admin/configurations` | List configurations |
| POST | `/llm/admin/configurations` | Create configuration |
| PATCH | `/llm/admin/configurations/:id` | Update configuration |
| DELETE | `/llm/admin/configurations/:id` | Delete configuration |
| POST | `/llm/admin/configurations/:id/test` | Test configuration |

## Resilience Patterns

The LLM service includes:

- **Retry** - Automatic retry on transient failures
- **Fallback** - Fall back to alternative provider/model on failure
- **Circuit Breaker** - Prevent cascade failures
- **Rate Limiting** - Respect provider rate limits
- **Timeout** - Cancel long-running requests

## Environment Variables

```bash
# Provider API keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434

# Default settings
LLM_DEFAULT_PROVIDER=anthropic
LLM_DEFAULT_MODEL=claude-sonnet-4-5
LLM_DEFAULT_TEMPERATURE=0.7
LLM_DEFAULT_MAX_TOKENS=4096
```

## File Structure

```
llm/
├── llm.module.ts               # NestJS module (Global)
├── llm.controller.ts           # Public API
├── llm-admin.controller.ts     # Admin API
├── llm-configuration.entity.ts # Configuration entity
├── llm-usage-tracking.entity.ts # Usage tracking entity
└── dto/
    └── llm-configuration.dto.ts
```

## Common Module (`common/llm/`)

The actual LLM logic lives in `src/common/llm/`:

```
common/llm/
├── llm.service.ts              # Main LLM service
├── providers/
│   ├── provider-registry.ts    # Provider management
│   ├── openai.provider.ts
│   ├── anthropic.provider.ts
│   └── ollama.provider.ts
└── routing/
    └── model-router.ts         # Intelligent routing
```

## Usage in Other Modules

Since LLMModule is global, just inject LLMService:

```typescript
@Injectable()
export class MyService {
  constructor(private readonly llmService: LLMService) {}

  async analyze(content: string) {
    const response = await this.llmService.invoke({
      messages: [{ role: 'user', content: `Analyze: ${content}` }],
      agentName: 'MyService',
      purpose: 'Content analysis',
    });
    return response.content;
  }
}
```

## Related Modules

- **agents** - Uses LLM for graph node inference
- **validators** - Uses LLM for quality scoring
- **invariants** - Uses LLM for INV-003 ambiguity check

## See Also

- [docs/architecture/llm-providers.md](/docs/architecture/llm-providers.md)
