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
const DEFAULT_TIMEOUT_MS = 3_600_000; // 1 hour
const DEFAULT_MAX_REQUESTS = 5_000;

@Injectable()
export class BatchLlmService {
  private readonly logger = new Logger(BatchLlmService.name);
  private readonly providers = new Map<string, BatchProvider>();

  /**
   * Register a batch provider
   */
  registerProvider(provider: BatchProvider): void {
    this.providers.set(provider.name, provider);
    this.logger.log(`Registered batch provider: ${provider.name}`);
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
   * This is the main high-level method for batch operations.
   * It handles submit, poll, collect, and timeout/cancellation.
   */
  async submitAndWait(
    requests: BatchRequest[],
    options?: BatchWaitOptions,
  ): Promise<BatchResult[]> {
    const pollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    // Submit
    const job = await this.submitBatch(requests, options);
    const startTime = Date.now();

    this.logger.log(
      `Batch ${job.providerBatchId} submitted (${job.totalRequests} requests). ` +
        `Polling every ${pollInterval / 1000}s, timeout: ${timeout / 1000}s`,
    );

    // Poll until complete or timeout
    let currentJob = job;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > timeout) {
        this.logger.warn(
          `Batch ${job.providerBatchId} timed out after ${timeout / 1000}s. Cancelling...`,
        );
        try {
          await this.cancelBatch(job.providerBatchId, job.provider);
        } catch (cancelError) {
          this.logger.warn(
            `Failed to cancel timed-out batch: ${cancelError instanceof Error ? cancelError.message : cancelError}`,
          );
        }
        throw new Error(
          `Batch ${job.providerBatchId} timed out after ${timeout / 1000}s ` +
            `(${currentJob.completedRequests}/${currentJob.totalRequests} completed)`,
        );
      }

      // Wait before polling
      await this.sleep(pollInterval);

      // Poll status
      currentJob = await this.getBatchStatus(job.providerBatchId, job.provider);

      // Report progress
      if (options?.onProgress) {
        options.onProgress(currentJob);
      }

      this.logger.log(
        `Batch ${job.providerBatchId}: ${currentJob.status} ` +
          `(${currentJob.completedRequests}/${currentJob.totalRequests})`,
      );

      // Terminal states
      if (currentJob.status === 'completed') {
        const results = await this.getBatchResults(job.providerBatchId, job.provider);
        const elapsed = Date.now() - startTime;
        this.logger.log(
          `Batch ${job.providerBatchId} completed in ${(elapsed / 1000).toFixed(1)}s ` +
            `(${results.length} results)`,
        );
        return results;
      }

      if (currentJob.status === 'failed') {
        throw new Error(
          `Batch ${job.providerBatchId} failed: ` +
            `${currentJob.failedRequests}/${currentJob.totalRequests} failed`,
        );
      }

      if (currentJob.status === 'expired') {
        throw new Error(`Batch ${job.providerBatchId} expired before completion`);
      }

      if (currentJob.status === 'cancelled' || currentJob.status === 'cancelling') {
        throw new Error(`Batch ${job.providerBatchId} was cancelled`);
      }
    }
  }

  /**
   * Resolve which provider to use
   */
  private async resolveProvider(preferred?: string): Promise<BatchProvider> {
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
