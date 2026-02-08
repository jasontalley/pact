# Implementation Checklist: Phase 20 — Batch API for High-Volume LLM Operations

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 20 |
| **Focus** | LLM Batch API integration for non-interactive, high-volume workloads |
| **Status** | Not Started |
| **Prerequisites** | Phase 18 (reconciliation pipeline), Phase 19 (self-hosting run provides real-world data) |
| **Related Docs** | [implementation-checklist-phase18.md](implementation-checklist-phase18.md), [implementation-checklist-phase19.md](implementation-checklist-phase19.md) |

---

## Overview

Phase 20 adds support for LLM Batch APIs (Anthropic Message Batches, OpenAI Batch API) to handle high-volume, non-interactive LLM workloads. The primary target is the reconciliation VerifyNode, which currently makes 1,620+ sequential real-time LLM calls for atom quality scoring.

### The Problem

The reconciliation pipeline's verification step exhibits three issues:
1. **Cost**: Each atom quality validation is a real-time LLM call at full price. At 1,620 atoms, this is ~$5-8 per run.
2. **Speed**: Sequential calls take ~40+ minutes. Even with concurrency, rate limits constrain throughput.
3. **Rate pressure**: Verification calls compete with interactive features (chat, interview) for the same rate limit pool.

### The Solution

