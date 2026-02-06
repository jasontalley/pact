/**
 * LLM Controller
 *
 * REST API endpoints for LLM provider management, model information,
 * usage tracking, and cost estimation.
 */

import { Controller, Get, Post, Body, Query, HttpCode, HttpStatus, Optional } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual } from 'typeorm';

import { ProviderRegistry } from '../../common/llm/providers/provider-registry';
import { ModelRouter } from '../../common/llm/routing/model-router';
import { AgentTaskType, LLMProviderType } from '../../common/llm/providers/types';
import { BudgetMode } from '../../common/llm/routing/types';
import { LLMUsageTracking } from './llm-usage-tracking.entity';
import { LLMConfiguration } from './llm-configuration.entity';
import { ProviderListResponseDto, ProviderStatusDto } from './dto/provider-status.dto';
import { ModelListResponseDto, ModelInfoDto, ModelQueryDto } from './dto/model-info.dto';
import {
  UsageSummaryDto,
  UsageQueryDto,
  ProviderUsageDto,
  ModelUsageDto,
  AgentUsageDto,
} from './dto/usage-summary.dto';
import {
  CostEstimateRequestDto,
  CostEstimateResponseDto,
  ModelRecommendationDto,
} from './dto/cost-estimate.dto';
import { UsageTrendDataDto, UsageDataPointDto } from './dto/llm-admin.dto';

@ApiTags('llm')
@Controller('llm')
export class LLMController {
  constructor(
    @InjectRepository(LLMUsageTracking)
    private readonly usageRepository: Repository<LLMUsageTracking>,
    @InjectRepository(LLMConfiguration)
    private readonly configRepository: Repository<LLMConfiguration>,
    @Optional() private readonly providerRegistry?: ProviderRegistry,
    @Optional() private readonly modelRouter?: ModelRouter,
  ) {}

  /**
   * GET /api/v1/llm/providers
   * List all registered providers with their status
   */
  @Get('providers')
  @ApiOperation({ summary: 'Get all LLM providers and their status' })
  @ApiResponse({
    status: 200,
    description: 'List of providers with status information',
    type: ProviderListResponseDto,
  })
  async getProviders(): Promise<ProviderListResponseDto> {
    if (!this.providerRegistry) {
      return {
        providers: [],
        availableCount: 0,
        totalCount: 0,
      };
    }

    const statuses = this.providerRegistry.getProviderStatuses();
    const providers: ProviderStatusDto[] = statuses.map((status) => ({
      name: status.name,
      displayName: status.displayName,
      available: status.available,
      health: status.health,
      supportedModels: status.supportedModels,
      defaultModel: status.defaultModel,
    }));

    return {
      providers,
      availableCount: providers.filter((p) => p.available).length,
      totalCount: providers.length,
    };
  }

  /**
   * GET /api/v1/llm/models
   * List all available models with their capabilities
   */
  @Get('models')
  @ApiOperation({ summary: 'Get all available models with capabilities' })
  @ApiQuery({ name: 'provider', required: false, enum: ['openai', 'anthropic', 'ollama'] })
  @ApiQuery({ name: 'supportsVision', required: false, type: Boolean })
  @ApiQuery({ name: 'supportsFunctionCalling', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'List of models with capabilities',
    type: ModelListResponseDto,
  })
  async getModels(@Query() query: ModelQueryDto): Promise<ModelListResponseDto> {
    if (!this.providerRegistry) {
      return {
        models: [],
        totalCount: 0,
      };
    }

    const allModels = this.providerRegistry.getAllAvailableModels();
    let models: ModelInfoDto[] = allModels.map((m) => {
      const costPer1K =
        (m.capabilities.costPerInputToken + m.capabilities.costPerOutputToken) * 500;
      return {
        model: m.model,
        provider: m.provider,
        capabilities: m.capabilities,
        costPer1K: costPer1K === 0 ? 'Free' : `$${costPer1K.toFixed(4)}`,
        isLocal: m.provider === 'ollama',
      };
    });

    // Apply filters
    if (query.provider) {
      models = models.filter((m) => m.provider === query.provider);
    }
    if (query.supportsVision !== undefined) {
      const supportsVision = String(query.supportsVision) === 'true';
      models = models.filter((m) => m.capabilities.supportsVision === supportsVision);
    }
    if (query.supportsFunctionCalling !== undefined) {
      const supportsFunctionCalling = String(query.supportsFunctionCalling) === 'true';
      models = models.filter(
        (m) => m.capabilities.supportsFunctionCalling === supportsFunctionCalling,
      );
    }

    return {
      models,
      totalCount: models.length,
      filter:
        query.provider ||
        query.supportsVision !== undefined ||
        query.supportsFunctionCalling !== undefined
          ? {
              provider: query.provider,
              supportsVision:
                query.supportsVision !== undefined
                  ? String(query.supportsVision) === 'true'
                  : undefined,
              supportsFunctionCalling:
                query.supportsFunctionCalling !== undefined
                  ? String(query.supportsFunctionCalling) === 'true'
                  : undefined,
            }
          : undefined,
    };
  }

