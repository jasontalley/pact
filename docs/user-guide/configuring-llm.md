# Configuring LLM Providers

**Version**: 1.0
**Last Updated**: 2026-01-27

---

## Overview

Pact supports multiple LLM providers to power its AI agents. This guide explains how to configure providers, manage API keys, set budget limits, and monitor usage.

---

## Accessing LLM Settings

1. Navigate to **Settings** in the sidebar
2. Click **LLM Settings**
3. Use the tabs to switch between:
   - **Providers**: Configure provider settings
   - **Budget & Limits**: Set spending controls

---

## Provider Configuration

### OpenAI

OpenAI provides the GPT-5 family of models.

**Setup:**

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. In Pact, go to **Settings > LLM > Providers**
3. Find the OpenAI card
4. Enter your API key and click **Save**
5. Click **Test Connection** to verify

**Models:**

| Model | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------|
| `gpt-5-nano` | $0.05 / $0.40 | High-throughput, classification |
| `gpt-5-mini` | $0.30 / $2.50 | Cost-optimized reasoning |
| `gpt-5.2` | $1.25 / $10.00 | Complex reasoning, agentic tasks |

**Environment Variable:**
```env
OPENAI_API_KEY=sk-...
```

### Anthropic

Anthropic provides Claude models, excellent for complex agents and coding.

**Setup:**

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. In Pact, go to **Settings > LLM > Providers**
3. Find the Anthropic card
4. Enter your API key and click **Save**
5. Click **Test Connection** to verify

**Models:**

| Model | Cost (per 1M tokens) | Best For |
|-------|---------------------|----------|
| `claude-haiku-4-5` | $1 / $5 | Fast, real-time |
| `claude-sonnet-4-5` | $3 / $15 | Complex agents, coding |
| `claude-opus-4-5` | $5 / $25 | Maximum intelligence |

**Environment Variable:**
```env
ANTHROPIC_API_KEY=sk-ant-...
```

### Ollama (Local)

Ollama runs models locally for free, private operation.

**Setup:**

