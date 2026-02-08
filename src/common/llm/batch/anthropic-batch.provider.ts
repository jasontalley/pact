/**
 * Anthropic Batch Provider
 *
 * Implements batch operations using Anthropic's Message Batches API.
 * https://docs.anthropic.com/en/docs/build-with-claude/batch-processing
 *
 * API Endpoints:
 * - POST /v1/messages/batches          — Create batch
 * - GET  /v1/messages/batches/{id}     — Check status
 * - GET  /v1/messages/batches/{id}/results — Stream results (JSONL)
 *
 * @see docs/implementation-checklist-phase20.md Step B
 */

import { Logger } from '@nestjs/common';
import { BatchProvider, BatchRequest, BatchJob, BatchResult, BatchSubmitOptions } from './types';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const DEFAULT_MODEL = 'claude-haiku-4-5';
const DEFAULT_MAX_TOKENS = 1024;
const API_VERSION = '2023-06-01';

/**
 * Anthropic-specific batch request format
 */
interface AnthropicBatchRequestItem {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    temperature?: number;
    system?: string;
    messages: Array<{ role: string; content: string }>;
  };
}

/**
 * Anthropic batch API response
 */
interface AnthropicBatchResponse {
  id: string;
  type: 'message_batch';
  processing_status: 'in_progress' | 'ended';
  request_counts: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  created_at: string;
  ended_at?: string;
  results_url?: string;
}

/**
 * Single result line from JSONL results stream
 */
interface AnthropicBatchResultLine {
  custom_id: string;
  result: {
    type: 'succeeded' | 'errored' | 'expired' | 'canceled';
    message?: {
      content: Array<{ type: string; text: string }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    error?: { type: string; message: string };
  };
}

export class AnthropicBatchProvider implements BatchProvider {
  readonly name = 'anthropic' as const;
  private readonly logger = new Logger(AnthropicBatchProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    this.defaultModel = defaultModel || DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async submitBatch(requests: BatchRequest[], options?: BatchSubmitOptions): Promise<BatchJob> {
    const model = options?.model || this.defaultModel;

    // Build Anthropic batch request format
    const batchRequests: AnthropicBatchRequestItem[] = requests.map((req) => ({
      custom_id: req.customId,
      params: {
        model: req.model || model,
        max_tokens: req.maxTokens || DEFAULT_MAX_TOKENS,
        ...(req.temperature !== undefined && { temperature: req.temperature }),
        ...(req.systemPrompt && { system: req.systemPrompt }),
        messages: [{ role: 'user', content: req.userPrompt }],
      },
    }));

    const response = await this.apiRequest<AnthropicBatchResponse>('POST', '/messages/batches', {
      requests: batchRequests,
    });

    return this.mapBatchResponse(response, requests.length);
  }

  async getBatchStatus(providerBatchId: string): Promise<BatchJob> {
    const response = await this.apiRequest<AnthropicBatchResponse>(
      'GET',
      `/messages/batches/${providerBatchId}`,
    );

    const counts = response.request_counts;
    const total =
      counts.processing + counts.succeeded + counts.errored + counts.canceled + counts.expired;

    return this.mapBatchResponse(response, total);
  }

  async getBatchResults(providerBatchId: string): Promise<BatchResult[]> {
    // Anthropic returns JSONL at the results endpoint
    const url = `${ANTHROPIC_API_BASE}/messages/batches/${providerBatchId}/results`;

    const response = await fetch(url, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Anthropic batch results request failed: ${response.status} ${response.statusText}`,
      );
    }

    const text = await response.text();
    return this.parseJsonlResults(text);
  }

  async cancelBatch(providerBatchId: string): Promise<void> {
    await this.apiRequest('POST', `/messages/batches/${providerBatchId}/cancel`);
  }

  /**
   * Parse JSONL results from Anthropic batch API
   */
  private parseJsonlResults(jsonl: string): BatchResult[] {
    const results: BatchResult[] = [];

    for (const line of jsonl.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as AnthropicBatchResultLine;
        results.push(this.mapResultLine(parsed));
      } catch {
        this.logger.warn(`Failed to parse batch result line: ${trimmed.substring(0, 100)}`);
      }
    }

    return results;
  }

  /**
   * Map a single Anthropic result line to our BatchResult
   */
  private mapResultLine(line: AnthropicBatchResultLine): BatchResult {
    if (line.result.type === 'succeeded' && line.result.message) {
      const textContent = line.result.message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('');

      return {
        customId: line.custom_id,
        success: true,
        content: textContent,
        usage: {
          inputTokens: line.result.message.usage.input_tokens,
          outputTokens: line.result.message.usage.output_tokens,
        },
      };
    }

    return {
      customId: line.custom_id,
      success: false,
      error: line.result.error?.message || `Batch item ${line.result.type}`,
    };
  }

  /**
   * Map Anthropic batch response to our BatchJob type
   */
  private mapBatchResponse(response: AnthropicBatchResponse, totalRequests: number): BatchJob {
    const counts = response.request_counts;
    const completed = counts.succeeded + counts.errored + counts.canceled + counts.expired;

    let status: BatchJob['status'];
    if (response.processing_status === 'ended') {
      if (counts.errored === totalRequests) {
        status = 'failed';
      } else {
        status = 'completed';
      }
    } else {
      status = 'in_progress';
    }

    return {
      id: response.id,
      providerBatchId: response.id,
      provider: 'anthropic',
      status,
      totalRequests,
      completedRequests: completed,
      failedRequests: counts.errored,
      submittedAt: new Date(response.created_at),
      completedAt: response.ended_at ? new Date(response.ended_at) : undefined,
    };
  }

  /**
   * Make an API request to Anthropic
   */
  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${ANTHROPIC_API_BASE}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
        'anthropic-beta': 'message-batches-2024-09-24',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    return response.json() as Promise<T>;
  }
}
