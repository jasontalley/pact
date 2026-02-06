# Agent Evaluation Framework

This directory contains tools for evaluating and improving Pact's LLM agents.

## Quick Start

### 1. Set Up LangSmith (Observability)

Add your LangSmith API key to `.env.development`:

```bash
LANGCHAIN_API_KEY=<your-api-key-from-smith.langchain.com>
```

Then rebuild the container:

```bash
docker compose down && docker compose up -d --build
```

### 2. Run Evaluation

```bash
# Run from project root
npx ts-node bootstrap/evaluation/run-evaluation.ts
```

Or specify a custom dataset:

```bash
npx ts-node bootstrap/evaluation/run-evaluation.ts path/to/custom-dataset.json
```

## Evaluation Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Improvement Loop                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. OBSERVE (LangSmith Studio)                               │
│     └─ View traces at https://smith.langchain.com           │
│     └─ Identify failure patterns, edge cases                 │
│                                                              │
│  2. HYPOTHESIZE                                              │
│     └─ "Adding more examples will improve edge cases"        │
│     └─ "Lowering temperature will reduce hallucination"      │
│                                                              │
│  3. MODIFY                                                   │
│     └─ Update prompts in src/modules/agents/               │
│     └─ Adjust temperature, model, or system instructions    │
│                                                              │
│  4. EVALUATE                                                 │
│     └─ Run: npx ts-node bootstrap/evaluation/run-evaluation.ts │
│     └─ Compare metrics to baseline                           │
│                                                              │
│  5. DEPLOY or ITERATE                                        │
│     └─ If improved: commit changes                           │
│     └─ If not: try different approach                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Evaluation Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Atomicity Accuracy | Correct atomic/non-atomic classification | > 90% |
| Category Accuracy | Correct category assignment | > 85% |
| Confidence Calibration | 90% confidence → 90% correct | r² > 0.8 |
| Avg Latency | Response time per evaluation | < 5s |

## Dataset Format

```json
{
  "name": "dataset-name",
  "version": "1.0.0",
  "examples": [
    {
      "id": "unique-id",
      "input": "User intent to evaluate",
      "expected": {
        "isAtomic": true,
        "category": "functional",
        "confidence_min": 0.8
      },
      "tags": ["atomic", "simple"]
    }
  ]
}
```

## Adding Test Cases

1. Identify a failure case in LangSmith
2. Add it to `atomicity-dataset.json` with expected output
3. Run evaluation to confirm it fails
4. Modify prompts to fix
5. Run evaluation to confirm fix doesn't break other cases

## Files

| File | Description |
|------|-------------|
| `atomicity-dataset.json` | Golden dataset for atomicity agent |
| `run-evaluation.ts` | Evaluation runner script |
| `evaluation-report-*.json` | Generated evaluation reports |

## LangSmith Integration

With `LANGCHAIN_TRACING_V2=true`, all LLM calls are traced to LangSmith where you can:

- **View traces**: See exact prompts, responses, latency, token usage
- **Create datasets**: Export failed cases to evaluation datasets
- **Run A/B tests**: Compare different prompt versions
- **Monitor production**: Track accuracy and latency over time

## Prompt Engineering Tips

1. **Be specific**: "Respond in JSON format only" > "Return JSON"
2. **Provide examples**: Few-shot examples improve accuracy
3. **Set temperature low**: 0.1-0.3 for deterministic tasks
4. **Validate output**: Always parse and validate LLM responses
5. **Handle errors**: Return low-confidence on parse failures

## See Also

- [LangSmith Documentation](https://docs.smith.langchain.com)
- [Atomization Service](../../src/modules/agents/atomization.service.ts)
- [LLM Service](../../src/common/llm/llm.service.ts)
