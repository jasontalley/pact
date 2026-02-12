/**
 * Batch LLM Service
 *
 * Provider-agnostic service for submitting, polling, and collecting
 * batch LLM operations. Supports multiple providers (Anthropic, OpenAI)
 * with automatic fallback.
 *
 * @see docs/implementation-checklist-phase20.md Step A
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  BatchProvider,
  BatchRequest,
  BatchJob,
  BatchResult,
  BatchSubmitOptions,
  BatchWaitOptions,
} from './types';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const DEFAULT_MAX_POLL_INTERVAL_MS = 720_000; // 12 min cap for backoff
const DEFAULT_TIMEOUT_MS = 3_600_000; // 1 hour
const DEFAULT_MAX_REQUESTS = 5_000;

// Transient error resilience
const POLL_RETRY_ATTEMPTS = 3; // retries per poll before counting as failure
const POLL_RETRY_BASE_DELAY_MS = 5_000; // 5s, 10s, 15s between retries
const MAX_CONSECUTIVE_POLL_FAILURES = 5; // give up after 5 consecutive failed polls

@Injectable()
export class BatchLlmService {
  private readonly logger = new Logger(BatchLlmService.name);
  private readonly providers = new Map<string, BatchProvider>();
  private lazyInitFn?: () => Promise<void>;
  private lazyInitDone = false;

  /**
   * Register a batch provider
   */
  registerProvider(provider: BatchProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.log(`Registered batch provider: ${provider.name}`);
  }

  /**
   * Set a lazy initializer that will be called once on first use
   * if no providers are registered yet. This handles the case where
   * the DB config isn't available at module startup time.
   */
  setLazyInitializer(fn: () => Promise<void>): void {
    this.lazyInitFn = fn;
  }

  /**
   * Ensure providers are initialized — runs lazy init if needed.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.lazyInitDone || this.providers.size > 0) return;
    if (this.lazyInitFn) {
      this.logger.log('No batch providers registered at startup — running lazy initialization');
      try {
        await this.lazyInitFn();
      } catch (error) {
        this.logger.warn(
          `Lazy batch init failed: ${error instanceof Error ? error.message : error}`,
        );
      }
      this.lazyInitDone = true;
    }
  }

  /**
   * Get names of all registered providers
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if any batch provider is available
   */
  async isAvailable(providerName?: string): Promise<boolean> {
    await this.ensureInitialized();

    if (providerName) {
      const provider = this.providers.get(providerName);
      return provider ? provider.isAvailable() : false;
    }

    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) return true;
    }
    return false;
  }

  /**
   * Submit a batch of LLM requests
   */
  async submitBatch(requests: BatchRequest[], options?: BatchSubmitOptions): Promise<BatchJob> {
    if (requests.length === 0) {
      throw new Error('Batch must contain at least one request');
    }

    const maxRequests = options?.maxRequestsPerBatch ?? DEFAULT_MAX_REQUESTS;
    if (requests.length > maxRequests) {
      throw new Error(`Batch of ${requests.length} requests exceeds maximum of ${maxRequests}`);
    }

    const provider = await this.resolveProvider(options?.provider);

    this.logger.log(
      `Submitting batch of ${requests.length} requests to ${provider.name}` +
        (options?.agentName ? ` (agent: ${options.agentName})` : ''),
    );

    return provider.submitBatch(requests, options);
  }

  /**
   * Get batch status
   */
  async getBatchStatus(providerBatchId: string, providerName?: string): Promise<BatchJob> {
    const provider = await this.resolveProvider(providerName);
    return provider.getBatchStatus(providerBatchId);
  }

  /**
   * Get batch results
   */
  async getBatchResults(providerBatchId: string, providerName?: string): Promise<BatchResult[]> {
    const provider = await this.resolveProvider(providerName);
    return provider.getBatchResults(providerBatchId);
  }

  /**
   * Cancel a batch
   */
  async cancelBatch(providerBatchId: string, providerName?: string): Promise<void> {
    const provider = await this.resolveProvider(providerName);
    return provider.cancelBatch(providerBatchId);
  }

  /**
   * Submit a batch and wait for results with polling.
   *
   * Uses incremental backoff on poll intervals (doubles each poll, capped
   * at maxPollIntervalMs) and retries transient network errors.
   *
   * Backoff schedule (default): 30s, 60s, 120s, 240s, 480s, 720s, 720s...
   */
  async submitAndWait(
    requests: BatchRequest[],
    options?: BatchWaitOptions,
  ): Promise<BatchResult[]> {
    const initialPollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const maxPollInterval = options?.maxPollIntervalMs ?? DEFAULT_MAX_POLL_INTERVAL_MS;
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const job = await this.submitBatch(requests, options);
    const startTime = Date.now();

    this.logger.log(
      `Batch ${job.providerBatchId} submitted (${job.totalRequests} requests). ` +
        `Poll: ${initialPollInterval / 1000}s → ${maxPollInterval / 1000}s backoff, ` +
        `timeout: ${timeout / 1000}s`,
    );

    let currentJob = job;
    let pollCount = 0;
    let consecutiveFailures = 0;

    while (true) {
      this.enforceTimeout(job, currentJob, startTime, timeout);

      // Incremental backoff: double each poll, capped at max
      const currentInterval = Math.min(
        initialPollInterval * Math.pow(2, pollCount),
        maxPollInterval,
      );
      await this.sleep(currentInterval);

      // Poll status with retry on transient errors
      const pollResult = await this.pollOnce(job, pollCount, consecutiveFailures);
      if (pollResult.failed) {
        consecutiveFailures = pollResult.consecutiveFailures;
        pollCount++;
        continue;
      }
      currentJob = pollResult.job;
      consecutiveFailures = 0;

      if (options?.onProgress) {
        options.onProgress(currentJob);
      }

      this.logger.log(
        `Batch ${job.providerBatchId}: ${currentJob.status} ` +
          `(${currentJob.completedRequests}/${currentJob.totalRequests}) ` +
          `[poll ${pollCount + 1}, interval ${currentInterval / 1000}s]`,
      );

      const terminalResult = await this.handleTerminalState(currentJob, job, startTime, pollCount);
      if (terminalResult) {
        return terminalResult;
      }

      pollCount++;
    }
  }

  /**
   * Enforce timeout — throws if elapsed time exceeds limit, cancels batch first.
   */
  private enforceTimeout(
    job: BatchJob,
    currentJob: BatchJob,
    startTime: number,
    timeout: number,
  ): void {
    if (Date.now() - startTime <= timeout) return;

    this.logger.warn(
      `Batch ${job.providerBatchId} timed out after ${timeout / 1000}s. Cancelling...`,
    );
    this.cancelBatch(job.providerBatchId, job.provider).catch((err) =>
      this.logger.warn(
        `Failed to cancel timed-out batch: ${err instanceof Error ? err.message : err}`,
      ),
    );
    throw new Error(
      `Batch ${job.providerBatchId} timed out after ${timeout / 1000}s ` +
        `(${currentJob.completedRequests}/${currentJob.totalRequests} completed)`,
    );
  }

  /**
   * Execute a single poll with transient error retry.
   * Returns { failed: false, job } on success, or { failed: true, consecutiveFailures } on failure.
   */
  private async pollOnce(
    job: BatchJob,
    pollCount: number,
    consecutiveFailures: number,
  ): Promise<
    | { failed: false; job: BatchJob; consecutiveFailures: 0 }
    | { failed: true; job?: never; consecutiveFailures: number }
  > {
    try {
      const polledJob = await this.fetchWithRetry(
        () => this.getBatchStatus(job.providerBatchId, job.provider),
        `poll ${pollCount + 1} for ${job.providerBatchId}`,
      );
      return { failed: false, job: polledJob, consecutiveFailures: 0 };
    } catch (error) {
      const failures = consecutiveFailures + 1;
      const msg = error instanceof Error ? error.message : String(error);

      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          `Batch ${job.providerBatchId} polling abandoned after ` +
            `${failures} consecutive failures: ${msg}`,
        );
      }

      this.logger.warn(
        `Batch ${job.providerBatchId} poll ${pollCount + 1} failed ` +
          `(${failures}/${MAX_CONSECUTIVE_POLL_FAILURES} consecutive): ${msg}. ` +
          `Will retry on next cycle.`,
      );
      return { failed: true, consecutiveFailures: failures };
    }
  }

  /**
   * Check for terminal batch states. Returns results if completed, throws on
   * failure/expired/cancelled, returns null if still in progress.
   */
  private async handleTerminalState(
    currentJob: BatchJob,
    originalJob: BatchJob,
    startTime: number,
    pollCount: number,
  ): Promise<BatchResult[] | null> {
    if (currentJob.status === 'completed') {
      const results = await this.fetchWithRetry(
        () => this.getBatchResults(originalJob.providerBatchId, originalJob.provider),
        `results for ${originalJob.providerBatchId}`,
      );
      const elapsed = Date.now() - startTime;
      this.logger.log(
        `Batch ${originalJob.providerBatchId} completed in ${(elapsed / 1000).toFixed(1)}s ` +
          `(${results.length} results, ${pollCount + 1} polls)`,
      );
      return results;
    }

    if (currentJob.status === 'failed') {
      throw new Error(
        `Batch ${originalJob.providerBatchId} failed: ` +
          `${currentJob.failedRequests}/${currentJob.totalRequests} failed`,
      );
    }

    if (currentJob.status === 'expired') {
      throw new Error(`Batch ${originalJob.providerBatchId} expired before completion`);
    }

    if (currentJob.status === 'cancelled' || currentJob.status === 'cancelling') {
      throw new Error(`Batch ${originalJob.providerBatchId} was cancelled`);
    }

    return null;
  }

  /**
   * Retry a fetch operation with linear backoff (5s, 10s, 15s).
   * Absorbs transient network errors; re-throws after all retries exhausted.
   */
  private async fetchWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
    let lastError = new Error(`Fetch ${label} failed after ${POLL_RETRY_ATTEMPTS + 1} attempts`);

    for (let attempt = 0; attempt <= POLL_RETRY_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < POLL_RETRY_ATTEMPTS) {
          const delay = POLL_RETRY_BASE_DELAY_MS * (attempt + 1);
          this.logger.warn(
            `Fetch ${label} attempt ${attempt + 1}/${POLL_RETRY_ATTEMPTS + 1} failed: ` +
              `${lastError.message}. Retrying in ${delay / 1000}s...`,
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Resolve which provider to use
   */
  private async resolveProvider(preferred?: string): Promise<BatchProvider> {
    await this.ensureInitialized();

    if (preferred) {
      const provider = this.providers.get(preferred);
      if (!provider) {
        throw new Error(`Batch provider '${preferred}' not registered`);
      }
      if (!(await provider.isAvailable())) {
        throw new Error(`Batch provider '${preferred}' is not available`);
      }
      return provider;
    }

    // Find first available provider
    for (const provider of this.providers.values()) {
      if (await provider.isAvailable()) {
        return provider;
      }
    }

    throw new Error('No batch provider available');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
