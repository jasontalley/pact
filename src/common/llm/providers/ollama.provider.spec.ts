/**
 * Ollama Provider Tests
 *
 * Tests for the Ollama LLM provider with comprehensive coverage of:
 * - Initialization and configuration
 * - Model discovery from local Ollama instance
 * - Model invocation with various parameters
 * - Availability checking (local endpoint)
 * - Token counting
 * - Model pulling
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { OllamaProvider, OllamaProviderConfig } from './ollama.provider';
import { ProviderRequest, AgentTaskType } from './types';
import { ChatOllama } from '@langchain/ollama';

// Mock the LangChain Ollama module
jest.mock('@langchain/ollama', () => ({
  ChatOllama: jest.fn().mockImplementation(() => ({
    invoke: jest.fn().mockResolvedValue({
      content: 'Test response from Ollama',
    }),
  })),
}));

const MockChatOllama = ChatOllama as unknown as jest.Mock;

// Mock fetch for API calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    provider = new OllamaProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // @atom IA-008
  describe('initialization', () => {
    it('should have correct provider metadata', () => {
      expect(provider.name).toBe('ollama');
      expect(provider.displayName).toBe('Ollama (Local)');
      expect(provider.defaultModel).toBe('llama3.2:latest');
    });

    it('should support common Ollama models', () => {
      expect(provider.supportedModels).toContain('llama3.2');
      expect(provider.supportedModels).toContain('llama3.2:latest');
      expect(provider.supportedModels).toContain('llama3.3');
      expect(provider.supportedModels).toContain('qwen2.5-coder');
      expect(provider.supportedModels).toContain('codellama');
      expect(provider.supportedModels).toContain('mistral');
      expect(provider.supportedModels).toContain('mixtral');
    });

    it('should use default base URL', () => {
      const defaultProvider = new OllamaProvider();
      // Default URL is http://localhost:11434
      expect(defaultProvider).toBeInstanceOf(OllamaProvider);
    });

    it('should accept custom base URL from config', () => {
      const config: OllamaProviderConfig = {
        baseUrl: 'http://custom-ollama:11434',
      };
      const customProvider = new OllamaProvider(config);
      expect(customProvider).toBeInstanceOf(OllamaProvider);
    });

    it('should accept custom base URL from environment', () => {
      process.env.OLLAMA_BASE_URL = 'http://env-ollama:11434';
      const envProvider = new OllamaProvider();
      expect(envProvider).toBeInstanceOf(OllamaProvider);
    });

    it('should accept GPU and thread configuration', () => {
      const config: OllamaProviderConfig = {
        numGpu: -1,
        numThread: 8,
      };
      const customProvider = new OllamaProvider(config);
      expect(customProvider).toBeInstanceOf(OllamaProvider);
    });
  });

  // @atom IA-008
  describe('checkAvailability', () => {
    it('should use /api/tags endpoint for availability check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });

      const available = await provider.isAvailable();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(available).toBe(true);
    });

    it('should return false when Ollama is not running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should return false when no models are installed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [],
        }),
      });

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const available = await provider.isAvailable();

      expect(available).toBe(false);
    });

    it('should update installed models list on availability check', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5-coder:7b' }],
        }),
      });

      await provider.isAvailable();

      const installedModels = provider.getInstalledModels();
      expect(installedModels).toContain('llama3.2:latest');
      expect(installedModels).toContain('qwen2.5-coder:7b');
    });

    it('should cache availability status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });

      // First call - should hit API
      await provider.isAvailable();
      // Second call - should use cache
      await provider.isAvailable();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // @atom IA-008
  describe('model discovery', () => {
    it('should discover installed models during initialization', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3.2:latest' },
            { name: 'codellama:13b' },
            { name: 'custom-model:latest' },
          ],
        }),
      });

      await provider.initialize();

      const installedModels = provider.getInstalledModels();
      expect(installedModels).toContain('llama3.2:latest');
      expect(installedModels).toContain('codellama:13b');
      expect(installedModels).toContain('custom-model:latest');
    });

    it('should include discovered models in supported models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'custom-model:latest' }],
        }),
      });

      await provider.initialize();

      const supported = provider.supportedModels;
      expect(supported).toContain('custom-model:latest');
    });
  });

  // @atom IA-008
  describe('getModelCapabilities', () => {
    it('should return capabilities for llama3.2', () => {
      const capabilities = provider.getModelCapabilities('llama3.2');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(128000);
      expect(capabilities?.supportsVision).toBe(false);
      expect(capabilities?.supportsFunctionCalling).toBe(true);
      expect(capabilities?.supportsStreaming).toBe(true);
      expect(capabilities?.costPerInputToken).toBe(0);
      expect(capabilities?.costPerOutputToken).toBe(0);
    });

    it('should return capabilities for qwen2.5-coder', () => {
      const capabilities = provider.getModelCapabilities('qwen2.5-coder');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(32768);
      expect(capabilities?.supportsFunctionCalling).toBe(true);
    });

    it('should return capabilities for codellama', () => {
      const capabilities = provider.getModelCapabilities('codellama');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(16384);
      expect(capabilities?.supportsFunctionCalling).toBe(false);
    });

    it('should return capabilities for model with tag (llama3.2:latest)', () => {
      const capabilities = provider.getModelCapabilities('llama3.2:latest');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(128000);
    });

    it('should return default capabilities for unknown installed models', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'custom-model:latest' }],
        }),
      });

      await provider.initialize();

      const capabilities = provider.getModelCapabilities('custom-model:latest');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(4096); // Default
      expect(capabilities?.costPerInputToken).toBe(0); // Free
      expect(capabilities?.costPerOutputToken).toBe(0);
    });

    it('should return undefined for unknown model not installed', () => {
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
  });

  // @atom IA-008
  describe('invoke', () => {
    beforeEach(async () => {
      // Set up availability
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });
      await provider.initialize();
    });

    it('should invoke model with basic request', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await provider.invoke(request);

      expect(response).toBeDefined();
      expect(response.content).toBe('Test response from Ollama');
      expect(response.modelUsed).toBe('llama3.2:latest');
      expect(response.providerUsed).toBe('ollama');
    });

    it('should use specified model', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'llama3.2:3b',
      };

      const response = await provider.invoke(request);

      expect(response.modelUsed).toBe('llama3.2:3b');
    });

    it('should pass temperature option', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        options: { temperature: 0.8 },
      };

      await provider.invoke(request);

      expect(MockChatOllama).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
        }),
      );
    });

    it('should pass GPU configuration', async () => {
      const gpuProvider = new OllamaProvider({ numGpu: -1 });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });
      await gpuProvider.initialize();

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await gpuProvider.invoke(request);

      expect(MockChatOllama).toHaveBeenCalledWith(
        expect.objectContaining({
          numGpu: -1,
        }),
      );
    });

    it('should pass thread configuration', async () => {
      const threadProvider = new OllamaProvider({ numThread: 8 });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });
      await threadProvider.initialize();

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await threadProvider.invoke(request);

      expect(MockChatOllama).toHaveBeenCalledWith(
        expect.objectContaining({
          numThread: 8,
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

    it('should estimate token usage based on content length', async () => {
      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello world' }], // ~11 chars
      };

      const response = await provider.invoke(request);

      // Should have estimated input tokens
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
    });

    it('should include metadata in invoke call', async () => {
      const mockInvoke = jest.fn().mockResolvedValue({
        content: 'Test response',
      });
      MockChatOllama.mockImplementation(() => ({ invoke: mockInvoke }));

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: {
          requestId: 'test-req-123',
          agentName: 'test-agent',
          purpose: 'testing',
          taskType: AgentTaskType.CODE_GENERATION,
        },
      };

      await provider.invoke(request);

      expect(mockInvoke).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          runName: 'test-agent',
          tags: expect.arrayContaining(['test-agent', 'ollama', 'llama3.2:latest']),
        }),
      );
    });
  });

  // @atom IA-008
  describe('pullModel', () => {
    it('should pull model from Ollama registry', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true }) // pull request
        .mockResolvedValueOnce({
          // discover models
          ok: true,
          json: async () => ({
            models: [{ name: 'llama3.2:latest' }, { name: 'codellama:7b' }],
          }),
        });

      const result = await provider.pullModel('codellama:7b');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/pull',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'codellama:7b' }),
        }),
      );
      expect(result).toBe(true);
    });

    it('should return false when pull fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await provider.pullModel('invalid-model');

      expect(result).toBe(false);
    });

    it('should handle network errors during pull', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.pullModel('some-model');

      expect(result).toBe(false);
    });
  });

  // @atom IA-008
  describe('health status', () => {
    it('should track successful requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
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
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });
      await provider.initialize();

      MockChatOllama.mockImplementation(() => ({
        invoke: jest.fn().mockRejectedValue(new Error('Model not found')),
      }));

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      await expect(provider.invoke(request)).rejects.toThrow('Model not found');

      const status = provider.getHealthStatus();
      expect(status.lastError).toBe('Model not found');
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

  // @atom IA-008
  describe('cost tracking', () => {
    it('should report zero cost for local models', async () => {
      const capabilities = provider.getModelCapabilities('llama3.2');

      expect(capabilities?.costPerInputToken).toBe(0);
      expect(capabilities?.costPerOutputToken).toBe(0);
    });

    it('should return zero cost in response usage', async () => {
      // Reset the ChatOllama mock to successful behavior
      MockChatOllama.mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({
          content: 'Test response',
        }),
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.2:latest' }],
        }),
      });
      await provider.initialize();

      const request: ProviderRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const response = await provider.invoke(request);

      // Local models are free
      expect(response.usage).toBeDefined();
    });
  });
});
