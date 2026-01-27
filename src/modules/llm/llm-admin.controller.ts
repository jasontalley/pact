/**
 * LLM Admin Controller
 *
 * REST API endpoints for LLM configuration management.
 * These endpoints are intended for administrative use.
 */

import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Optional,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ProviderRegistry } from '../../common/llm/providers/provider-registry';
import { LLMProviderType } from '../../common/llm/providers/types';
import { LLMConfiguration } from './llm-configuration.entity';
import { LLMUsageTracking } from './llm-usage-tracking.entity';
import {
  LLMConfigDto,
  ProviderConfigDto,
  BudgetConfigDto,
  UpdateProviderConfigDto,
  UpdateBudgetConfigDto,
  TestProviderDto,
  ProviderTestResultDto,
  UsageTrendDataDto,
  UsageDataPointDto,
} from './dto/llm-admin.dto';

@ApiTags('admin/llm')
@Controller('admin/llm')
export class LLMAdminController {
  constructor(
    @InjectRepository(LLMConfiguration)
    private readonly configRepository: Repository<LLMConfiguration>,
    @InjectRepository(LLMUsageTracking)
    private readonly usageRepository: Repository<LLMUsageTracking>,
    @Optional() private readonly providerRegistry?: ProviderRegistry,
  ) {}

  /**
   * GET /api/v1/admin/llm/config
   * Get current LLM configuration
   */
  @Get('config')
  @ApiOperation({ summary: 'Get current LLM configuration' })
  @ApiResponse({
    status: 200,
    description: 'Current LLM configuration',
    type: LLMConfigDto,
  })
  async getConfig(): Promise<LLMConfigDto> {
    const config = await this.configRepository.findOne({
      where: { isActive: true },
    });

    // Build provider configs from environment + stored config
    const providers = this.buildProviderConfigs(config);
    const modelPreferences = config?.modelPreferences || this.getDefaultModelPreferences();
    const budget = this.buildBudgetConfig(config);

    return {
      providers,
      modelPreferences,
      budget,
      defaultBudgetMode: config?.defaultBudgetMode || 'normal',
      preferLocalModels: config?.preferLocalModels || false,
      cacheEnabled: config?.cacheEnabled ?? true,
      cacheTtlSeconds: config?.cacheTtlSeconds || 3600,
    };
  }

  /**
   * PUT /api/v1/admin/llm/config
   * Update LLM configuration
   */
  @Put('config')
  @ApiOperation({ summary: 'Update LLM configuration' })
  @ApiResponse({
    status: 200,
    description: 'Updated configuration',
    type: LLMConfigDto,
  })
  async updateConfig(@Body() update: Partial<LLMConfigDto>): Promise<LLMConfigDto> {
    let config = await this.configRepository.findOne({
      where: { isActive: true },
    });

    if (!config) {
      config = this.configRepository.create({
        isActive: true,
        createdAt: new Date(),
      });
    }

    // Update fields
    if (update.modelPreferences) {
      config.modelPreferences = update.modelPreferences;
    }
    if (update.defaultBudgetMode) {
      config.defaultBudgetMode = update.defaultBudgetMode;
    }
    if (update.preferLocalModels !== undefined) {
      config.preferLocalModels = update.preferLocalModels;
    }
    if (update.cacheEnabled !== undefined) {
      config.cacheEnabled = update.cacheEnabled;
    }
    if (update.cacheTtlSeconds !== undefined) {
      config.cacheTtlSeconds = update.cacheTtlSeconds;
    }

    config.updatedAt = new Date();
    await this.configRepository.save(config);

    return this.getConfig();
  }

