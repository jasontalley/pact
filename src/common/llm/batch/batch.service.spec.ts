/**
 * BatchLlmService Tests
 *
 * Tests for the provider-agnostic batch LLM service.
 */

import { BatchLlmService } from './batch.service';
import { BatchProvider, BatchRequest, BatchJob, BatchResult } from './types';

/**
 * Create a mock batch provider
 */
function createMockProvider(overrides: Partial<BatchProvider> = {}): BatchProvider {
  return {
    name: 'anthropic',
    isAvailable: jest.fn().mockResolvedValue(true),
    submitBatch: jest.fn().mockResolvedValue({
      id: 'job-1',
      providerBatchId: 'provider-batch-1',
      provider: 'anthropic',
      status: 'submitted',
      totalRequests: 3,
      completedRequests: 0,
      failedRequests: 0,
      submittedAt: new Date(),
    } as BatchJob),
    getBatchStatus: jest.fn().mockResolvedValue({
      id: 'job-1',
      providerBatchId: 'provider-batch-1',
      provider: 'anthropic',
      status: 'completed',
      totalRequests: 3,
      completedRequests: 3,
      failedRequests: 0,
      submittedAt: new Date(),
      completedAt: new Date(),
    } as BatchJob),
    getBatchResults: jest.fn().mockResolvedValue([
      { customId: 'atom-1', success: true, content: '{"score": 85}' },
      { customId: 'atom-2', success: true, content: '{"score": 72}' },
      { customId: 'atom-3', success: true, content: '{"score": 90}' },
    ] as BatchResult[]),
    cancelBatch: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createSampleRequests(count = 3): BatchRequest[] {
  return Array.from({ length: count }, (_, i) => ({
    customId: `atom-${i + 1}`,
    systemPrompt: 'You are a quality evaluator.',
    userPrompt: `Evaluate atom ${i + 1}`,
  }));
}

describe('BatchLlmService', () => {
  let service: BatchLlmService;
  let mockProvider: BatchProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    service = new BatchLlmService();
    service.registerProvider(mockProvider);
  });

  describe('isAvailable', () => {
    it('should return true when a provider is available', async () => {
      expect(await service.isAvailable()).toBe(true);
    });

    it('should return false when no providers registered', async () => {
      const emptyService = new BatchLlmService();
      expect(await emptyService.isAvailable()).toBe(false);
    });

    it('should return false when provider is not available', async () => {
      const unavailableProvider = createMockProvider({
        isAvailable: jest.fn().mockResolvedValue(false),
      });
      const svc = new BatchLlmService();
      svc.registerProvider(unavailableProvider);
      expect(await svc.isAvailable()).toBe(false);
    });
  });

  describe('submitBatch', () => {
    it('should submit a batch to the provider', async () => {
      const requests = createSampleRequests();
      const job = await service.submitBatch(requests);

      expect(mockProvider.submitBatch).toHaveBeenCalledWith(requests, undefined);
      expect(job.status).toBe('submitted');
      expect(job.totalRequests).toBe(3);
    });

    it('should throw when no provider is available', async () => {
      const emptyService = new BatchLlmService();
      await expect(emptyService.submitBatch(createSampleRequests())).rejects.toThrow(
        'No batch provider available',
      );
    });

    it('should respect provider preference', async () => {
      const openaiProvider = createMockProvider({
        name: 'openai',
        isAvailable: jest.fn().mockResolvedValue(true),
      });
      service.registerProvider(openaiProvider);

      await service.submitBatch(createSampleRequests(), { provider: 'openai' });
      expect(openaiProvider.submitBatch).toHaveBeenCalled();
      expect(mockProvider.submitBatch).not.toHaveBeenCalled();
    });

    it('should enforce max requests per batch', async () => {
      const largeRequests = createSampleRequests(100);
      await expect(service.submitBatch(largeRequests, { maxRequestsPerBatch: 50 })).rejects.toThrow(
        'exceeds maximum',
      );
    });

    it('should reject empty requests', async () => {
      await expect(service.submitBatch([])).rejects.toThrow('at least one request');
    });
  });

  describe('getBatchStatus', () => {
    it('should return the batch status', async () => {
      const status = await service.getBatchStatus('provider-batch-1');
      expect(status.status).toBe('completed');
      expect(mockProvider.getBatchStatus).toHaveBeenCalledWith('provider-batch-1');
    });
  });

  describe('getBatchResults', () => {
    it('should return results', async () => {
      const results = await service.getBatchResults('provider-batch-1');
      expect(results).toHaveLength(3);
      expect(results[0].customId).toBe('atom-1');
      expect(results[0].success).toBe(true);
    });
  });

  describe('cancelBatch', () => {
    it('should cancel the batch', async () => {
      await service.cancelBatch('provider-batch-1');
      expect(mockProvider.cancelBatch).toHaveBeenCalledWith('provider-batch-1');
    });
  });

  describe('submitAndWait', () => {
    it('should submit and poll until completed', async () => {
      let pollCount = 0;
      const progressProvider = createMockProvider({
        getBatchStatus: jest.fn().mockImplementation(async () => {
          pollCount++;
          if (pollCount < 2) {
            return {
              id: 'job-1',
              providerBatchId: 'provider-batch-1',
              provider: 'anthropic',
              status: 'in_progress',
              totalRequests: 3,
              completedRequests: pollCount,
              failedRequests: 0,
              submittedAt: new Date(),
            } as BatchJob;
          }
          return {
            id: 'job-1',
            providerBatchId: 'provider-batch-1',
            provider: 'anthropic',
            status: 'completed',
            totalRequests: 3,
            completedRequests: 3,
            failedRequests: 0,
            submittedAt: new Date(),
            completedAt: new Date(),
          } as BatchJob;
        }),
      });

      const svc = new BatchLlmService();
      svc.registerProvider(progressProvider);

      const results = await svc.submitAndWait(createSampleRequests(), {
        pollIntervalMs: 10, // Fast polling for tests
      });

      expect(results).toHaveLength(3);
      expect(progressProvider.getBatchStatus).toHaveBeenCalledTimes(2);
    });

    it('should call onProgress callback', async () => {
      const onProgress = jest.fn();

      const results = await service.submitAndWait(createSampleRequests(), {
        pollIntervalMs: 10,
        onProgress,
      });

      expect(results).toHaveLength(3);
      // onProgress is called at least once during polling
      expect(onProgress).toHaveBeenCalled();
    });

    it('should timeout and cancel batch', async () => {
      const stuckProvider = createMockProvider({
        getBatchStatus: jest.fn().mockResolvedValue({
          id: 'job-1',
          providerBatchId: 'provider-batch-1',
          provider: 'anthropic',
          status: 'in_progress',
          totalRequests: 3,
          completedRequests: 0,
          failedRequests: 0,
          submittedAt: new Date(),
        } as BatchJob),
      });

      const svc = new BatchLlmService();
      svc.registerProvider(stuckProvider);

      await expect(
        svc.submitAndWait(createSampleRequests(), {
          pollIntervalMs: 10,
          timeoutMs: 50,
        }),
      ).rejects.toThrow('timed out');

      expect(stuckProvider.cancelBatch).toHaveBeenCalled();
    });

    it('should throw on batch failure', async () => {
      const failedProvider = createMockProvider({
        getBatchStatus: jest.fn().mockResolvedValue({
          id: 'job-1',
          providerBatchId: 'provider-batch-1',
          provider: 'anthropic',
          status: 'failed',
          totalRequests: 3,
          completedRequests: 0,
          failedRequests: 3,
          submittedAt: new Date(),
        } as BatchJob),
      });

      const svc = new BatchLlmService();
      svc.registerProvider(failedProvider);

      await expect(
        svc.submitAndWait(createSampleRequests(), { pollIntervalMs: 10 }),
      ).rejects.toThrow('failed');
    });
  });

  describe('provider registration', () => {
    it('should allow registering multiple providers', () => {
      const openaiProvider = createMockProvider({ name: 'openai' });
      service.registerProvider(openaiProvider);
      // Should not throw
      expect(service.getProviderNames()).toEqual(['anthropic', 'openai']);
    });

    it('should replace provider with same name', () => {
      const newAnthropicProvider = createMockProvider({ name: 'anthropic' });
      service.registerProvider(newAnthropicProvider);
      expect(service.getProviderNames()).toEqual(['anthropic']);
    });
  });
});
