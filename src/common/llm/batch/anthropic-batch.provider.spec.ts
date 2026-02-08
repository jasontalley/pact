/**
 * Anthropic Batch Provider Tests
 *
 * Tests for Anthropic Message Batches API integration.
 * Uses mocked fetch to verify request/response mapping.
 */

import { AnthropicBatchProvider } from './anthropic-batch.provider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AnthropicBatchProvider', () => {
  let provider: AnthropicBatchProvider;

  beforeEach(() => {
    mockFetch.mockReset();
    provider = new AnthropicBatchProvider('test-api-key', 'claude-haiku-4-5');
  });

  describe('isAvailable', () => {
    it('should return true when API key is set', async () => {
      expect(await provider.isAvailable()).toBe(true);
    });

    it('should return false when no API key', async () => {
      const noKeyProvider = new AnthropicBatchProvider('');
      expect(await noKeyProvider.isAvailable()).toBe(false);
    });
  });

  describe('submitBatch', () => {
    it('should format and submit batch request correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msgbatch_123',
          type: 'message_batch',
          processing_status: 'in_progress',
          request_counts: { processing: 2, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
          created_at: '2026-02-08T10:00:00Z',
        }),
      });

      const job = await provider.submitBatch([
        {
          customId: 'atom-1',
          systemPrompt: 'You are a quality evaluator.',
          userPrompt: 'Evaluate this atom: "User can log in"',
          maxTokens: 512,
        },
        {
          customId: 'atom-2',
          userPrompt: 'Evaluate this atom: "System sends email"',
        },
      ]);

      expect(job.providerBatchId).toBe('msgbatch_123');
      expect(job.status).toBe('in_progress');
      expect(job.provider).toBe('anthropic');

      // Verify the request body
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/messages/batches');
      const body = JSON.parse(options.body);
      expect(body.requests).toHaveLength(2);
      expect(body.requests[0].custom_id).toBe('atom-1');
      expect(body.requests[0].params.model).toBe('claude-haiku-4-5');
      expect(body.requests[0].params.system).toBe('You are a quality evaluator.');
      expect(body.requests[0].params.max_tokens).toBe(512);
      expect(body.requests[1].custom_id).toBe('atom-2');
      expect(body.requests[1].params.system).toBeUndefined();
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limited',
      });

      await expect(
        provider.submitBatch([{ customId: 'atom-1', userPrompt: 'test' }]),
      ).rejects.toThrow('Anthropic API error 429');
    });
  });

  describe('getBatchStatus', () => {
    it('should map in_progress status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msgbatch_123',
          type: 'message_batch',
          processing_status: 'in_progress',
          request_counts: { processing: 5, succeeded: 15, errored: 0, canceled: 0, expired: 0 },
          created_at: '2026-02-08T10:00:00Z',
        }),
      });

      const status = await provider.getBatchStatus('msgbatch_123');
      expect(status.status).toBe('in_progress');
      expect(status.completedRequests).toBe(15);
      expect(status.totalRequests).toBe(20);
    });

    it('should map ended/completed status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msgbatch_123',
          type: 'message_batch',
          processing_status: 'ended',
          request_counts: { processing: 0, succeeded: 20, errored: 0, canceled: 0, expired: 0 },
          created_at: '2026-02-08T10:00:00Z',
          ended_at: '2026-02-08T10:15:00Z',
        }),
      });

      const status = await provider.getBatchStatus('msgbatch_123');
      expect(status.status).toBe('completed');
      expect(status.completedRequests).toBe(20);
      expect(status.completedAt).toBeInstanceOf(Date);
    });

    it('should map ended/failed status when all errored', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'msgbatch_123',
          type: 'message_batch',
          processing_status: 'ended',
          request_counts: { processing: 0, succeeded: 0, errored: 20, canceled: 0, expired: 0 },
          created_at: '2026-02-08T10:00:00Z',
          ended_at: '2026-02-08T10:15:00Z',
        }),
      });

      const status = await provider.getBatchStatus('msgbatch_123');
      expect(status.status).toBe('failed');
      expect(status.failedRequests).toBe(20);
    });
  });

  describe('getBatchResults', () => {
    it('should parse JSONL results', async () => {
      const jsonl = [
        JSON.stringify({
          custom_id: 'atom-1',
          result: {
            type: 'succeeded',
            message: {
              content: [{ type: 'text', text: '{"score": 85}' }],
              usage: { input_tokens: 100, output_tokens: 50 },
            },
          },
        }),
        JSON.stringify({
          custom_id: 'atom-2',
          result: {
            type: 'succeeded',
            message: {
              content: [{ type: 'text', text: '{"score": 72}' }],
              usage: { input_tokens: 95, output_tokens: 45 },
            },
          },
        }),
        JSON.stringify({
          custom_id: 'atom-3',
          result: {
            type: 'errored',
            error: { type: 'server_error', message: 'Internal error' },
          },
        }),
      ].join('\n');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => jsonl,
      });

      const results = await provider.getBatchResults('msgbatch_123');

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({
        customId: 'atom-1',
        success: true,
        content: '{"score": 85}',
        usage: { inputTokens: 100, outputTokens: 50 },
      });
      expect(results[1]).toEqual({
        customId: 'atom-2',
        success: true,
        content: '{"score": 72}',
        usage: { inputTokens: 95, outputTokens: 45 },
      });
      expect(results[2]).toEqual({
        customId: 'atom-3',
        success: false,
        error: 'Internal error',
      });
    });

    it('should handle empty lines in JSONL', async () => {
      const jsonl = `${JSON.stringify({ custom_id: 'atom-1', result: { type: 'succeeded', message: { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 10, output_tokens: 5 } } } })}

`;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => jsonl,
      });

      const results = await provider.getBatchResults('msgbatch_123');
      expect(results).toHaveLength(1);
    });
  });

  describe('cancelBatch', () => {
    it('should call cancel endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await provider.cancelBatch('msgbatch_123');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/messages/batches/msgbatch_123/cancel');
      expect(options.method).toBe('POST');
    });
  });
});