  /**
   * PATCH /api/v1/admin/llm/providers/:provider
   * Update a specific provider's configuration
   */
  @Patch('providers/:provider')
  @ApiOperation({ summary: 'Update provider configuration' })
  @ApiParam({ name: 'provider', enum: ['openai', 'anthropic', 'ollama'] })
  @ApiResponse({
    status: 200,
    description: 'Updated configuration',
    type: LLMConfigDto,
  })
  async updateProviderConfig(
    @Param('provider') provider: LLMProviderType,
    @Body() update: UpdateProviderConfigDto,
  ): Promise<LLMConfigDto> {
    if (!['openai', 'anthropic', 'ollama'].includes(provider)) {
      throw new BadRequestException(`Invalid provider: ${provider}`);
    }

    let config = await this.configRepository.findOne({
      where: { isActive: true },
    });

    if (!config) {
      config = this.configRepository.create({
        isActive: true,
        providerConfigs: {},
        createdAt: new Date(),
      });
    }

    // Initialize provider configs if not exists
    if (!config.providerConfigs) {
      config.providerConfigs = {};
    }

    // Get or create provider config
    const providerConfig = config.providerConfigs[provider] || {
      enabled: true,
      priority: this.getDefaultPriority(provider),
    };

    // Update fields
    if (update.enabled !== undefined) {
      providerConfig.enabled = update.enabled;
    }
    if (update.apiKey !== undefined) {
      // Store API key securely (in production, use proper secret management)
      providerConfig.apiKey = update.apiKey;
      providerConfig.apiKeySet = !!update.apiKey;
    }
    if (update.endpoint !== undefined) {
      providerConfig.endpoint = update.endpoint;
    }
    if (update.defaultModel !== undefined) {
      providerConfig.defaultModel = update.defaultModel;
    }
    if (update.priority !== undefined) {
      providerConfig.priority = update.priority;
    }

    config.providerConfigs[provider] = providerConfig;
    config.updatedAt = new Date();

    await this.configRepository.save(config);

    return this.getConfig();
  }

  /**
   * PATCH /api/v1/admin/llm/budget
   * Update budget configuration
   */
  @Patch('budget')
  @ApiOperation({ summary: 'Update budget configuration' })
  @ApiResponse({
    status: 200,
    description: 'Updated configuration',
    type: LLMConfigDto,
  })
  async updateBudgetConfig(@Body() update: UpdateBudgetConfigDto): Promise<LLMConfigDto> {
    let config = await this.configRepository.findOne({
      where: { isActive: true },
    });

    if (!config) {
      config = this.configRepository.create({
        isActive: true,
        budgetConfig: {},
        createdAt: new Date(),
      });
    }

    // Initialize budget config if not exists
    if (!config.budgetConfig) {
      config.budgetConfig = {
        dailyLimit: 10,
        monthlyLimit: 100,
        hardStop: false,
        warningThreshold: 80,
      };
    }

    // Update fields
    if (update.dailyLimitUsd !== undefined) {
      config.budgetConfig.dailyLimit = update.dailyLimitUsd;
    }
    if (update.monthlyLimitUsd !== undefined) {
      config.budgetConfig.monthlyLimit = update.monthlyLimitUsd;
    }
    if (update.hardStopEnabled !== undefined) {
      config.budgetConfig.hardStop = update.hardStopEnabled;
    }
    if (update.warningThresholdPercent !== undefined) {
      config.budgetConfig.warningThreshold = update.warningThresholdPercent;
    }
    if (update.alertEmail !== undefined) {
      config.budgetConfig.alertEmail = update.alertEmail;
    }

    config.updatedAt = new Date();
    await this.configRepository.save(config);

    return this.getConfig();
  }

