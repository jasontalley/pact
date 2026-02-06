/**
 * Model Router Tests
 *
 * Tests for intelligent model selection with comprehensive coverage of:
 * - Task-based routing
 * - Budget mode selection (normal, economy, strict)
 * - Provider/model availability handling
 * - Constraint validation
 * - Fallback strategies
 * - Cost estimation
 *
 * @atom IA-008 - LLM Provider Implementation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModelRouter } from './model-router';
import { ProviderRegistry } from '../providers/provider-registry';
import { AgentTaskType, LLMProvider, ModelCapabilities } from '../providers/types';

describe('ModelRouter', () => {
  let router: ModelRouter;
  let mockProviderRegistry: jest.Mocked<ProviderRegistry>;
  let mockConfigService: jest.Mocked<ConfigService>;

  // Mock provider with full capabilities
  const createMockProvider = (
    name: string,
    models: string[],
    capabilities: Map<string, ModelCapabilities>,
    available = true,
  ): jest.Mocked<LLMProvider> => ({
    name: name as any,
    displayName: name.charAt(0).toUpperCase() + name.slice(1),
    supportedModels: models,
    defaultModel: models[0],
    invoke: jest.fn(),
    getTokenCount: jest.fn().mockReturnValue(100),
    isAvailable: jest.fn().mockResolvedValue(available),
    getModelCapabilities: jest.fn((model) => capabilities.get(model)),
    getHealthStatus: jest.fn().mockReturnValue({ available }),
    initialize: jest.fn(),
    shutdown: jest.fn(),
  });

  // Standard capabilities
  const gptNanoCapabilities: ModelCapabilities = {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    costPerInputToken: 0.00000005,
    costPerOutputToken: 0.0000004,
    maxOutputTokens: 16384,
  };

  const claudeSonnetCapabilities: ModelCapabilities = {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    costPerInputToken: 0.000003,
    costPerOutputToken: 0.000015,
    maxOutputTokens: 8192,
  };

  const claudeHaikuCapabilities: ModelCapabilities = {
    contextWindow: 200000,
    supportsVision: true,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    costPerInputToken: 0.000001,
    costPerOutputToken: 0.000005,
    maxOutputTokens: 8192,
  };

  const llamaCapabilities: ModelCapabilities = {
    contextWindow: 128000,
    supportsVision: false,
    supportsFunctionCalling: true,
    supportsStreaming: true,
    costPerInputToken: 0,
    costPerOutputToken: 0,
    maxOutputTokens: 4096,
  };

  let mockOpenAI: jest.Mocked<LLMProvider>;
  let mockAnthropic: jest.Mocked<LLMProvider>;
  let mockOllama: jest.Mocked<LLMProvider>;

  beforeEach(async () => {
    // Create mock providers
    mockOpenAI = createMockProvider(
      'openai',
      ['gpt-5-nano', 'gpt-5-mini', 'gpt-5.2'],
      new Map([
        ['gpt-5-nano', gptNanoCapabilities],
        [
          'gpt-5-mini',
          { ...gptNanoCapabilities, costPerInputToken: 0.0000004, costPerOutputToken: 0.0000016 },
        ],
        [
          'gpt-5.2',
          {
            ...gptNanoCapabilities,
            costPerInputToken: 0.0000025,
            costPerOutputToken: 0.00001,
            supportsReasoningEffort: true,
          },
        ],
      ]),
    );

    mockAnthropic = createMockProvider(
      'anthropic',
      ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-5'],
      new Map([
        ['claude-sonnet-4-5', claudeSonnetCapabilities],
        ['claude-haiku-4-5', claudeHaikuCapabilities],
        [
          'claude-opus-4-5',
          {
            ...claudeSonnetCapabilities,
            costPerInputToken: 0.000015,
            costPerOutputToken: 0.000075,
          },
        ],
      ]),
    );

    mockOllama = createMockProvider(
      'ollama',
      ['llama3.2', 'qwen2.5-coder', 'codellama'],
      new Map([
        ['llama3.2', llamaCapabilities],
        ['qwen2.5-coder', { ...llamaCapabilities, contextWindow: 32768 }],
        [
          'codellama',
          { ...llamaCapabilities, contextWindow: 16384, supportsFunctionCalling: false },
        ],
      ]),
    );

    mockProviderRegistry = {
      getProvider: jest.fn((name: string) => {
        switch (name) {
          case 'openai':
            return mockOpenAI;
          case 'anthropic':
            return mockAnthropic;
          case 'ollama':
            return mockOllama;
          default:
            return undefined;
        }
      }),
      getProviderNames: jest.fn().mockReturnValue(['openai', 'anthropic', 'ollama']),
      getProviderStatuses: jest.fn(),
      getModelCapabilities: jest.fn(),
      isInitialized: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<ProviderRegistry>;

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, string> = {
          LLM_BUDGET_MODE: 'normal',
          LLM_PREFER_LOCAL: 'false',
        };
        return config[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelRouter,
        { provide: ProviderRegistry, useValue: mockProviderRegistry },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    router = module.get<ModelRouter>(ModelRouter);
    await router.onModuleInit();
  });

  // @atom IA-008
  describe('initialization', () => {
    it('should load default routing rules', () => {
      const rules = router.getAllRoutingRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r.taskType === AgentTaskType.ATOMIZATION)).toBe(true);
      expect(rules.some((r) => r.taskType === AgentTaskType.CHAT)).toBe(true);
      expect(rules.some((r) => r.taskType === AgentTaskType.CODE_GENERATION)).toBe(true);
    });

    it('should have routing rule for each task type', () => {
      const taskTypes = Object.values(AgentTaskType);

      for (const taskType of taskTypes) {
        const rule = router.getRoutingRule(taskType);
        expect(rule).toBeDefined();
        expect(rule?.taskType).toBe(taskType);
      }
    });
  });

  // @atom IA-008
  describe('route - basic routing', () => {
    it('should route CHAT task to preferred provider/model', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CHAT,
      });

      expect(decision).toBeDefined();
      expect(decision.provider).toBeDefined();
      expect(decision.model).toBeDefined();
      expect(decision.capabilities).toBeDefined();
      expect(decision.reason).toContain('match');
    });

    it('should route ATOMIZATION to Anthropic by default', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.ATOMIZATION,
      });

      // Anthropic's Sonnet is preferred for atomization
      expect(decision.provider).toBe('anthropic');
      expect(decision.model).toBe('claude-sonnet-4-5');
    });

    it('should route CODE_GENERATION to Ollama by default (local first)', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CODE_GENERATION,
      });

      // Ollama is preferred for code gen (privacy + free)
      expect(decision.provider).toBe('ollama');
      expect(decision.model).toBe('llama3.2');
    });

    it('should include fallback options in decision', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CHAT,
      });

      // Should have fallback options
      expect(Array.isArray(decision.fallbacks)).toBe(true);
    });

    it('should include estimated cost in decision', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CHAT,
      });

      expect(decision.estimatedCostPer1K).toBeDefined();
      expect(typeof decision.estimatedCostPer1K).toBe('number');
    });
  });

  // @atom IA-008
  describe('route - budget modes', () => {
    it('should prefer cheaper models in economy mode', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.ATOMIZATION,
        budgetMode: 'economy',
      });

      // Economy mode should prefer Ollama (free) or gpt-5-nano (cheap)
      expect(['ollama', 'openai']).toContain(decision.provider);
    });

    it('should only use free/cheapest in strict mode', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CHAT,
        budgetMode: 'strict',
      });

      // Strict mode for chat should prefer Ollama
      expect(decision.provider).toBe('ollama');
    });

    it('should use normal routing in normal mode', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.ANALYSIS,
        budgetMode: 'normal',
      });

      // Analysis in normal mode should use Anthropic Sonnet or GPT-5.2
      expect(['anthropic', 'openai']).toContain(decision.provider);
    });
  });

  // @atom IA-008
  describe('route - forced selection', () => {
    it('should use forced provider/model when specified', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CHAT,
        forceProvider: 'openai',
        forceModel: 'gpt-5.2',
      });

      expect(decision.provider).toBe('openai');
      expect(decision.model).toBe('gpt-5.2');
      expect(decision.reason).toBe('Forced selection');
    });

    it('should throw error for invalid forced provider', async () => {
      await expect(
        router.route({
          taskType: AgentTaskType.CHAT,
          forceProvider: 'invalid-provider' as any,
          forceModel: 'some-model',
        }),
      ).rejects.toThrow(/not registered/);
    });

    it('should throw error for invalid forced model', async () => {
      await expect(
        router.route({
          taskType: AgentTaskType.CHAT,
          forceProvider: 'openai',
          forceModel: 'invalid-model',
        }),
      ).rejects.toThrow(/not supported/);
    });
  });

  // @atom IA-008
  describe('route - provider availability', () => {
    it('should skip unavailable providers', async () => {
      // Make Anthropic unavailable
      mockAnthropic.isAvailable.mockResolvedValue(false);

      const decision = await router.route({
        taskType: AgentTaskType.ATOMIZATION,
      });

      // Should fall back to next available provider
      expect(decision.provider).not.toBe('anthropic');
      expect(['openai', 'ollama']).toContain(decision.provider);
    });

    it('should fallback when primary provider unavailable', async () => {
      // Make Ollama unavailable
      mockOllama.isAvailable.mockResolvedValue(false);

      const decision = await router.route({
        taskType: AgentTaskType.CODE_GENERATION,
      });

      // Should fall back to OpenAI
      expect(decision.provider).toBe('openai');
    });

    it('should throw error when no providers available', async () => {
      mockOpenAI.isAvailable.mockResolvedValue(false);
      mockAnthropic.isAvailable.mockResolvedValue(false);
      mockOllama.isAvailable.mockResolvedValue(false);

      await expect(
        router.route({
          taskType: AgentTaskType.CHAT,
        }),
      ).rejects.toThrow(/No available provider/);
    });
  });

  // @atom IA-008
  describe('route - constraints', () => {
    it('should filter out local models when allowLocalModels=false', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CODE_GENERATION,
        allowLocalModels: false,
      });

      expect(decision.provider).not.toBe('ollama');
    });

    it('should only use local models when allowCloudModels=false', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.CHAT,
        allowCloudModels: false,
      });

      expect(decision.provider).toBe('ollama');
    });

    it('should respect maxCost constraint', async () => {
      const decision = await router.route({
        taskType: AgentTaskType.ANALYSIS,
        maxCost: 0.001, // Very low max cost
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
      });

      // Should prefer cheaper models - all providers have budget-friendly options
      expect(['ollama', 'openai', 'anthropic']).toContain(decision.provider);
      // The selected model should have low cost
      expect(decision.capabilities.costPerInputToken).toBeLessThanOrEqual(0.000005);
    });

    it('should check function calling requirement', async () => {
      // Atomization requires function calling
      const rule = router.getRoutingRule(AgentTaskType.ATOMIZATION);
      expect(rule?.requiresFunctionCalling).toBe(true);
    });
  });

  // @atom IA-008
  describe('getRoutingRule', () => {
    it('should return rule for valid task type', () => {
      const rule = router.getRoutingRule(AgentTaskType.CHAT);

      expect(rule).toBeDefined();
      expect(rule?.taskType).toBe(AgentTaskType.CHAT);
      expect(rule?.preferredProviders).toBeDefined();
      expect(rule?.preferredModels).toBeDefined();
    });

    it('should return undefined for unknown task type', () => {
      const rule = router.getRoutingRule('unknown' as AgentTaskType);

      expect(rule).toBeUndefined();
    });
  });

  // @atom IA-008
  describe('setRoutingRule', () => {
    it('should update existing routing rule', () => {
      const customRule = {
        taskType: AgentTaskType.CHAT,
        preferredProviders: ['ollama', 'openai'] as any[],
        preferredModels: ['llama3.2', 'gpt-5-nano'],
        fallbackStrategy: 'next_model' as const,
      };

      router.setRoutingRule(customRule);

      const rule = router.getRoutingRule(AgentTaskType.CHAT);
      expect(rule?.preferredProviders).toEqual(['ollama', 'openai']);
    });
  });

  // @atom IA-008
  describe('getRecommendedModels', () => {
    it('should return recommendations for task type', () => {
      const recommendations = router.getRecommendedModels(AgentTaskType.CHAT);

      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);

      for (const rec of recommendations) {
        expect(rec.provider).toBeDefined();
        expect(rec.model).toBeDefined();
        expect(rec.cost).toBeDefined();
      }
    });

    it('should include cost information', () => {
      const recommendations = router.getRecommendedModels(AgentTaskType.CHAT);

      // Should have a mix of Free (Ollama) and priced models
      const hasFree = recommendations.some((r) => r.cost === 'Free');
      const hasPriced = recommendations.some((r) => r.cost.startsWith('$'));

      expect(hasFree || hasPriced).toBe(true);
    });

    it('should respect budget mode in recommendations', () => {
      const normalRecs = router.getRecommendedModels(AgentTaskType.ATOMIZATION, 'normal');
      const strictRecs = router.getRecommendedModels(AgentTaskType.ATOMIZATION, 'strict');

      // Strict mode should have fewer/cheaper options
      expect(strictRecs.length).toBeLessThanOrEqual(normalRecs.length);
    });

    it('should return empty array for unknown task type', () => {
      const recommendations = router.getRecommendedModels('unknown' as AgentTaskType);

      expect(recommendations).toEqual([]);
    });
  });

  // @atom IA-008
  describe('estimateTaskCost', () => {
    it('should estimate cost for task', () => {
      const estimate = router.estimateTaskCost(
        AgentTaskType.CHAT,
        1000, // input tokens
        500, // output tokens
        'normal',
      );

      expect(estimate.minCost).toBeDefined();
      expect(estimate.maxCost).toBeDefined();
      expect(estimate.recommendedModel).toBeDefined();
      expect(typeof estimate.minCost).toBe('number');
      expect(typeof estimate.maxCost).toBe('number');
    });

    it('should have minCost <= maxCost', () => {
      const estimate = router.estimateTaskCost(AgentTaskType.ANALYSIS, 5000, 2000, 'normal');

      expect(estimate.minCost).toBeLessThanOrEqual(estimate.maxCost);
    });

    it('should return 0 cost when only free models available', () => {
      const estimate = router.estimateTaskCost(
        AgentTaskType.CHAT,
        1000,
        500,
        'strict', // Only Ollama in strict mode
      );

      // Ollama is free
      expect(estimate.minCost).toBe(0);
    });

    it('should identify recommended model', () => {
      const estimate = router.estimateTaskCost(AgentTaskType.CHAT, 1000, 500, 'normal');

      expect(estimate.recommendedModel).toContain(':'); // provider:model format
    });

    it('should return zeros for unknown task type', () => {
      const estimate = router.estimateTaskCost('unknown' as AgentTaskType, 1000, 500, 'normal');

      expect(estimate.minCost).toBe(0);
      expect(estimate.maxCost).toBe(0);
    });
  });

  // @atom IA-008
  describe('error handling', () => {
    it('should throw error for missing task type rule', async () => {
      // Remove the rule
      const customRouter = router as any;
      customRouter.routingRules.delete(AgentTaskType.CHAT);

      await expect(router.route({ taskType: AgentTaskType.CHAT })).rejects.toThrow(
        /No routing rule found/,
      );
    });

    it('should handle provider registry errors gracefully', async () => {
      mockProviderRegistry.getProvider.mockImplementation(() => {
        throw new Error('Registry error');
      });

      await expect(router.route({ taskType: AgentTaskType.CHAT })).rejects.toThrow();
    });
  });

  // @atom IA-008
  describe('default routing rules', () => {
    it('should have ATOMIZATION prefer Anthropic Sonnet', () => {
      const rule = router.getRoutingRule(AgentTaskType.ATOMIZATION);

      expect(rule?.preferredProviders[0]).toBe('anthropic');
      expect(rule?.preferredModels[0]).toBe('claude-sonnet-4-5');
    });

    it('should have CODE_GENERATION prefer local first', () => {
      const rule = router.getRoutingRule(AgentTaskType.CODE_GENERATION);

      expect(rule?.preferredProviders[0]).toBe('ollama');
    });

    it('should have ANALYSIS require high context window', () => {
      const rule = router.getRoutingRule(AgentTaskType.ANALYSIS);

      expect(rule?.minContextWindow).toBeGreaterThanOrEqual(100000);
    });

    it('should have CLASSIFICATION prefer cheapest options', () => {
      const rule = router.getRoutingRule(AgentTaskType.CLASSIFICATION);

      expect(rule?.preferredModels).toContain('gpt-5-nano');
      expect(rule?.maxCostPerRequest).toBeDefined();
    });
  });
});
