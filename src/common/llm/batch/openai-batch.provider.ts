/**
 * OpenAI Batch Provider
 *
 * Implements batch operations using OpenAI's Batch API.
 * https://platform.openai.com/docs/guides/batch
 *
 * API Flow:
 * 1. Upload JSONL file → POST /v1/files
 * 2. Create batch     → POST /v1/batches
 * 3. Poll status      → GET  /v1/batches/{id}
 * 4. Download results  → GET  /v1/files/{output_file_id}/content
 *
 * @see docs/implementation-checklist-phase20.md Step C
 */

import { Logger } from '@nestjs/common';
import {
  BatchProvider,
  BatchRequest,
  BatchJob,
  BatchResult,
  BatchSubmitOptions,
} from './types';

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 1024;

/**
 * OpenAI JSONL request line format (Chat Completions endpoint)
 */
interface OpenAIBatchRequestLine {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions';
  body: {
    model: string;
    max_tokens?: number;
    temperature?: number;
    messages: Array<{ role: string; content: string }>;
  };
}

/**
 * OpenAI batch API response
 */
interface OpenAIBatchResponse {
  id: string;
  object: 'batch';
  status: 'validating' | 'in_progress' | 'finalizing' | 'completed' | 'failed' | 'expired' | 'cancelling' | 'cancelled';
  request_counts?: {
    total: number;
    completed: number;
    failed: number;
  };
  input_file_id: string;
  output_file_id?: string;
  error_file_id?: string;
  created_at: number;
  completed_at?: number;
}

/**
 * OpenAI file upload response
 */
interface OpenAIFileResponse {
  id: string;
  object: 'file';
  bytes: number;
  created_at: number;
  filename: string;
  purpose: string;
}

/**
 * Single result line from OpenAI batch output JSONL
 */
interface OpenAIBatchResultLine {
  id: string;
  custom_id: string;
  response?: {
    status_code: number;
    body: {
      choices: Array<{
        message: { role: string; content: string };
      }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
  };
  error?: { code: string; message: string };
}

export class OpenAIBatchProvider implements BatchProvider {
  readonly name = 'openai' as const;
  private readonly logger = new Logger(OpenAIBatchProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(apiKey?: string, defaultModel?: string) {
    this.apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    this.defaultModel = defaultModel || DEFAULT_MODEL;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async submitBatch(requests: BatchRequest[], options?: BatchSubmitOptions): Promise<BatchJob> {
    const model = options?.model || this.defaultModel;

    // Step 1: Build JSONL content
    const jsonlContent = requests
      .map((req) => {
        const line: OpenAIBatchRequestLine = {
          custom_id: req.customId,
          method: 'POST',
          url: '/v1/chat/completions',
          body: {
            model: req.model || model,
            max_tokens: req.maxTokens || DEFAULT_MAX_TOKENS,
            ...(req.temperature !== undefined && { temperature: req.temperature }),
            messages: [
              ...(req.systemPrompt ? [{ role: 'system', content: req.systemPrompt }] : []),
              { role: 'user', content: req.userPrompt },
            ],
          },
        };
        return JSON.stringify(line);
      })
      .join('\n');

    // Step 2: Upload JSONL file
    const file = await this.uploadFile(jsonlContent);

    // Step 3: Create batch
    const batchResponse = await this.apiRequest<OpenAIBatchResponse>('POST', '/batches', {
      input_file_id: file.id,
      endpoint: '/v1/chat/completions',
      completion_window: '24h',
    });

    return this.mapBatchResponse(batchResponse);
  }

  async getBatchStatus(providerBatchId: string): Promise<BatchJob> {
    const response = await this.apiRequest<OpenAIBatchResponse>(
      'GET',
      `/batches/${providerBatchId}`,
    );
    return this.mapBatchResponse(response);
  }

  async getBatchResults(providerBatchId: string): Promise<BatchResult[]> {
    // First get the batch to find the output file ID
    const batch = await this.apiRequest<OpenAIBatchResponse>(
      'GET',
      `/batches/${providerBatchId}`,
    );

    if (!batch.output_file_id) {
      throw new Error('Batch has no output file yet');
    }

    // Download the output file
    const url = `${OPENAI_API_BASE}/files/${batch.output_file_id}/content`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new Error(`OpenAI file download failed: ${response.status}`);
    }

    const text = await response.text();
    return this.parseJsonlResults(text);
  }

  async cancelBatch(providerBatchId: string): Promise<void> {
    await this.apiRequest('POST', `/batches/${providerBatchId}/cancel`);
  }

  /**
   * Upload a JSONL file to OpenAI
   */
  private async uploadFile(content: string): Promise<OpenAIFileResponse> {
    const url = `${OPENAI_API_BASE}/files`;
    const formData = new FormData();
    const blob = new Blob([content], { type: 'application/jsonl' });
    formData.append('file', blob, 'batch_requests.jsonl');
    formData.append('purpose', 'batch');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI file upload failed: ${response.status}: ${errorText.substring(0, 500)}`);
    }

    return response.json() as Promise<OpenAIFileResponse>;
  }

  /**
   * Parse JSONL results from OpenAI batch output
   */
  private parseJsonlResults(jsonl: string): BatchResult[] {
    const results: BatchResult[] = [];

    for (const line of jsonl.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as OpenAIBatchResultLine;
        results.push(this.mapResultLine(parsed));
      } catch {
        this.logger.warn(`Failed to parse batch result line: ${trimmed.substring(0, 100)}`);
      }
    }

    return results;
  }

  /**
   * Map a single OpenAI result line to our BatchResult
   */
  private mapResultLine(line: OpenAIBatchResultLine): BatchResult {
    if (line.response && line.response.status_code === 200) {
      const content = line.response.body.choices?.[0]?.message?.content || '';
      return {
        customId: line.custom_id,
        success: true,
        content,
        usage: {
          inputTokens: line.response.body.usage?.prompt_tokens || 0,
          outputTokens: line.response.body.usage?.completion_tokens || 0,
        },
      };
    }

    return {
      customId: line.custom_id,
      success: false,
      error: line.error?.message || `HTTP ${line.response?.status_code || 'unknown'}`,
    };
  }

  /**
   * Map OpenAI batch response to our BatchJob type
   */
  private mapBatchResponse(response: OpenAIBatchResponse): BatchJob {
    const statusMap: Record<string, BatchJob['status']> = {
      validating: 'submitted',
      in_progress: 'in_progress',
      finalizing: 'in_progress',
      completed: 'completed',
      failed: 'failed',
      expired: 'expired',
      cancelling: 'cancelling',
      cancelled: 'cancelled',
    };

    return {
      id: response.id,
      providerBatchId: response.id,
      provider: 'openai',
      status: statusMap[response.status] || 'in_progress',
      totalRequests: response.request_counts?.total || 0,
      completedRequests: response.request_counts?.completed || 0,
      failedRequests: response.request_counts?.failed || 0,
      submittedAt: new Date(response.created_at * 1000),
      completedAt: response.completed_at ? new Date(response.completed_at * 1000) : undefined,
    };
  }

  /**
   * Make an API request to OpenAI
   */
  private async apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${OPENAI_API_BASE}${path}`;

    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${errorText.substring(0, 500)}`);
    }

    return response.json() as Promise<T>;
  }
}