Batch APIs offer:
- **50% cost reduction** (both Anthropic and OpenAI)
- **Separate rate limit pool** (batch requests don't compete with real-time)
- **Higher throughput** (providers schedule batch work during low-demand periods)
- **24h SLA, typically 10-30 min** turnaround for 1,000-2,000 requests

### Applicable Workloads

| Workload | Current Approach | Batch Candidate? | Reason |
|----------|-----------------|-------------------|--------|
| **VerifyNode** (atom quality) | Sequential real-time | **Yes** | 1,620 independent calls, non-interactive |
| **InferAtomsNode** (atom extraction) | Sequential real-time | **Yes** | 1,620 independent calls, non-interactive |
| Interview questions | Real-time | No | Interactive, user waiting |
| Chat agent | Real-time | No | Interactive, user waiting |
| Atomization | Real-time | No | Small volume, user waiting |

---

## Architecture

### Batch Processing Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Reconciliation Graph                                        │
│                                                              │
│  ... → InferAtomsNode → SynthesizeMolecules → InterimPersist │
│            │                                                 │
│            ▼                                                 │
│       VerifyNode                                             │
│            │                                                 │
│            ├─── [Real-time path] ──→ Serial LLM calls        │
│            │    (existing, for small batches ≤20)             │
│            │                                                 │
│            └─── [Batch path] ──→ Submit batch ──→ Poll ──→   │
│                 (new, for large batches >20)    Collect       │
│                                                              │
│       ──→ PersistNode                                        │
└─────────────────────────────────────────────────────────────┘
```

### Dual-Mode Strategy

The system should support both modes transparently:
- **Real-time mode**: Used for small workloads (≤20 atoms) or when batch API is unavailable
- **Batch mode**: Used for large workloads (>20 atoms) when batch API is configured
- **Fallback**: If batch API fails or times out, fall back to real-time with concurrency

### Batch Lifecycle

```
1. PREPARE    → Build array of LLM requests with custom_ids
2. SUBMIT     → POST to batch API endpoint
3. POLL       → Check status periodically (30s interval)
4. COLLECT    → Download results when complete
5. RECONCILE  → Match results to atoms via custom_id, update DB
```

---

## Implementation Steps

### Step A: Batch Service Abstraction

**Create `src/common/llm/batch/batch.service.ts`**

A provider-agnostic batch service that handles submit/poll/collect lifecycle.

```typescript
interface BatchRequest {
  customId: string;          // Correlation ID (e.g., atom tempId)
  systemPrompt?: string;
  userPrompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

interface BatchResult {
  customId: string;
  success: boolean;
  content?: string;          // LLM response text
  error?: string;            // Error message if failed
  usage?: { inputTokens: number; outputTokens: number };
}

interface BatchJob {
  id: string;                // Provider batch ID
  provider: 'anthropic' | 'openai';
  status: 'submitted' | 'processing' | 'completed' | 'failed' | 'expired';
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  results?: BatchResult[];
  submittedAt: Date;
  completedAt?: Date;
}

@Injectable()
export class BatchLlmService {
  // Submit a batch of requests, returns a job ID
  async submitBatch(requests: BatchRequest[], options?: BatchOptions): Promise<BatchJob>;

  // Poll batch status
  async getBatchStatus(jobId: string): Promise<BatchJob>;

  // Retrieve results (only when status === 'completed')
  async getBatchResults(jobId: string): Promise<BatchResult[]>;

  // Cancel a pending batch
  async cancelBatch(jobId: string): Promise<void>;

  // Convenience: submit and wait for results (with polling)
  async submitAndWait(requests: BatchRequest[], options?: BatchWaitOptions): Promise<BatchResult[]>;
}
```

### Step B: Anthropic Batch Provider

**Create `src/common/llm/batch/anthropic-batch.provider.ts`**

Implements batch operations using Anthropic's Message Batches API:
- `POST /v1/messages/batches` — create batch
- `GET /v1/messages/batches/{id}` — check status
- `GET /v1/messages/batches/{id}/results` — stream results

Key details:
- Max 10,000 requests per batch
- Results available as JSONL stream
- Each request in batch uses same parameters as real-time Messages API
- `custom_id` field for correlation (max 64 chars)

### Step C: OpenAI Batch Provider

**Create `src/common/llm/batch/openai-batch.provider.ts`**

Implements batch operations using OpenAI's Batch API:
- Upload JSONL file → `POST /v1/files`
- Create batch → `POST /v1/batches`
- Poll status → `GET /v1/batches/{id}`
- Download results → `GET /v1/files/{output_file_id}/content`

Key differences from Anthropic:
- Requires JSONL file upload (not inline JSON)
- Uses Chat Completions format (`/v1/chat/completions` as endpoint in each line)
- Output is also a JSONL file

### Step D: Batch Job Persistence (Optional)

**Create `src/common/llm/batch/batch-job.entity.ts`**

For long-running batches, persist job metadata to DB so we can recover from app restarts:

```typescript
@Entity('batch_jobs')
export class BatchJobEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() providerBatchId: string;
  @Column() provider: string;
  @Column() status: string;
  @Column() totalRequests: number;
  @Column({ default: 0 }) completedRequests: number;
  @Column({ nullable: true }) reconciliationRunId: string;  // Link to recon run
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, unknown>;
  @CreateDateColumn() submittedAt: Date;
  @Column({ nullable: true }) completedAt: Date;
}
```

Migration: `AddBatchJobsTable`

### Step E: VerifyNode Batch Mode

**Modify `src/modules/agents/graphs/nodes/reconciliation/verify.node.ts`**

Add batch path alongside existing real-time path:

```typescript
// Decision: batch vs real-time
if (atoms.length > BATCH_THRESHOLD && batchService.isAvailable()) {
  // Batch path
  const requests = atoms.map(atom => ({
    customId: atom.tempId,
    systemPrompt: QUALITY_SYSTEM_PROMPT,
    userPrompt: buildQualityPrompt(atom),
  }));

  const results = await batchService.submitAndWait(requests, {
    pollIntervalMs: 30_000,
    timeoutMs: 3_600_000,  // 1 hour max
  });

  // Match results to atoms
  for (const result of results) {
    const atom = atomMap.get(result.customId);
    if (result.success) {
      atom.qualityScore = parseQualityResponse(result.content);
    }
  }
} else {
  // Existing real-time path (unchanged)
}
```

### Step F: InferAtomsNode Batch Mode (Phase 20b)

Same pattern as VerifyNode but for atom inference. This is a larger change since inference prompts include test context, making requests larger. Prioritize VerifyNode first.

### Step G: Reconciliation Status Updates

**Modify reconciliation WebSocket events** to report batch progress:

```typescript
// New status: 'batch_processing'
emit('reconciliation:status', {
  runId,
  status: 'batch_processing',
  batchProgress: { submitted: 1620, completed: 450, failed: 2 },
  estimatedTimeRemaining: '~12 minutes',
});
```

### Step H: Additional Improvements (from Reconciliation Analysis)

Based on the Phase 19 full reconciliation run, address:
1. **JSON parse errors in AtomQualityService**: Apply fence-stripping from `parseJsonWithRecovery()` to quality score parsing
2. **Score-but-don't-gate for reconciliation**: Quality scores populate the UI for sorting/prioritizing, but don't block atoms from appearing in recommendations
3. **Batch concurrency fallback**: If batch API is unavailable, use `Promise.allSettled()` with concurrency limit (e.g., p-limit(10)) for the real-time path

---

## Configuration

### Environment Variables

```env
# Batch API Configuration
BATCH_API_ENABLED=true                    # Master toggle
BATCH_THRESHOLD=20                         # Min atoms to trigger batch mode
BATCH_POLL_INTERVAL_MS=30000              # How often to check batch status
BATCH_TIMEOUT_MS=3600000                  # Max wait time (1 hour)
BATCH_MAX_REQUESTS_PER_BATCH=5000         # Safety cap per batch
```

### Database Configuration

Add to `llm_configurations` table (existing):
```json
{
  "batch": {
    "enabled": true,
    "threshold": 20,
    "pollIntervalMs": 30000,
    "timeoutMs": 3600000
  }
}
```

---

## Cost Analysis

### Per Reconciliation Run (1,620 atoms)

| Step | Real-time Cost | Batch Cost | Savings |
|------|---------------|------------|---------|
| InferAtoms (Sonnet) | ~$8.00 | ~$4.00 | $4.00 |
| Verify (Sonnet) | ~$6.00 | ~$3.00 | $3.00 |
| **Total** | **~$14.00** | **~$7.00** | **~$7.00 (50%)** |

### With Haiku for Verification

| Step | Real-time Cost | Batch Cost | Savings |
|------|---------------|------------|---------|
| InferAtoms (Sonnet) | ~$8.00 | ~$4.00 | $4.00 |
| Verify (Haiku) | ~$0.60 | ~$0.30 | $0.30 |
| **Total** | **~$8.60** | **~$4.30** | **~$4.30 (50%)** |

---

## Testing Strategy

### Unit Tests
- `batch.service.spec.ts` — Mock provider responses, test submit/poll/collect lifecycle
- `anthropic-batch.provider.spec.ts` — Mock Anthropic API, test request/response mapping
- `openai-batch.provider.spec.ts` — Mock OpenAI API, test JSONL formatting
- `verify.node.spec.ts` — Test batch vs real-time path selection

### Integration Tests
- Submit small batch (5 items) to real Anthropic API, verify results come back
- Test timeout handling (mock a batch that never completes)
- Test partial failure (some items in batch fail, others succeed)
- Test recovery from app restart mid-batch (if persistence is implemented)

### Golden Tests
- Run reconciliation on a small fixture with batch mode enabled
- Verify same atoms/molecules are produced as real-time mode

---

## Verification Checklist

- [ ] `BatchLlmService` can submit a batch to Anthropic and retrieve results
- [ ] `BatchLlmService` can submit a batch to OpenAI and retrieve results
- [ ] VerifyNode uses batch mode for >20 atoms, real-time for ≤20
- [ ] Batch progress is reported via WebSocket
- [ ] Failed items in a batch are retried individually
- [ ] App restart during batch processing recovers gracefully
- [ ] Cost reduction of ~50% confirmed via API usage dashboard
- [ ] Reconciliation end-to-end completes successfully in batch mode
- [ ] JSON parse recovery applied to AtomQualityService
- [ ] Quality scores surface in review UI as sorting signal (not hard gate)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Batch API unavailable or rate-limited | Fallback to real-time with concurrency limiting |
| Batch takes longer than expected (>1 hour) | Timeout + cancel + retry as real-time |
| Provider changes batch API format | Adapter pattern isolates provider-specific logic |
| App restarts during batch processing | Persist batch job ID to DB, resume polling on startup |
| Result ordering doesn't match submission | Use `custom_id` for correlation, not positional index |
