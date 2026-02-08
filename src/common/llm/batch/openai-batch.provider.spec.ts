/**
 * OpenAI Batch Provider Tests
 *
 * Tests for OpenAI Batch API integration.
 * Uses mocked fetch to verify request/response mapping.
 */

import { OpenAIBatchProvider } from './openai-batch.provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenAIBatchProvider', () => {
  let provider: OpenAIBatchProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new OpenAIBatchProvider('test-api-key', 'gpt-4o-mini');
  });

  describe('isAvailable', () => {
    it('should return true when API key is set', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it('should return false when no API key', async () => {
      const noKeyProvider = new OpenAIBatchProvider('');
      expect(await noKeyProvider.isAvailable()).toBe(false);
    });
  });

  describe('submitBatch', () => {
    it('should upload JSONL file and create batch', async () => {
      // Mock file upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'file-abc123',
          object: 'file',
          bytes: 1000,
          created_at: 1707400000,
          filename: 'batch_requests.jsonl',
          purpose: 'batch',
        }),
      });

      // Mock batch creation
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'batch_abc123',
          object: 'batch',
          status: 'validating',
          request_counts: { total: 2, completed: 0, failed: 0 },
          input_file_id: 'file-abc123',
          created_at: 1707400000,
        }),
      });

      const job = await provider.submitBatch([
        {
          customId: 'atom-1',
          systemPrompt: 'You are a quality evaluator.',
          userPrompt: 'Evaluate this atom',
          maxTokens: 512,
        },
        {
          customId: 'atom-2',
          userPrompt: 'Evaluate this atom',
        },
      ]);

      expect(job.providerBatchId).toBe('batch_abc123');
      expect(job.status).toBe('submitted');
      expect(job.provider).toBe('openai');

      // Verify file upload was called
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [uploadUrl] = mockFetch.mock.calls[0];
      expect(uploadUrl).toContain('/files');

      // Verify batch creation
      const [batchUrl, batchOptions] = mockFetch.mock.calls[1];
      expect(batchUrl).toContain('/batches');
      const batchBody = JSON.parse(batchOptions.body);
      expect(batchBody.input_file_id).toBe('file-abc123');
      expect(batchBody.endpoint).toBe('/v1/chat/completions');
    });
  });

  describe('getBatchStatus', () => {
    it('should map in_progress status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'batch_abc123',
          object: 'batch',
          status: 'in_progress',
          request_counts: { total: 20, completed: 10, failed: 0 },
          input_file_id: 'file-abc123',
          created_at: 1707400000,
        }),
      });

      const status = await provider.getBatchStatus('batch_abc123');
      expect(status.status).toBe('in_progress');
      expect(status.completedRequests).toBe(10);
      expect(status.totalRequests).toBe(20);
    });

    it('should map completed status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'batch_abc123',
          object: 'batch',
          status: 'completed',
          request_counts: { total: 20, completed: 20, failed: 0 },
          input_file_id: 'file-abc123',
          output_file_id: 'file-output123',
          created_at: 1707400000,
          completed_at: 1707401000,
        }),
      });

      const status = await provider.getBatchStatus('batch_abc123');
      expect(status.status).toBe('completed');
      expect(status.completedRequests).toBe(20);
    });

    it('should map failed status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'batch_abc123',
          object: 'batch',
          status: 'failed',
          request_counts: { total: 20, completed: 0, failed: 20 },
          input_file_id: 'file-abc123',
          created_at: 1707400000,
        }),
      });

      const status = await provider.getBatchStatus('batch_abc123');
      expect(status.status).toBe('failed');
      expect(status.failedRequests).toBe(20);
    });
  });

  describe('getBatchResults', () => {
    it('should download and parse output file', async () => {
      // Mock getBatch to get output_file_id
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'batch_abc123',
          object: 'batch',
          status: 'completed',
          request_counts: { total: 2, completed: 2, failed: 0 },
          input_file_id: 'file-input',
          output_file_id: 'file-output',
          created_at: 1707400000,
          completed_at: 1707401000,
        }),
      });

      // Mock file download
      const jsonl = [
        JSON.stringify({
          id: 'req-1',
          custom_id: 'atom-1',
          response: {
            status_code: 200,
            body: {
              choices: [{ message: { role: 'assistant', content: '{"score": 85}' } }],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
            },
          },
        }),
        JSON.stringify({
          id: 'req-2',
          custom_id: 'atom-2',
          error: { code: 'server_error', message: 'Internal error' },
        }),
      ].join('\n');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => jsonl,
      });

      const results = await provider.getBatchResults('batch_abc123');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        customId: 'atom-1',
        success: true,
        content: '{"score": 85}',
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      expect(results[1]).toEqual({
        customId: 'atom-2',
        success: false,
        error: 'Internal error',
      });
    });

    it('should throw when no output file available', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'batch_abc123',
          object: 'batch',
          status: 'in_progress',
          request_counts: { total: 2, completed: 0, failed: 0 },
          input_file_id: 'file-input',
          created_at: 1707400000,
        }),
      });

      await expect(provider.getBatchResults('batch_abc123')).rejects.toThrow('no output file');
    });
  });

  describe('cancelBatch', () => {
    it('should call cancel endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.cancelBatch('batch_abc123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/batches/batch_abc123/cancel');
      expect(options.method).toBe('POST');
    });
  });
});
