/**
 * Batch LLM Types
 *
 * Provider-agnostic types for batch LLM operations.
 * Used by BatchLlmService and provider-specific implementations.
 */

/**
 * A single request within a batch
 */
export interface BatchRequest {
  /** Correlation ID (e.g., atom tempId). Max 64 chars. */
  customId: string;
  /** System prompt */
  systemPrompt?: string;
  /** User prompt */
  userPrompt: string;
  /** Model override (uses provider default if not set) */
  model?: string;
  /** Max tokens in response */
  maxTokens?: number;
  /** Temperature for randomness */
  temperature?: number;
}

/**
 * A single result from a batch
 */
export interface BatchResult {
  /** Correlation ID matching the request */
  customId: string;
  /** Whether this individual request succeeded */
  success: boolean;
  /** LLM response text (only if success=true) */
  content?: string;
  /** Error message (only if success=false) */
  error?: string;
  /** Token usage */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * Batch job status
 */
export type BatchJobStatus =
  | 'submitted'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'expired'
  | 'cancelling'
  | 'cancelled';

/**
 * Batch job metadata
 */
export interface BatchJob {
  /** Internal batch job ID */
  id: string;
  /** Provider-assigned batch ID */
  providerBatchId: string;
  /** Which provider is processing this batch */
  provider: 'anthropic' | 'openai';
  /** Current status */
  status: BatchJobStatus;
  /** Total requests in the batch */
  totalRequests: number;
  /** How many have completed */
  completedRequests: number;
  /** How many failed */
  failedRequests: number;
  /** Results (populated when status=completed) */
  results?: BatchResult[];
  /** When the batch was submitted */
  submittedAt: Date;
  /** When the batch completed */
  completedAt?: Date;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Options for submitting a batch
 */
export interface BatchSubmitOptions {
  /** Provider to use (auto-selects if not set) */
  provider?: 'anthropic' | 'openai';
  /** Model to use */
  model?: string;
  /** Maximum requests per batch (safety cap) */
  maxRequestsPerBatch?: number;
  /** Agent name for tracking */
  agentName?: string;
  /** Purpose for usage logging */
  purpose?: string;
  /** Associated reconciliation run ID */
  reconciliationRunId?: string;
}

/**
 * Options for submitAndWait
 */
export interface BatchWaitOptions extends BatchSubmitOptions {
  /** How often to poll status (ms). Default: 30000 */
  pollIntervalMs?: number;
  /** Maximum wait time (ms). Default: 3600000 (1 hour) */
  timeoutMs?: number;
  /** Callback for progress updates */
  onProgress?: (job: BatchJob) => void;
}

/**
 * Interface for provider-specific batch implementations
 */
export interface BatchProvider {
  /** Provider name */
  readonly name: 'anthropic' | 'openai';

  /** Check if batch API is available for this provider */
  isAvailable(): Promise<boolean>;

  /** Submit a batch of requests */
  submitBatch(requests: BatchRequest[], options?: BatchSubmitOptions): Promise<BatchJob>;

  /** Get current status of a batch */
  getBatchStatus(providerBatchId: string): Promise<BatchJob>;

  /** Retrieve results (only when status=completed) */
  getBatchResults(providerBatchId: string): Promise<BatchResult[]>;

  /** Cancel a pending/in-progress batch */
  cancelBatch(providerBatchId: string): Promise<void>;
}