  /**
   * GET /api/v1/llm/usage/summary
   * Get usage statistics and cost summary
   */
  @Get('usage/summary')
  @ApiOperation({ summary: 'Get LLM usage statistics and cost summary' })
  @ApiQuery({ name: 'period', required: false, enum: ['day', 'week', 'month'] })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({
    status: 200,
    description: 'Usage summary with cost breakdown',
    type: UsageSummaryDto,
  })
  async getUsageSummary(@Query() query: UsageQueryDto): Promise<UsageSummaryDto> {
    const { start, end, periodType } = this.calculatePeriod(query);

    // Get total statistics
    const totals = await this.getTotalStats(start, end);

    // Get breakdown by provider
    const byProvider = await this.getStatsByProvider(start, end);

    // Get breakdown by model
    const byModel = await this.getStatsByModel(start, end);

    // Get breakdown by agent
    const byAgent = await this.getStatsByAgent(start, end);

    // Get budget status
    const budget = await this.getBudgetStatus();

    return {
      period: { start, end, type: periodType },
      totals,
      byProvider,
      byModel,
      byAgent,
      budget,
    };
  }

  /**
   * POST /api/v1/llm/estimate
   * Estimate cost for an operation
   */
  @Post('estimate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Estimate cost for an LLM operation' })
  @ApiResponse({
    status: 200,
    description: 'Cost estimate with recommendations',
    type: CostEstimateResponseDto,
  })
  async estimateCost(@Body() request: CostEstimateRequestDto): Promise<CostEstimateResponseDto> {
    const budgetMode = request.budgetMode || 'normal';

    // Get cost estimate from router
    const estimate = this.modelRouter?.estimateTaskCost(
      request.taskType,
      request.inputTokens,
      request.outputTokens,
      budgetMode,
    );

    // Get all recommendations
    const recommendedModels =
      this.modelRouter?.getRecommendedModels(request.taskType, budgetMode) || [];

    const recommendations: ModelRecommendationDto[] = recommendedModels.map((rec, index) => {
      const capabilities = this.providerRegistry?.getModelCapabilities(rec.model);
      const estimatedCost = capabilities
        ? request.inputTokens * capabilities.costPerInputToken +
          request.outputTokens * capabilities.costPerOutputToken
        : 0;

      return {
        provider: rec.provider,
        model: rec.model,
        estimatedCost,
        formattedCost: estimatedCost === 0 ? 'Free' : `$${estimatedCost.toFixed(6)}`,
        reason: index === 0 ? 'Primary recommendation' : `Alternative ${index}`,
        isPrimary: index === 0,
      };
    });

    const minCost = estimate?.minCost || 0;
    const maxCost = estimate?.maxCost || 0;
    const localAvailable = recommendations.some((r) => r.provider === 'ollama');

    return {
      taskType: request.taskType,
      budgetMode,
      inputTokens: request.inputTokens,
      outputTokens: request.outputTokens,
      minCost,
      maxCost,
      formattedMinCost: minCost === 0 ? 'Free' : `$${minCost.toFixed(6)}`,
      formattedMaxCost: maxCost === 0 ? 'Free' : `$${maxCost.toFixed(6)}`,
      recommendedModel: estimate?.recommendedModel || 'unknown',
      recommendations,
      localModelsAvailable: localAvailable,
    };
  }

  /**
   * GET /api/v1/llm/usage/trends
   * Get usage trend data for charts
   */
  @Get('usage/trends')
  @ApiOperation({ summary: 'Get usage trend data for charts' })
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

  private calculatePeriod(query: UsageQueryDto): {
    start: Date;
    end: Date;
    periodType: 'day' | 'week' | 'month' | 'custom';
  } {
    const end = new Date();
    let start: Date;
    let periodType: 'day' | 'week' | 'month' | 'custom';

    if (query.startDate && query.endDate) {
      start = new Date(query.startDate);
      end.setTime(new Date(query.endDate).getTime());
      periodType = 'custom';
    } else {
      const period = query.period || 'day';
      periodType = period;

      switch (period) {
        case 'week':
          start = new Date(end);
          start.setDate(start.getDate() - 7);
          break;
        case 'month':
          start = new Date(end.getFullYear(), end.getMonth(), 1);
          break;
        case 'day':
        default:
          start = new Date(end);
          start.setHours(0, 0, 0, 0);
          break;
      }
    }

    return { start, end, periodType };
  }

  private async getTotalStats(start: Date, end: Date) {
    const result = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        'COUNT(*)::int as requests',
        'COUNT(*) FILTER (WHERE u.success = true)::int as "successfulRequests"',
        'COUNT(*) FILTER (WHERE u.success = false)::int as "failedRequests"',
        'COALESCE(SUM(u.input_tokens), 0)::int as "inputTokens"',
        'COALESCE(SUM(u.output_tokens), 0)::int as "outputTokens"',
        'COALESCE(SUM(u.total_tokens), 0)::int as "totalTokens"',
        'COALESCE(SUM(u.total_cost), 0)::numeric as "totalCost"',
        'COALESCE(AVG(u.latency_ms), 0)::int as "averageLatencyMs"',
        'CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE u.cache_hit = true)::float / COUNT(*)::float ELSE 0 END as "cacheHitRate"',
      ])
      .where('u.created_at BETWEEN :start AND :end', { start, end })
      .getRawOne();

    return {
      requests: Number(result?.requests) || 0,
      successfulRequests: Number(result?.successfulRequests) || 0,
      failedRequests: Number(result?.failedRequests) || 0,
      inputTokens: Number(result?.inputTokens) || 0,
      outputTokens: Number(result?.outputTokens) || 0,
      totalTokens: Number(result?.totalTokens) || 0,
      totalCost: Number(result?.totalCost) || 0,
      averageLatencyMs: Number(result?.averageLatencyMs) || 0,
      cacheHitRate: Number(result?.cacheHitRate) || 0,
    };
  }

  private async getStatsByProvider(start: Date, end: Date): Promise<ProviderUsageDto[]> {
    const results = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        'u.provider as provider',
        'COUNT(*)::int as "totalRequests"',
        'COUNT(*) FILTER (WHERE u.success = true)::int as "successfulRequests"',
        'COUNT(*) FILTER (WHERE u.success = false)::int as "failedRequests"',
        'COALESCE(SUM(u.input_tokens), 0)::int as "inputTokens"',
        'COALESCE(SUM(u.output_tokens), 0)::int as "outputTokens"',
        'COALESCE(SUM(u.total_tokens), 0)::int as "totalTokens"',
        'COALESCE(SUM(u.total_cost), 0)::numeric as "totalCost"',
        'COALESCE(AVG(u.latency_ms), 0)::int as "averageLatencyMs"',
        'CASE WHEN COUNT(*) > 0 THEN COUNT(*) FILTER (WHERE u.cache_hit = true)::float / COUNT(*)::float ELSE 0 END as "cacheHitRate"',
      ])
      .where('u.created_at BETWEEN :start AND :end', { start, end })
      .groupBy('u.provider')
      .getRawMany();

    return results.map((r) => ({
      provider: r.provider as LLMProviderType,
      totalRequests: Number(r.totalRequests) || 0,
      successfulRequests: Number(r.successfulRequests) || 0,
      failedRequests: Number(r.failedRequests) || 0,
      inputTokens: Number(r.inputTokens) || 0,
      outputTokens: Number(r.outputTokens) || 0,
      totalTokens: Number(r.totalTokens) || 0,
      totalCost: Number(r.totalCost) || 0,
      averageLatencyMs: Number(r.averageLatencyMs) || 0,
      cacheHitRate: Number(r.cacheHitRate) || 0,
    }));
  }

  private async getStatsByModel(start: Date, end: Date): Promise<ModelUsageDto[]> {
    const results = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        'u.model_name as model',
        'u.provider as provider',
        'COUNT(*)::int as "totalRequests"',
        'COALESCE(SUM(u.total_tokens), 0)::int as "totalTokens"',
        'COALESCE(SUM(u.total_cost), 0)::numeric as "totalCost"',
      ])
      .where('u.created_at BETWEEN :start AND :end', { start, end })
      .groupBy('u.model_name, u.provider')
      .orderBy('"totalCost"', 'DESC')
      .limit(10)
      .getRawMany();

    return results.map((r) => ({
      model: r.model,
      provider: r.provider as LLMProviderType,
      totalRequests: Number(r.totalRequests) || 0,
      totalTokens: Number(r.totalTokens) || 0,
      totalCost: Number(r.totalCost) || 0,
    }));
  }

  private async getStatsByAgent(start: Date, end: Date): Promise<AgentUsageDto[]> {
    const results = await this.usageRepository
      .createQueryBuilder('u')
      .select([
        'COALESCE(u.agent_name, \'unknown\') as "agentName"',
        'COUNT(*)::int as "totalRequests"',
        'COALESCE(SUM(u.total_tokens), 0)::int as "totalTokens"',
        'COALESCE(SUM(u.total_cost), 0)::numeric as "totalCost"',
        'COALESCE(AVG(u.latency_ms), 0)::int as "averageLatencyMs"',
      ])
      .where('u.created_at BETWEEN :start AND :end', { start, end })
      .groupBy('u.agent_name')
      .orderBy('"totalCost"', 'DESC')
      .limit(10)
      .getRawMany();

    return results.map((r) => ({
      agentName: r.agentName,
      totalRequests: Number(r.totalRequests) || 0,
      totalTokens: Number(r.totalTokens) || 0,
      totalCost: Number(r.totalCost) || 0,
      averageLatencyMs: Number(r.averageLatencyMs) || 0,
    }));
  }

  private async getBudgetStatus() {
    // Get active configuration
    const config = await this.configRepository.findOne({
      where: { isActive: true },
    });

    const dailyLimit = config?.budgetConfig?.dailyLimit || 10;
    const monthlyLimit = config?.budgetConfig?.monthlyLimit || 100;
    const hardStop = config?.budgetConfig?.hardStop || false;

    // Calculate daily cost
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyCostResult = await this.usageRepository
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.total_cost), 0)::numeric as total')
      .where('u.created_at >= :today', { today })
      .andWhere('u.success = :success', { success: true })
      .getRawOne();

    const dailyCost = Number(dailyCostResult?.total) || 0;

    // Calculate monthly cost
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const monthlyCostResult = await this.usageRepository
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.total_cost), 0)::numeric as total')
      .where('u.created_at >= :monthStart', { monthStart })
      .andWhere('u.success = :success', { success: true })
      .getRawOne();

    const monthlyCost = Number(monthlyCostResult?.total) || 0;

    return {
      dailyCost,
      dailyLimit,
      dailyUtilization: dailyLimit > 0 ? (dailyCost / dailyLimit) * 100 : 0,
      monthlyCost,
      monthlyLimit,
      monthlyUtilization: monthlyLimit > 0 ? (monthlyCost / monthlyLimit) * 100 : 0,
      hardStopEnabled: hardStop,
    };
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