  /**
   * POST /api/v1/admin/llm/test-provider
   * Test provider connectivity
   */
  @Post('test-provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Test provider connectivity' })
  @ApiResponse({
    status: 200,
    description: 'Test result',
    type: ProviderTestResultDto,
  })
  async testProvider(@Body() request: TestProviderDto): Promise<ProviderTestResultDto> {
    if (!this.providerRegistry) {
      return {
        provider: request.provider,
        success: false,
        error: 'Provider registry not available',
      };
    }

    const startTime = Date.now();

    try {
      const provider = this.providerRegistry.getProvider(request.provider);
      if (!provider) {
        return {
          provider: request.provider,
          success: false,
          error: `Provider ${request.provider} not registered`,
        };
      }

      const isAvailable = await provider.isAvailable();
      const latencyMs = Date.now() - startTime;

      if (!isAvailable) {
        return {
          provider: request.provider,
          success: false,
          latencyMs,
          error: 'Provider not available (check API key or endpoint)',
        };
      }

      return {
        provider: request.provider,
        success: true,
        latencyMs,
        modelTested: provider.supportedModels[0] || 'default',
      };
    } catch (error) {
      return {
        provider: request.provider,
        success: false,
        latencyMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * GET /api/v1/llm/usage/trends
   * Get usage trend data for charts
   */
  @Get('/usage/trends')
  @ApiOperation({ summary: 'Get usage trend data' })
  @ApiResponse({
    status: 200,
    description: 'Usage trend data',
    type: UsageTrendDataDto,
  })
  async getUsageTrends(): Promise<UsageTrendDataDto> {
    const daily = await this.getDailyTrends(30);
    const weekly = await this.getWeeklyTrends(12);
    const monthly = await this.getMonthlyTrends(12);

    return { daily, weekly, monthly };
  }

  // =============================================================
  // Helper methods
  // =============================================================

  private buildProviderConfigs(config: LLMConfiguration | null): ProviderConfigDto[] {
    const providers: LLMProviderType[] = ['openai', 'anthropic', 'ollama'];
    const storedConfigs = config?.providerConfigs || {};

    return providers.map((provider) => {
      const stored = storedConfigs[provider] || {};
      const registryProvider = this.providerRegistry?.getProvider(provider);

      return {
        provider,
        enabled: stored.enabled ?? true,
        apiKeySet: stored.apiKeySet || this.hasEnvApiKey(provider),
        endpoint: stored.endpoint || this.getDefaultEndpoint(provider),
        defaultModel:
          stored.defaultModel ||
          registryProvider?.supportedModels[0] ||
          this.getDefaultModel(provider),
        priority: stored.priority ?? this.getDefaultPriority(provider),
      };
    });
  }

  private buildBudgetConfig(config: LLMConfiguration | null): BudgetConfigDto {
    const stored = config?.budgetConfig || {};

    return {
      dailyLimitUsd: stored.dailyLimit ?? 10,
      monthlyLimitUsd: stored.monthlyLimit ?? 100,
      hardStopEnabled: stored.hardStop ?? false,
      warningThresholdPercent: stored.warningThreshold ?? 80,
      alertEmail: stored.alertEmail,
    };
  }

  private getDefaultModelPreferences() {
    return [
      {
        taskType: 'atomization' as const,
        preferredProvider: 'anthropic' as const,
        preferredModel: 'claude-sonnet-4-5-20250514',
        fallbackProvider: 'openai' as const,
        fallbackModel: 'gpt-5-mini',
      },
      {
        taskType: 'refinement' as const,
        preferredProvider: 'anthropic' as const,
        preferredModel: 'claude-haiku-4-5-20250514',
        fallbackProvider: 'openai' as const,
        fallbackModel: 'gpt-5-nano',
      },
      {
        taskType: 'translation' as const,
        preferredProvider: 'ollama' as const,
        preferredModel: 'llama3.2',
        fallbackProvider: 'anthropic' as const,
        fallbackModel: 'claude-haiku-4-5-20250514',
      },
      {
        taskType: 'analysis' as const,
        preferredProvider: 'anthropic' as const,
        preferredModel: 'claude-sonnet-4-5-20250514',
        fallbackProvider: 'openai' as const,
        fallbackModel: 'gpt-5.2',
      },
      {
        taskType: 'chat' as const,
        preferredProvider: 'anthropic' as const,
        preferredModel: 'claude-haiku-4-5-20250514',
        fallbackProvider: 'openai' as const,
        fallbackModel: 'gpt-5-nano',
      },
      {
        taskType: 'code_generation' as const,
        preferredProvider: 'ollama' as const,
        preferredModel: 'llama3.2',
        fallbackProvider: 'openai' as const,
        fallbackModel: 'gpt-5-nano',
      },
      {
        taskType: 'summarization' as const,
        preferredProvider: 'openai' as const,
        preferredModel: 'gpt-5-nano',
        fallbackProvider: 'ollama' as const,
        fallbackModel: 'llama3.2',
      },
      {
        taskType: 'classification' as const,
        preferredProvider: 'openai' as const,
        preferredModel: 'gpt-5-nano',
        fallbackProvider: 'ollama' as const,
        fallbackModel: 'llama3.2',
      },
    ];
  }

  private hasEnvApiKey(provider: LLMProviderType): boolean {
    switch (provider) {
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'anthropic':
        return !!process.env.ANTHROPIC_API_KEY;
      case 'ollama':
        return true; // Local, no API key needed
      default:
        return false;
    }
  }

  private getDefaultEndpoint(provider: LLMProviderType): string | undefined {
    switch (provider) {
      case 'ollama':
        return process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
      default:
        return undefined;
    }
  }

  private getDefaultModel(provider: LLMProviderType): string {
    switch (provider) {
      case 'openai':
        return 'gpt-5-nano';
      case 'anthropic':
        return 'claude-haiku-4-5-20250514';
      case 'ollama':
        return 'llama3.2';
      default:
        return 'unknown';
    }
  }

  private getDefaultPriority(provider: LLMProviderType): number {
    switch (provider) {
      case 'ollama':
        return 1; // Prefer local
      case 'anthropic':
        return 2;
      case 'openai':
        return 3;
      default:
        return 10;
    }
  }

  private async getDailyTrends(days: number): Promise<UsageDataPointDto[]> {
    const results = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        'DATE(u.created_at) as date',
        'COALESCE(SUM(u.total_cost), 0)::numeric as cost',
        'COALESCE(SUM(u.total_tokens), 0)::int as tokens',
        'COUNT(*)::int as requests',
      ])
      .where('u.created_at >= :start', {
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      })
      .groupBy('DATE(u.created_at)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      date: r.date,
      cost: Number(r.cost) || 0,
      tokens: Number(r.tokens) || 0,
      requests: Number(r.requests) || 0,
    }));
  }

  private async getWeeklyTrends(weeks: number): Promise<UsageDataPointDto[]> {
    const results = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        "DATE_TRUNC('week', u.created_at)::date as date",
        'COALESCE(SUM(u.total_cost), 0)::numeric as cost',
        'COALESCE(SUM(u.total_tokens), 0)::int as tokens',
        'COUNT(*)::int as requests',
      ])
      .where('u.created_at >= :start', {
        start: new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000),
      })
      .groupBy("DATE_TRUNC('week', u.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      date: r.date,
      cost: Number(r.cost) || 0,
      tokens: Number(r.tokens) || 0,
      requests: Number(r.requests) || 0,
    }));
  }

  private async getMonthlyTrends(months: number): Promise<UsageDataPointDto[]> {
    const results = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        "DATE_TRUNC('month', u.created_at)::date as date",
        'COALESCE(SUM(u.total_cost), 0)::numeric as cost',
        'COALESCE(SUM(u.total_tokens), 0)::int as tokens',
        'COUNT(*)::int as requests',
      ])
      .where('u.created_at >= :start', {
        start: new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000),
      })
      .groupBy("DATE_TRUNC('month', u.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();

    return results.map((r) => ({
      date: r.date,
      cost: Number(r.cost) || 0,
      tokens: Number(r.tokens) || 0,
      requests: Number(r.requests) || 0,
    }));
  }
}