1. Install Ollama from [ollama.com](https://ollama.com)
2. Start Ollama: `ollama serve`
3. Pull a model: `ollama pull llama3.2`
4. In Pact, go to **Settings > LLM > Providers**
5. Verify the endpoint (default: `http://localhost:11434`)
6. Click **Test Connection** to verify

**Models:**

| Model | Size | Best For |
|-------|------|----------|
| `llama3.2` | 3B | General tasks (default) |
| `llama3.3` | 70B | High-quality assistant |
| `qwen2.5-coder` | 32B | Code generation |
| `codellama` | 34B | Code-specific tasks |

**Environment Variable:**
```env
OLLAMA_ENDPOINT=http://localhost:11434
```

---

## Budget Controls

### Setting Limits

1. Go to **Settings > LLM > Budget & Limits**
2. Configure:
   - **Daily Limit**: Maximum spending per day (USD)
   - **Monthly Limit**: Maximum spending per month (USD)
   - **Warning Threshold**: Percentage at which to show warnings
   - **Hard Stop**: Block requests when budget exceeded

### Default Limits

| Setting | Default |
|---------|---------|
| Daily Limit | $10.00 |
| Monthly Limit | $100.00 |
| Warning Threshold | 80% |
| Hard Stop | Disabled |

### Budget Alerts

When budget utilization reaches the warning threshold:
- Visual warning appears in the UI
- Provider status shows "Near Limit" badge
- Optional email alerts (configure email in settings)

When hard stop is enabled and budget is exceeded:
- All LLM requests are blocked
- Error message: "Budget exceeded"
- Use local models to continue (free)

---

## Usage Dashboard

### Accessing the Dashboard

Navigate to **Settings > LLM > Usage Dashboard**

### Available Metrics

**Summary Cards:**
- Total requests
- Total tokens (input/output)
- Total cost
- Average latency

**Budget Status:**
- Daily utilization gauge
- Monthly utilization gauge
- Over-budget warnings

**Detailed Tables:**

| Tab | Shows |
|-----|-------|
| By Provider | Requests, success rate, tokens, cost per provider |
| By Model | Usage breakdown by model |
| By Agent | Cost and latency per agent type |

**Period Selection:**
- Today
- This Week
- This Month

---

## Model Selection

### Automatic Selection

By default, Pact automatically selects the best model based on:
- Task type (atomization, refinement, etc.)
- Budget mode
- Provider availability

### Manual Override

In agent wizards, you can manually select:
1. Click the model selector dropdown
2. Choose preferred provider and model
3. View estimated cost before proceeding

### Task-Based Routing

| Task | Default Model | Fallback |
|------|---------------|----------|
| Atomization | Claude Sonnet | GPT-5 Mini |
| Refinement | Claude Haiku | GPT-5 Nano |
| Translation | Ollama | Claude Haiku |
| Analysis | Claude Sonnet | GPT-5.2 |
| Chat | Claude Haiku | GPT-5 Nano |
| Classification | GPT-5 Nano | Ollama |

---

## Cost Optimization

### Tips

1. **Use Ollama for privacy-sensitive tasks**
   - Free, runs locally
   - No data leaves your machine

2. **Use GPT-5 Nano for simple tasks**
   - $0.05 per million input tokens
   - Good for classification, summarization

3. **Reserve premium models for complex work**
   - Claude Sonnet for agent workflows
   - GPT-5.2 for complex reasoning

4. **Enable caching**
   - Reduces repeated API calls
   - Default TTL: 1 hour

5. **Set appropriate budget limits**
   - Prevents unexpected charges
   - Use hard stop for strict control

### Cost Comparison

For 1 million tokens (typical day of heavy usage):

| Provider/Model | Cost |
|----------------|------|
| Ollama (any) | **$0.00** |
| GPT-5 Nano | ~$0.45 |
| Claude Haiku | ~$6.00 |
| Claude Sonnet | ~$18.00 |
| GPT-5.2 | ~$11.25 |

---

## Troubleshooting

### Provider Not Available

**Symptoms**: Red status indicator, "unavailable" badge

**Solutions**:
1. Check API key is valid
2. Verify network connectivity
3. For Ollama: ensure `ollama serve` is running
4. Click **Test Connection** for detailed error

### API Key Issues

**Symptoms**: "Invalid API key" or "Unauthorized" errors

**Solutions**:
1. Verify key is correctly entered (no extra spaces)
2. Check key has necessary permissions
3. Ensure key hasn't expired
4. Generate a new key if needed

### Ollama Connection Failed

**Symptoms**: Cannot connect to local Ollama

**Solutions**:
1. Start Ollama: `ollama serve`
2. Check endpoint URL (default: `http://localhost:11434`)
3. Verify firewall isn't blocking port 11434
4. Pull at least one model: `ollama pull llama3.2`

### High Latency

**Symptoms**: Slow agent responses

**Solutions**:
1. Check average latency in provider health
2. Try a different model (smaller = faster)
3. Use Ollama for faster local inference
4. Check network connectivity to cloud providers

### Budget Exceeded

**Symptoms**: Requests blocked, "Budget exceeded" message

**Solutions**:
1. Wait for next day/month period
2. Increase limits in Settings > LLM > Budget
3. Disable hard stop temporarily
4. Use Ollama (free) to continue working

---

## Environment Variables

For deployment, configure via environment variables:

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

# Budget (defaults, can be overridden in UI)
LLM_DAILY_LIMIT=10
LLM_MONTHLY_LIMIT=100
LLM_HARD_STOP=false
```

---

## API Reference

### Get Provider Status

```bash
curl http://localhost:3000/api/v1/llm/providers
```

### Get Usage Summary

```bash
curl http://localhost:3000/api/v1/llm/usage/summary?period=day
```

### Update Provider Config

```bash
curl -X PATCH http://localhost:3000/api/v1/admin/llm/providers/openai \
  -H "Content-Type: application/json" \
  -d '{"enabled": true, "defaultModel": "gpt-5-nano"}'
```

### Test Provider

```bash
curl -X POST http://localhost:3000/api/v1/admin/llm/test-provider \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai"}'
```

---

## Related Documentation

- [docs/architecture/llm-providers.md](../architecture/llm-providers.md) - Technical architecture
- [docs/user-guide/using-agents.md](using-agents.md) - Agent usage guide
- [docs/implementation-checklist-phase3.5.md](../implementation-checklist-phase3.5.md) - Implementation details

---

*Configure once, use everywhere. Pact's multi-provider LLM support ensures you always have the right tool for the job.*
