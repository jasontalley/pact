/**
 * Provider Registry Tests
 *
 * Tests for the central LLM provider registry with comprehensive coverage of:
 * - Provider registration and initialization
 * - Provider availability checking
 * - Health monitoring
 * - Model and capability lookup
 * - Failover handling
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProviderRegistry } from './provider-registry';
import { LLMProvider, ModelCapabilities } from './types';
import { OpenAIProvider } from './openai.provider';
import { AnthropicProvider } from './anthropic.provider';
import { OllamaProvider } from './ollama.provider';

// Mock the provider classes
jest.mock('./openai.provider', () => ({
  OpenAIProvider: jest.fn().mockImplementation(() => ({
    name: 'openai',
    displayName: 'OpenAI',
    supportedModels: ['gpt-5-nano', 'gpt-5-mini'],
    defaultModel: 'gpt-5-nano',
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockResolvedValue(true),
    getHealthStatus: jest.fn().mockReturnValue({ available: true }),
    getModelCapabilities: jest.fn().mockReturnValue({
      contextWindow: 128000,
      supportsVision: false,
      supportsFunctionCalling: true,
      costPerInputToken: 0.00000005,
      costPerOutputToken: 0.0000004,
    }),
  })),
}));

jest.mock('./anthropic.provider', () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({
    name: 'anthropic',
    displayName: 'Anthropic',
    supportedModels: ['claude-sonnet-4-5', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-5',
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockResolvedValue(true),
    getHealthStatus: jest.fn().mockReturnValue({ available: true }),
    getModelCapabilities: jest.fn().mockReturnValue({
      contextWindow: 200000,
      supportsVision: true,
      supportsFunctionCalling: true,
      costPerInputToken: 0.000003,
      costPerOutputToken: 0.000015,
    }),
  })),
}));

jest.mock('./ollama.provider', () => ({
  OllamaProvider: jest.fn().mockImplementation(() => ({
    name: 'ollama',
    displayName: 'Ollama (Local)',
    supportedModels: ['llama3.2', 'codellama'],
    defaultModel: 'llama3.2',
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    isAvailable: jest.fn().mockResolvedValue(true),
    getHealthStatus: jest.fn().mockReturnValue({ available: true }),
    getModelCapabilities: jest.fn().mockReturnValue({
      contextWindow: 128000,
      supportsVision: false,
      supportsFunctionCalling: true,
      costPerInputToken: 0,
      costPerOutputToken: 0,
    }),
  })),
}));

const MockOpenAIProvider = OpenAIProvider as jest.Mock;
const MockAnthropicProvider = AnthropicProvider as jest.Mock;
const MockOllamaProvider = OllamaProvider as jest.Mock;

// Helper to create default mock provider
const createDefaultMockProvider = (
  name: string,
  models: string[],
  capabilities: Partial<ModelCapabilities>,
) => ({
  name,
  displayName: name.charAt(0).toUpperCase() + name.slice(1),
  supportedModels: models,
  defaultModel: models[0],
  initialize: jest.fn().mockResolvedValue(undefined),
  shutdown: jest.fn().mockResolvedValue(undefined),
  isAvailable: jest.fn().mockResolvedValue(true),
  getHealthStatus: jest.fn().mockReturnValue({ available: true }),
  getModelCapabilities: jest.fn().mockReturnValue(capabilities),
});

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Reset all provider mocks to default implementations
    MockOpenAIProvider.mockImplementation(() =>
      createDefaultMockProvider('openai', ['gpt-5-nano', 'gpt-5-mini'], {
        contextWindow: 128000,
        supportsVision: false,
        supportsFunctionCalling: true,
        costPerInputToken: 0.00000005,
        costPerOutputToken: 0.0000004,
      }),
    );

    MockAnthropicProvider.mockImplementation(() =>
      createDefaultMockProvider('anthropic', ['claude-sonnet-4-5', 'claude-haiku-4-5'], {
        contextWindow: 200000,
        supportsVision: true,
        supportsFunctionCalling: true,
        costPerInputToken: 0.000003,
        costPerOutputToken: 0.000015,
      }),
    );

    MockOllamaProvider.mockImplementation(() =>
      createDefaultMockProvider('ollama', ['llama3.2', 'codellama'], {
        contextWindow: 128000,
        supportsVision: false,
        supportsFunctionCalling: true,
        costPerInputToken: 0,
        costPerOutputToken: 0,
      }),
    );

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          OPENAI_API_KEY: 'test-openai-key',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
          OLLAMA_BASE_URL: 'http://localhost:11434',
          LANGCHAIN_TRACING_V2: 'false',
        };
        return config[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProviderRegistry, { provide: ConfigService, useValue: mockConfigService }],
    }).compile();

    registry = module.get<ProviderRegistry>(ProviderRegistry);
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (registry.isInitialized()) {
      await registry.onModuleDestroy();
    }
  });

  // @atom IA-008
  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await registry.onModuleInit();

      expect(registry.isInitialized()).toBe(true);
    });

    it('should register configured providers', async () => {
      await registry.onModuleInit();

      const providers = registry.getProviderNames();
      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('ollama');
    });

    it('should skip providers without API keys', async () => {
      // Create a separate mock for this test to avoid affecting other tests
      const noKeyConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'OPENAI_API_KEY') return undefined;
          if (key === 'ANTHROPIC_API_KEY') return undefined;
          if (key === 'OLLAMA_BASE_URL') return 'http://localhost:11434';
          return undefined;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      // Create new registry with mocked config
      const module = await Test.createTestingModule({
        providers: [ProviderRegistry, { provide: ConfigService, useValue: noKeyConfigService }],
      }).compile();

      const newRegistry = module.get<ProviderRegistry>(ProviderRegistry);
      await newRegistry.onModuleInit();

      // Only Ollama should be registered (no API key required)
      const providers = newRegistry.getProviderNames();
      expect(providers).not.toContain('openai');
      expect(providers).not.toContain('anthropic');

      await newRegistry.onModuleDestroy();
    });

    it('should handle provider initialization errors gracefully', async () => {
      // Mock to throw error on initialize (will be reset in beforeEach for next test)
      MockOpenAIProvider.mockImplementation(() => ({
        name: 'openai',
        initialize: jest.fn().mockRejectedValue(new Error('Init failed')),
        shutdown: jest.fn(),
      }));

      // Need a new registry instance to pick up the changed mock
      const module = await Test.createTestingModule({
        providers: [ProviderRegistry, { provide: ConfigService, useValue: mockConfigService }],
      }).compile();

      const testRegistry = module.get<ProviderRegistry>(ProviderRegistry);
      await testRegistry.onModuleInit();

      // Should still be initialized, just without OpenAI
      expect(testRegistry.isInitialized()).toBe(true);

      await testRegistry.onModuleDestroy();
    });
  });

  // @atom IA-008
  describe('getProvider', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return provider by name', () => {
      const openai = registry.getProvider('openai');

      expect(openai).toBeDefined();
      expect(openai?.name).toBe('openai');
    });

    it('should return undefined for unregistered provider', () => {
      const unknown = registry.getProvider('unknown' as any);

      expect(unknown).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('getAllProviders', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return all registered providers', () => {
      const providers = registry.getAllProviders();

      expect(providers.length).toBe(3);
      expect(providers.map((p) => p.name)).toContain('openai');
      expect(providers.map((p) => p.name)).toContain('anthropic');
      expect(providers.map((p) => p.name)).toContain('ollama');
    });
  });

  // @atom IA-008
  describe('isProviderAvailable', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return true for available provider', async () => {
      const available = await registry.isProviderAvailable('openai');

      expect(available).toBe(true);
    });

    it('should return false for unregistered provider', async () => {
      const available = await registry.isProviderAvailable('unknown' as any);

      expect(available).toBe(false);
    });

    it('should check provider availability', async () => {
      const provider = registry.getProvider('openai');

      await registry.isProviderAvailable('openai');

      expect(provider?.isAvailable).toHaveBeenCalled();
    });
  });

  // @atom IA-008
  describe('getBestAvailableProvider', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return best available provider based on preference', async () => {
      // Default preference is ollama, openai, anthropic (local first)
      const best = await registry.getBestAvailableProvider();

      expect(best).toBeDefined();
      expect(best?.name).toBe('ollama');
    });

    it('should fallback when preferred provider unavailable', async () => {
      const ollama = registry.getProvider('ollama');
      (ollama?.isAvailable as jest.Mock).mockResolvedValue(false);

      const best = await registry.getBestAvailableProvider();

      expect(best?.name).toBe('openai');
    });

    it('should return undefined when no providers available', async () => {
      const openai = registry.getProvider('openai');
      const anthropic = registry.getProvider('anthropic');
      const ollama = registry.getProvider('ollama');

      (openai?.isAvailable as jest.Mock).mockResolvedValue(false);
      (anthropic?.isAvailable as jest.Mock).mockResolvedValue(false);
      (ollama?.isAvailable as jest.Mock).mockResolvedValue(false);

      const best = await registry.getBestAvailableProvider();

      expect(best).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('getProviderForModel', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return provider that supports model', () => {
      const provider = registry.getProviderForModel('gpt-5-nano');

      expect(provider).toBeDefined();
      expect(provider?.name).toBe('openai');
    });

    it('should return Anthropic for Claude models', () => {
      const provider = registry.getProviderForModel('claude-sonnet-4-5');

      expect(provider?.name).toBe('anthropic');
    });

    it('should return Ollama for local models', () => {
      const provider = registry.getProviderForModel('llama3.2');

      expect(provider?.name).toBe('ollama');
    });

    it('should return undefined for unsupported model', () => {
      const provider = registry.getProviderForModel('unknown-model');

      expect(provider).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('getModelCapabilities', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return capabilities for known model', () => {
      const capabilities = registry.getModelCapabilities('gpt-5-nano');

      expect(capabilities).toBeDefined();
      expect(capabilities?.contextWindow).toBe(128000);
    });

    it('should return undefined for unknown model', () => {
      const capabilities = registry.getModelCapabilities('unknown-model');

      expect(capabilities).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('getAllAvailableModels', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return all models from all providers', () => {
      const models = registry.getAllAvailableModels();

      expect(models.length).toBeGreaterThan(0);

      // Should have models from each provider
      expect(models.some((m) => m.provider === 'openai')).toBe(true);
      expect(models.some((m) => m.provider === 'anthropic')).toBe(true);
      expect(models.some((m) => m.provider === 'ollama')).toBe(true);
    });

    it('should include capabilities for each model', () => {
      const models = registry.getAllAvailableModels();

      for (const model of models) {
        expect(model.capabilities).toBeDefined();
        expect(model.capabilities.contextWindow).toBeDefined();
      }
    });
  });

  // @atom IA-008
  describe('getProviderStatuses', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return status for all providers', () => {
      const statuses = registry.getProviderStatuses();

      expect(statuses.length).toBe(3);

      for (const status of statuses) {
        expect(status.name).toBeDefined();
        expect(status.displayName).toBeDefined();
        expect(status.available).toBeDefined();
        expect(status.health).toBeDefined();
        expect(status.supportedModels).toBeDefined();
        expect(status.defaultModel).toBeDefined();
      }
    });

    it('should reflect provider availability', () => {
      const statuses = registry.getProviderStatuses();
      const openaiStatus = statuses.find((s) => s.name === 'openai');

      expect(openaiStatus?.available).toBe(true);
    });
  });

  // @atom IA-008
  describe('registerProvider', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should register a new provider', async () => {
      const customProvider: LLMProvider = {
        name: 'custom' as any,
        displayName: 'Custom Provider',
        supportedModels: ['custom-model'],
        defaultModel: 'custom-model',
        invoke: jest.fn(),
        getTokenCount: jest.fn(),
        isAvailable: jest.fn().mockResolvedValue(true),
        getModelCapabilities: jest.fn(),
        getHealthStatus: jest.fn().mockReturnValue({ available: true }),
        initialize: jest.fn(),
        shutdown: jest.fn(),
      };

      await registry.registerProvider(customProvider);

      const retrieved = registry.getProvider('custom' as any);
      expect(retrieved).toBe(customProvider);
    });

    it('should initialize provider during registration', async () => {
      const customProvider: LLMProvider = {
        name: 'custom' as any,
        displayName: 'Custom',
        supportedModels: [],
        defaultModel: '',
        invoke: jest.fn(),
        getTokenCount: jest.fn(),
        isAvailable: jest.fn(),
        getModelCapabilities: jest.fn(),
        getHealthStatus: jest.fn(),
        initialize: jest.fn(),
        shutdown: jest.fn(),
      };

      await registry.registerProvider(customProvider);

      expect(customProvider.initialize).toHaveBeenCalled();
    });
  });

  // @atom IA-008
  describe('unregisterProvider', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should unregister an existing provider', async () => {
      await registry.unregisterProvider('openai');

      const provider = registry.getProvider('openai');
      expect(provider).toBeUndefined();
    });

    it('should shutdown provider on unregister', async () => {
      const provider = registry.getProvider('openai');

      await registry.unregisterProvider('openai');

      expect(provider?.shutdown).toHaveBeenCalled();
    });

    it('should handle unregistering non-existent provider', async () => {
      // Should not throw
      await registry.unregisterProvider('unknown' as any);
    });
  });

  // @atom IA-008
  describe('health monitoring', () => {
    it('should start health monitoring on init', async () => {
      await registry.onModuleInit();

      // Fast-forward past health check interval
      jest.advanceTimersByTime(60000);

      // Health checks should have been called
      const openai = registry.getProvider('openai');
      expect(openai?.isAvailable).toHaveBeenCalled();
    });

    it('should check all provider health periodically', async () => {
      await registry.onModuleInit();

      // Get providers and their isAvailable mock functions
      const openai = registry.getProvider('openai');
      const anthropic = registry.getProvider('anthropic');
      const ollama = registry.getProvider('ollama');

      // Record initial call counts
      const initialOpenaiCalls = (openai?.isAvailable as jest.Mock).mock.calls.length;
      const initialAnthropicCalls = (anthropic?.isAvailable as jest.Mock).mock.calls.length;
      const initialOllamaCalls = (ollama?.isAvailable as jest.Mock).mock.calls.length;

      // Advance through one health check cycle (async to handle async interval callbacks)
      await jest.advanceTimersByTimeAsync(60000);

      // All providers should have been checked again (more calls than before)
      expect((openai?.isAvailable as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialOpenaiCalls,
      );
      expect((anthropic?.isAvailable as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialAnthropicCalls,
      );
      expect((ollama?.isAvailable as jest.Mock).mock.calls.length).toBeGreaterThan(
        initialOllamaCalls,
      );
    });
  });

  // @atom IA-008
  describe('shutdown', () => {
    it('should shutdown all providers on destroy', async () => {
      await registry.onModuleInit();

      const openai = registry.getProvider('openai');
      const anthropic = registry.getProvider('anthropic');
      const ollama = registry.getProvider('ollama');

      await registry.onModuleDestroy();

      expect(openai?.shutdown).toHaveBeenCalled();
      expect(anthropic?.shutdown).toHaveBeenCalled();
      expect(ollama?.shutdown).toHaveBeenCalled();
    });

    it('should clear providers on destroy', async () => {
      await registry.onModuleInit();
      await registry.onModuleDestroy();

      expect(registry.getProviderNames()).toEqual([]);
    });

    it('should mark as uninitialized on destroy', async () => {
      await registry.onModuleInit();
      await registry.onModuleDestroy();

      expect(registry.isInitialized()).toBe(false);
    });

    it('should stop health monitoring on destroy', async () => {
      await registry.onModuleInit();
      await registry.onModuleDestroy();

      // Clear mocks and advance time
      jest.clearAllMocks();
      jest.advanceTimersByTime(120000);

      // No more health checks should occur
      const providers = registry.getAllProviders();
      expect(providers.length).toBe(0);
    });
  });

  // @atom IA-008
  describe('getAvailableProviderCount', () => {
    beforeEach(async () => {
      await registry.onModuleInit();
    });

    it('should return count of registered providers', () => {
      const count = registry.getAvailableProviderCount();

      expect(count).toBe(3);
    });

    it('should update count after unregistration', async () => {
      await registry.unregisterProvider('openai');

      const count = registry.getAvailableProviderCount();

      expect(count).toBe(2);
    });
  });
});
