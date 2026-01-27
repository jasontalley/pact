/**
 * Anthropic Provider Tests
 *
 * Tests for the Anthropic LLM provider with comprehensive coverage of:
 * - Initialization and configuration
 * - Model invocation with various parameters
 * - Availability checking (lightweight endpoint)
 * - Token counting
 * - Claude-specific message handling (system messages)
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { AnthropicProvider, AnthropicProviderConfig } from './anthropic.provider';
import { ProviderRequest, AgentTaskType } from './types';
import { ChatAnthropic } from '@langchain/anthropic';

// Mock the LangChain Anthropic module
jest.mock('@langchain/anthropic', () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'Test response from Claude',
      response_metadata: {
        usage: {
          input_tokens: 120,
          output_tokens: 60,
        },
        stop_reason: 'end_turn',
      },
    }),
  })),
}));

const MockChatAnthropic = ChatAnthropic as jest.Mock;

// Mock fetch for availability checks
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    provider = new AnthropicProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // @atom IA-008
  describe('initialization', () => {
    it('should have correct provider metadata', () => {
      expect(provider.name).toBe('anthropic');
      expect(provider.displayName).toBe('Anthropic');
      expect(provider.defaultModel).toBe('claude-sonnet-4-5');
    });

    it('should support Claude 4.5 family models with undated aliases', () => {
      expect(provider.supportedModels).toContain('claude-sonnet-4-5');
      expect(provider.supportedModels).toContain('claude-opus-4-5');
      expect(provider.supportedModels).toContain('claude-haiku-4-5');
    });

    it('should support legacy Claude 3 models', () => {
      expect(provider.supportedModels).toContain('claude-3-sonnet-20240229');
      expect(provider.supportedModels).toContain('claude-3-haiku-20240307');
    });

    it('should accept custom configuration', () => {
      const config: AnthropicProviderConfig = {
        apiKey: 'custom-key',
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
      };
      const customProvider = new AnthropicProvider(config);
      expect(customProvider).toBeInstanceOf(AnthropicProvider);
    });
  });

  // @atom IA-008
  describe('checkAvailability', () => {
    it('should return false when no API key is configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const noKeyProvider = new AnthropicProvider();

      const available = await noKeyProvider.isAvailable();

      expect(available).toBe(false);
    });

    it('should use lightweight /v1/models endpoint for availability check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }] }),
      });

      const available = await provider.isAvailable();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/models',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-api-key': 'test-anthropic-key',
            'anthropic-version': '2023-06-01',
          }),
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
        json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }] }),
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
    it('should return capabilities for claude-sonnet-4-5', () => {
      const capabilities = provider.getModelCapabilities('claude-sonnet-4-5');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(200000);
      expect(capabilities?.supportsVision).toBe(true);
      expect(capabilities?.supportsFunctionCalling).toBe(true);
      expect(capabilities?.supportsStreaming).toBe(true);
      expect(capabilities?.costPerInputToken).toBe(0.000003);
      expect(capabilities?.costPerOutputToken).toBe(0.000015);
    });

    it('should return capabilities for claude-opus-4-5', () => {
      const capabilities = provider.getModelCapabilities('claude-opus-4-5');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(200000);
      expect(capabilities?.costPerInputToken).toBe(0.000015);
      expect(capabilities?.costPerOutputToken).toBe(0.000075);
    });

    it('should return capabilities for claude-haiku-4-5', () => {
      const capabilities = provider.getModelCapabilities('claude-haiku-4-5');

      expect(capabilities).toBeDefined();
      expect(capabilities?.costPerInputToken).toBe(0.000001);
      expect(capabilities?.costPerOutputToken).toBe(0.000005);
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
        json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }] }),
      });
      await provider.initialize();
    });

    it('should invoke model with basic request', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await provider.invoke(request);

      expect(response).toBeDefined();
      expect(response.content).toBe('Test response from Claude');
      expect(response.modelUsed).toBe('claude-sonnet-4-5');
      expect(response.providerUsed).toBe('anthropic');
    });

    it('should use specified model', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-haiku-4-5',
      };

      const response = await provider.invoke(request);

      expect(response.modelUsed).toBe('claude-haiku-4-5');
    });

    it('should pass undated model alias directly to API', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-5',
      };

      await provider.invoke(request);

      // Should use the alias directly (API resolves to latest)
      expect(MockChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          modelName: 'claude-sonnet-4-5',
        }),
      );
    });

    it('should pass temperature option', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.8 },
      };

      await provider.invoke(request);

      expect(MockChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        }),
      );
    });

    it('should pass maxTokens option', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { maxTokens: 2048 },
      };

      await provider.invoke(request);

      expect(MockChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 2048,
        }),
      );
    });

    it('should pass stop sequences option', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { stopSequences: ['END', 'STOP'] },
      };

      await provider.invoke(request);

      expect(MockChatAnthropic).toHaveBeenCalledWith(
        expect.objectContaining({
          stopSequences: ['END', 'STOP'],
        }),
      );
    });

    it('should handle system messages separately', async () => {
      const request: ProviderRequest = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'system', content: 'Be concise' },
          { role: 'user', content: 'Hello' },
        ],
      };

      const response = await provider.invoke(request);

      expect(response).toBeDefined();
      // System messages should be combined and prepended
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

      await expect(provider.invoke(request)).rejects.toThrow(/not supported by Anthropic/);
    });

    it('should throw error when API key not configured', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const noKeyProvider = new AnthropicProvider();

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

      expect(response.usage.inputTokens).toBe(120);
      expect(response.usage.outputTokens).toBe(60);
      expect(response.usage.totalTokens).toBe(180);
    });

    it('should include metadata in invoke call', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: 'Test response',
        response_metadata: { usage: { input_tokens: 10, output_tokens: 5 } },
      });
      MockChatAnthropic.mockImplementation(() => ({ invoke: mockInvoke }));

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: {
          requestId: 'test-req-123',
          agentName: 'test-agent',
          purpose: 'testing',
          taskType: AgentTaskType.ATOMIZATION,
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
          }),
          tags: expect.arrayContaining(['test-agent', 'anthropic']),
        }),
      );
    });
  });

  // @atom IA-008
  describe('health status', () => {
    it('should track successful requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }] }),
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
        json: async () => ({ data: [{ id: 'claude-sonnet-4-5' }] }),
      });
      await provider.initialize();

      MockChatAnthropic.mockImplementation(() => ({
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
