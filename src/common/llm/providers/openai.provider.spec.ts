/**
 * OpenAI Provider Tests
 *
 * Tests for the OpenAI LLM provider with comprehensive coverage of:
 * - Initialization and configuration
 * - Model invocation with various parameters
 * - Availability checking (lightweight endpoint)
 * - Token counting
 * - GPT-5 specific features (max_completion_tokens, reasoning effort)
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { OpenAIProvider, OpenAIProviderConfig } from './openai.provider';
import { ProviderRequest, AgentTaskType } from './types';
import { ChatOpenAI } from '@langchain/openai';

// Mock the LangChain OpenAI module
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'Test response',
      response_metadata: {
        tokenUsage: {
          promptTokens: 100,
          completionTokens: 50,
        },
        finish_reason: 'stop',
      },
    }),
  })),
}));

const MockChatOpenAI = ChatOpenAI as jest.Mock;

// Mock fetch for availability checks
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.OPENAI_API_KEY = 'test-openai-key';
    provider = new OpenAIProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // @atom IA-008
  describe('initialization', () => {
    it('should have correct provider metadata', () => {
      expect(provider.name).toBe('openai');
      expect(provider.displayName).toBe('OpenAI');
      expect(provider.defaultModel).toBe('gpt-5-nano');
    });

    it('should support GPT-5 family models', () => {
      expect(provider.supportedModels).toContain('gpt-5.2');
      expect(provider.supportedModels).toContain('gpt-5.2-pro');
      expect(provider.supportedModels).toContain('gpt-5.2-codex');
      expect(provider.supportedModels).toContain('gpt-5-mini');
      expect(provider.supportedModels).toContain('gpt-5-nano');
    });

    it('should support legacy GPT-4 models', () => {
      expect(provider.supportedModels).toContain('gpt-4-turbo-preview');
      expect(provider.supportedModels).toContain('gpt-4o');
    });

    it('should accept custom configuration', () => {
      const config: OpenAIProviderConfig = {
        apiKey: 'custom-key',
        defaultTemperature: 0.5,
        defaultMaxTokens: 2048,
      };
      const customProvider = new OpenAIProvider(config);
      expect(customProvider).toBeInstanceOf(OpenAIProvider);
    });
  });

  // @atom IA-008
  describe('checkAvailability', () => {
    it('should return false when no API key is configured', async () => {
      delete process.env.OPENAI_API_KEY;
      const noKeyProvider = new OpenAIProvider();

      const available = await noKeyProvider.isAvailable();

      expect(available).toBe(false);
    });

    it('should use lightweight /v1/models endpoint for availability check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-5-nano' }] }),
      });

      const available = await provider.isAvailable();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer test-openai-key' },
        }),
      );
      expect(available).toBe(true);
    });

    it('should return false when API returns error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should return false when API returns empty models list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should cache availability status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-5-nano' }] }),
      });

      // First call - should hit API
      await provider.isAvailable();
      // Second call - should use cache
      await provider.isAvailable();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // @atom IA-008
  describe('getModelCapabilities', () => {
    it('should return capabilities for gpt-5-nano', () => {
      const capabilities = provider.getModelCapabilities('gpt-5-nano');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(128000);
      expect(capabilities?.supportsVision).toBe(false);
      expect(capabilities?.supportsFunctionCalling).toBe(true);
      expect(capabilities?.supportsStreaming).toBe(true);
      expect(capabilities?.supportsReasoningEffort).toBe(false);
      expect(capabilities?.costPerInputToken).toBe(0.00000005);
      expect(capabilities?.costPerOutputToken).toBe(0.0000004);
    });

    it('should return capabilities for gpt-5.2', () => {
      const capabilities = provider.getModelCapabilities('gpt-5.2');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(256000);
      expect(capabilities?.supportsVision).toBe(true);
      expect(capabilities?.supportsReasoningEffort).toBe(true);
      expect(capabilities?.maxOutputTokens).toBe(64000);
    });

    it('should return capabilities for gpt-5.2-pro', () => {
      const capabilities = provider.getModelCapabilities('gpt-5.2-pro');

      expect(capabilities).toBeDefined();
      expect(capabilities?.supportsReasoningEffort).toBe(true);
    });

    it('should return undefined for unknown model', () => {
      const capabilities = provider.getModelCapabilities('unknown-model');

      expect(capabilities).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('getTokenCount', () => {
    it('should estimate tokens based on character count', () => {
      const text = 'Hello, world!'; // 13 characters
      const tokens = provider.getTokenCount(text);

      // ~4 chars per token, so ~3-4 tokens
      expect(tokens).toBeGreaterThanOrEqual(3);
      expect(tokens).toBeLessThanOrEqual(5);
    });

    it('should handle empty string', () => {
      const tokens = provider.getTokenCount('');
      expect(tokens).toBe(0);
    });

    it('should handle long text', () => {
      const longText = 'a'.repeat(4000);
      const tokens = provider.getTokenCount(longText);

      // ~4 chars per token, so ~1000 tokens
      expect(tokens).toBe(1000);
    });
  });

  // @atom IA-008
  describe('invoke', () => {
    beforeEach(async () => {
      // Set up availability
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-5-nano' }] }),
      });
      await provider.initialize();
    });

    it('should invoke model with basic request', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await provider.invoke(request);

      expect(response).toBeDefined();
      expect(response.content).toBe('Test response');
      expect(response.modelUsed).toBe('gpt-5-nano');
      expect(response.providerUsed).toBe('openai');
    });

    it('should use specified model', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-5-mini',
      };

      const response = await provider.invoke(request);

      expect(response.modelUsed).toBe('gpt-5-mini');
    });

    it('should pass temperature option for non-nano models', async () => {
      // Use gpt-5-mini (not nano) because nano doesn't support temperature
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-5-mini',
        options: { temperature: 0.8 },
      };

      await provider.invoke(request);

      expect(MockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        }),
      );
    });

    it('should use max_completion_tokens for GPT-5 models', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-5-nano',
        options: { maxTokens: 2048 },
      };

      await provider.invoke(request);

      expect(MockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKwargs: expect.objectContaining({
            max_completion_tokens: 2048,
          }),
        }),
      );
    });

    it('should not set temperature for gpt-5-nano model', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-5-nano',
        options: { temperature: 0.7 },
      };

      await provider.invoke(request);

      // gpt-5-nano doesn't support temperature
      const callArgs = MockChatOpenAI.mock.calls[MockChatOpenAI.mock.calls.length - 1][0];
      expect(callArgs.temperature).toBeUndefined();
    });

    it('should pass reasoning effort for GPT-5.2 models', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Complex analysis' }],
        model: 'gpt-5.2',
        options: { reasoningEffort: 'high' },
      };

      await provider.invoke(request);

      expect(MockChatOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          modelKwargs: expect.objectContaining({
            reasoning: { effort: 'high' },
          }),
        }),
      );
    });

    it('should convert messages to LangChain format', async () => {
      const request: ProviderRequest = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
          { role: 'user', content: 'How are you?' },
        ],
      };

      const response = await provider.invoke(request);

      expect(response).toBeDefined();
    });

    it('should throw error for unsupported model', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'unsupported-model',
      };

      await expect(provider.invoke(request)).rejects.toThrow(/not supported by OpenAI/);
    });

    it('should throw error when API key not configured', async () => {
      delete process.env.OPENAI_API_KEY;
      const noKeyProvider = new OpenAIProvider();

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(noKeyProvider.invoke(request)).rejects.toThrow(/API key not configured/);
    });

    it('should include token usage in response', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await provider.invoke(request);

      expect(response.usage.inputTokens).toBe(100);
      expect(response.usage.outputTokens).toBe(50);
      expect(response.usage.totalTokens).toBe(150);
    });

    it('should include metadata in invoke call', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: 'Test response',
        response_metadata: { tokenUsage: { promptTokens: 10, completionTokens: 5 } },
      });
      MockChatOpenAI.mockImplementation(() => ({ invoke: mockInvoke }));

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: {
          requestId: 'test-req-123',
          agentName: 'test-agent',
          purpose: 'testing',
          taskType: AgentTaskType.CHAT,
        },
      };

      await provider.invoke(request);

      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          runName: 'test-agent',
          metadata: expect.objectContaining({
            requestId: 'test-req-123',
            agentName: 'test-agent',
            purpose: 'testing',
          }),
          tags: expect.arrayContaining(['test-agent', 'openai', 'gpt-5-nano']),
        }),
      );
    });
  });

  // @atom IA-008
  describe('health status', () => {
    it('should track successful requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-5-nano' }] }),
      });
      await provider.initialize();

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await provider.invoke(request);

      const status = provider.getHealthStatus();
      expect(status.available).toBe(true);
      expect(status.lastSuccessAt).toBeDefined();
    });

    it('should track failed requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'gpt-5-nano' }] }),
      });
      await provider.initialize();

      MockChatOpenAI.mockImplementation(() => ({
        invoke: jest.fn().mockRejectedValue(new Error('API Error')),
      }));

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.invoke(request)).rejects.toThrow('API Error');

      const status = provider.getHealthStatus();
      expect(status.lastError).toBe('API Error');
      expect(status.lastErrorAt).toBeDefined();
    });
  });

  // @atom IA-008
  describe('shutdown', () => {
    it('should clean up resources on shutdown', async () => {
      await provider.initialize();
      await provider.shutdown();

      // Provider should be cleanly shut down
      expect(true).toBe(true); // No error thrown
    });
  });
});
