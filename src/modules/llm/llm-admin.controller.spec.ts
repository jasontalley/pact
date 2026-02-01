/**
 * LLM Admin Controller Tests
 *
 * Tests for the LLM configuration management endpoints.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { LLMAdminController } from './llm-admin.controller';
import { LLMConfiguration } from './llm-configuration.entity';
import { LLMUsageTracking } from './llm-usage-tracking.entity';
import { ProviderRegistry } from '../../common/llm/providers/provider-registry';

describe('LLMAdminController', () => {
  let controller: LLMAdminController;
  let mockConfigRepository: any;
  let mockUsageRepository: any;
  let mockProviderRegistry: any;

  const mockConfig: Partial<LLMConfiguration> = {
    id: 'config-uuid-1',
    configName: 'default',
    isActive: true,
    providerConfigs: {
      openai: { enabled: true, priority: 3, apiKeySet: true },
      anthropic: { enabled: true, priority: 2, apiKeySet: false },
      ollama: { enabled: true, priority: 1 },
    },
    budgetConfig: {
      enabled: true,
      dailyLimit: 10,
      monthlyLimit: 100,
      alertThreshold: 80,
      hardStop: false,
      warningThreshold: 80,
    },
    modelPreferences: [],
    defaultBudgetMode: 'normal',
    preferLocalModels: false,
    cacheEnabled: true,
    cacheTtlSeconds: 3600,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    // Reset mocks
    mockConfigRepository = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((data) => Promise.resolve({ ...mockConfig, ...data })),
    };

    mockUsageRepository = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        { date: '2026-01-01', cost: 1.5, tokens: 1000, requests: 5 },
        { date: '2026-01-02', cost: 2.0, tokens: 1500, requests: 8 },
      ]),
    };

    mockProviderRegistry = {
      getProvider: jest.fn().mockReturnValue({
        supportedModels: ['gpt-5-nano', 'gpt-5-mini'],
        defaultModel: 'gpt-5-nano',
        isAvailable: jest.fn().mockResolvedValue(true),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LLMAdminController],
      providers: [
        {
          provide: getRepositoryToken(LLMConfiguration),
          useValue: mockConfigRepository,
        },
        {
          provide: getRepositoryToken(LLMUsageTracking),
          useValue: mockUsageRepository,
        },
        {
          provide: ProviderRegistry,
          useValue: mockProviderRegistry,
        },
      ],
    }).compile();

    controller = module.get<LLMAdminController>(LLMAdminController);
  });

  describe('getConfig', () => {
    it('should return current LLM configuration', async () => {
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);

      const result = await controller.getConfig();

      expect(result).toBeDefined();
      expect(result.providers).toBeDefined();
      expect(result.budget).toBeDefined();
      expect(result.cacheEnabled).toBe(true);
    });

    it('should return default values when no config exists', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);

      const result = await controller.getConfig();

      expect(result).toBeDefined();
      expect(result.providers).toHaveLength(3); // openai, anthropic, ollama
      expect(result.budget.dailyLimitUsd).toBe(10);
      expect(result.budget.monthlyLimitUsd).toBe(100);
    });

    it('should include model preferences from stored config', async () => {
      const configWithPrefs = {
        ...mockConfig,
        modelPreferences: [
          {
            taskType: 'atomization',
            preferredProvider: 'anthropic',
            preferredModel: 'claude-sonnet-4-5-20250929',
          },
        ],
      };
      mockConfigRepository.findOne.mockResolvedValue(configWithPrefs);

      const result = await controller.getConfig();

      expect(result.modelPreferences).toHaveLength(1);
    });
  });

  describe('updateConfig', () => {
    it('should update existing configuration', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      const result = await controller.updateConfig({
        preferLocalModels: true,
        cacheEnabled: false,
        cacheTtlSeconds: 7200,
      });

      expect(mockConfigRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create new configuration if none exists', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);

      await controller.updateConfig({
        preferLocalModels: true,
      });

      expect(mockConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          configName: 'default',
          isActive: true,
        }),
      );
      expect(mockConfigRepository.save).toHaveBeenCalled();
    });

    it('should update model preferences', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      await controller.updateConfig({
        modelPreferences: [
          {
            taskType: 'chat' as any,
            preferredProvider: 'openai' as any,
            preferredModel: 'gpt-5-nano',
          },
        ],
      });

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          modelPreferences: expect.any(Array),
        }),
      );
    });

    it('should update default budget mode', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      await controller.updateConfig({
        defaultBudgetMode: 'strict',
      });

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultBudgetMode: 'strict',
        }),
      );
    });
  });

  describe('updateProviderConfig', () => {
    it('should update provider configuration', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      const result = await controller.updateProviderConfig('openai', {
        enabled: false,
        priority: 5,
      });

      expect(mockConfigRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should reject invalid provider', async () => {
      await expect(
        controller.updateProviderConfig('invalid' as any, { enabled: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create new config if none exists', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);

      await controller.updateProviderConfig('anthropic', {
        enabled: true,
        defaultModel: 'claude-sonnet-4-5-20250929',
      });

      expect(mockConfigRepository.create).toHaveBeenCalled();
      expect(mockConfigRepository.save).toHaveBeenCalled();
    });

    it('should update API key', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      await controller.updateProviderConfig('openai', {
        apiKey: 'sk-test-key',
      });

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          providerConfigs: expect.objectContaining({
            openai: expect.objectContaining({
              apiKey: 'sk-test-key',
              apiKeySet: true,
            }),
          }),
        }),
      );
    });

    it('should update endpoint for Ollama', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      await controller.updateProviderConfig('ollama', {
        endpoint: 'http://192.168.1.100:11434',
      });

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          providerConfigs: expect.objectContaining({
            ollama: expect.objectContaining({
              endpoint: 'http://192.168.1.100:11434',
            }),
          }),
        }),
      );
    });
  });

  describe('updateBudgetConfig', () => {
    it('should update budget configuration', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      const result = await controller.updateBudgetConfig({
        dailyLimitUsd: 20,
        monthlyLimitUsd: 200,
        hardStopEnabled: true,
      });

      expect(mockConfigRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create new config with budget if none exists', async () => {
      mockConfigRepository.findOne.mockResolvedValue(null);

      await controller.updateBudgetConfig({
        dailyLimitUsd: 15,
      });

      expect(mockConfigRepository.create).toHaveBeenCalled();
      expect(mockConfigRepository.save).toHaveBeenCalled();
    });

    it('should update warning threshold', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      await controller.updateBudgetConfig({
        warningThresholdPercent: 90,
      });

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetConfig: expect.objectContaining({
            warningThreshold: 90,
          }),
        }),
      );
    });

    it('should update alert email', async () => {
      mockConfigRepository.findOne.mockResolvedValue({ ...mockConfig });

      await controller.updateBudgetConfig({
        alertEmail: 'admin@example.com',
      });

      expect(mockConfigRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          budgetConfig: expect.objectContaining({
            alertEmail: 'admin@example.com',
          }),
        }),
      );
    });
  });

  describe('testProvider', () => {
    it('should test provider connectivity successfully', async () => {
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);
      mockProviderRegistry.getProvider.mockReturnValue({
        supportedModels: ['gpt-5-nano'],
        defaultModel: 'gpt-5-nano',
        isAvailable: jest.fn().mockResolvedValue(true),
      });

      const result = await controller.testProvider({ provider: 'openai' as any });

      expect(result.provider).toBe('openai');
      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeDefined();
    });

    it('should return failure when provider is not available', async () => {
      mockConfigRepository.findOne.mockResolvedValue(mockConfig);
      mockProviderRegistry.getProvider.mockReturnValue({
        supportedModels: ['gpt-5-nano'],
        defaultModel: 'gpt-5-nano',
        isAvailable: jest.fn().mockResolvedValue(false),
      });

      const result = await controller.testProvider({ provider: 'openai' as any });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should return failure when provider is not registered', async () => {
      mockProviderRegistry.getProvider.mockReturnValue(null);

      const result = await controller.testProvider({ provider: 'unknown' as any });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not registered');
    });

    it('should handle errors gracefully', async () => {
      mockProviderRegistry.getProvider.mockReturnValue({
        supportedModels: ['gpt-5-nano'],
        isAvailable: jest.fn().mockRejectedValue(new Error('Connection failed')),
      });

      const result = await controller.testProvider({ provider: 'openai' as any });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection failed');
    });
  });

  describe('getUsageTrends', () => {
    it('should return usage trend data', async () => {
      const result = await controller.getUsageTrends();

      expect(result.daily).toBeDefined();
      expect(result.weekly).toBeDefined();
      expect(result.monthly).toBeDefined();
      expect(mockUsageRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should format data points correctly', async () => {
      const result = await controller.getUsageTrends();

      expect(result.daily[0]).toEqual({
        date: '2026-01-01',
        cost: 1.5,
        tokens: 1000,
        requests: 5,
      });
    });
  });

  describe('without provider registry', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [LLMAdminController],
        providers: [
          {
            provide: getRepositoryToken(LLMConfiguration),
            useValue: mockConfigRepository,
          },
          {
            provide: getRepositoryToken(LLMUsageTracking),
            useValue: mockUsageRepository,
          },
        ],
      }).compile();

      controller = module.get<LLMAdminController>(LLMAdminController);
    });

    it('should return error when testing provider without registry', async () => {
      const result = await controller.testProvider({ provider: 'openai' as any });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Provider registry not available');
    });
  });
});
