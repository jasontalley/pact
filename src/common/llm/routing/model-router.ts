/**
 * Model Router Service
 *
 * Intelligent model selection based on task type, cost constraints,
 * and provider availability. Routes requests to the optimal
 * provider/model combination.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AgentTaskType, LLMProviderType, ModelCapabilities } from '../providers/types';
import { ProviderRegistry } from '../providers/provider-registry';
import {
  RoutingRule,
  RoutingDecision,
  RoutingOptions,
  RouterConfig,
  BudgetMode,
  FallbackStrategy,
} from './types';

/**
 * Default routing rules based on Phase 3.5 specification
 *
 * Optimized for cost-effectiveness while maintaining quality.
 */
const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    taskType: AgentTaskType.ATOMIZATION,
    preferredProviders: ['anthropic', 'openai', 'ollama'],
    preferredModels: ['claude-sonnet-4-5', 'gpt-5-mini', 'llama3.2'],
    requiresFunctionCalling: true,
    fallbackStrategy: 'next_model',
    description: 'Atomization requires structured analysis - Sonnet excels at this',
  },
  {
    taskType: AgentTaskType.CODE_GENERATION,
    preferredProviders: ['ollama', 'openai', 'anthropic'],
    preferredModels: ['llama3.2', 'qwen2.5-coder', 'gpt-5-nano', 'claude-haiku-4-5'],
    requiresFunctionCalling: false,
    fallbackStrategy: 'next_model',
    description: 'Code generation - local first for privacy, cheap cloud fallback',
  },
  {
    taskType: AgentTaskType.REFINEMENT,
    preferredProviders: ['anthropic', 'openai', 'ollama'],
    preferredModels: ['claude-haiku-4-5', 'gpt-5-nano', 'llama3.2'],
    requiresFunctionCalling: false,
    fallbackStrategy: 'next_model',
    description: 'Refinement iterations - fast and cheap',
  },
  {
    taskType: AgentTaskType.TRANSLATION,
    preferredProviders: ['ollama', 'anthropic', 'openai'],
    preferredModels: ['llama3.2', 'claude-haiku-4-5', 'gpt-5-nano'],
    requiresFunctionCalling: false,
    fallbackStrategy: 'next_model',
    description: 'Format translation - local first for privacy',
  },
  {
    taskType: AgentTaskType.ANALYSIS,
    preferredProviders: ['anthropic', 'openai', 'ollama'],
    preferredModels: ['claude-sonnet-4-5', 'gpt-5.2', 'llama3.3'],
    minContextWindow: 100000,
    requiresFunctionCalling: true,
    reasoningEffort: 'medium',
    fallbackStrategy: 'next_provider',
    description: 'Deep analysis requires strong reasoning capabilities',
  },
  {
    taskType: AgentTaskType.CLASSIFICATION,
    // Haiku is fastest (~3s), Ollama available as free fallback
    preferredProviders: ['anthropic', 'ollama', 'openai'],
    preferredModels: ['claude-haiku-4-5', 'llama3.2', 'gpt-5-nano'],
    requiresFunctionCalling: false,
    maxCostPerRequest: 0.01, // Keep classification very cheap
    fallbackStrategy: 'next_model',
    description: 'Simple categorization - haiku is fast, ollama fallback',
  },
  {
    taskType: AgentTaskType.SUMMARIZATION,
    // Haiku is fastest (~3s), Ollama available as free fallback
    preferredProviders: ['anthropic', 'ollama', 'openai'],
    preferredModels: ['claude-haiku-4-5', 'llama3.2', 'gpt-5-nano'],
    requiresFunctionCalling: false,
    maxCostPerRequest: 0.05,
    fallbackStrategy: 'next_model',
    description: 'High-throughput summarization - haiku is fast, ollama fallback',
  },
  {
    taskType: AgentTaskType.CHAT,
    preferredProviders: ['anthropic', 'openai', 'ollama'],
    preferredModels: ['claude-haiku-4-5', 'gpt-5-nano', 'llama3.2'],
    requiresFunctionCalling: true,
    fallbackStrategy: 'next_model',
    description: 'Conversational with tool use - requires function calling support',
  },
];

/**
 * Economy mode overrides - prefer cheapest options
 */
const ECONOMY_MODE_RULES: Partial<Record<AgentTaskType, Partial<RoutingRule>>> = {
  [AgentTaskType.ATOMIZATION]: {
    preferredProviders: ['ollama', 'openai', 'anthropic'],
    preferredModels: ['llama3.2', 'gpt-5-nano', 'claude-haiku-4-5'],
  },
  [AgentTaskType.CODE_GENERATION]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.2', 'qwen2.5-coder', 'gpt-5-nano'],
  },
  [AgentTaskType.ANALYSIS]: {
    preferredProviders: ['ollama', 'openai', 'anthropic'],
    preferredModels: ['llama3.3', 'gpt-5-mini', 'claude-haiku-4-5'],
    reasoningEffort: 'low',
  },
  [AgentTaskType.CHAT]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.2', 'gpt-5-nano'],
  },
};

/**
 * Strict budget mode - only free/cheapest options
 */
const STRICT_MODE_RULES: Partial<Record<AgentTaskType, Partial<RoutingRule>>> = {
  [AgentTaskType.ATOMIZATION]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.2', 'gpt-5-nano'],
  },
  [AgentTaskType.CODE_GENERATION]: {
    preferredProviders: ['ollama'],
    preferredModels: ['llama3.2', 'qwen2.5-coder', 'codellama'],
  },
  [AgentTaskType.REFINEMENT]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.2', 'gpt-5-nano'],
  },
  [AgentTaskType.TRANSLATION]: {
    preferredProviders: ['ollama'],
    preferredModels: ['llama3.2'],
  },
  [AgentTaskType.ANALYSIS]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.3', 'llama3.2', 'gpt-5-nano'],
  },
  [AgentTaskType.CLASSIFICATION]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.2', 'gpt-5-nano'],
  },
  [AgentTaskType.SUMMARIZATION]: {
    preferredProviders: ['ollama', 'openai'],
    preferredModels: ['llama3.2', 'gpt-5-nano'],
  },
  [AgentTaskType.CHAT]: {
    preferredProviders: ['ollama'],
    preferredModels: ['llama3.2'],
  },
};

/**
 * Model Router Service
 */
@Injectable()
export class ModelRouter implements OnModuleInit {
  private readonly logger = new Logger(ModelRouter.name);
  private config: RouterConfig;
  private routingRules: Map<AgentTaskType, RoutingRule> = new Map();

  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly configService: ConfigService,
  ) {
    this.config = this.loadConfig();
  }

  /**
   * Load router configuration
   */
  private loadConfig(): RouterConfig {
    const budgetMode = this.configService.get<string>('LLM_BUDGET_MODE') as BudgetMode | undefined;

    return {
      defaultBudgetMode: budgetMode || 'normal',
      preferLocalModels: this.configService.get<string>('LLM_PREFER_LOCAL') === 'true',
      defaultFallbackStrategy: 'next_model',
      enableFailover: true,
      customRules: [],
    };
  }

  /**
   * Initialize routing rules
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Model Router...');

    // Load default rules
    for (const rule of DEFAULT_ROUTING_RULES) {
      this.routingRules.set(rule.taskType, rule);
    }

    // Apply custom rules if any
    if (this.config.customRules) {
      for (const rule of this.config.customRules) {
        this.routingRules.set(rule.taskType, rule);
      }
    }

    this.logger.log(`Loaded ${this.routingRules.size} routing rules`);
    this.logger.log(`Default budget mode: ${this.config.defaultBudgetMode}`);
  }

  /**
   * Route a request to the best provider/model combination
   */
  async route(options: RoutingOptions): Promise<RoutingDecision> {
    const { taskType, budgetMode = this.config.defaultBudgetMode } = options;

    this.logger.debug(`Routing request: taskType=${taskType}, budgetMode=${budgetMode}`);

    // Handle forced provider/model
    if (options.forceProvider && options.forceModel) {
      return this.createForcedDecision(options.forceProvider, options.forceModel, options);
    }

    // Get base rule for task type
    const baseRule = this.routingRules.get(taskType);
    if (!baseRule) {
      throw new Error(`No routing rule found for task type: ${taskType}`);
    }

    // Apply budget mode modifications
    const rule = this.applyBudgetMode(baseRule, budgetMode);

    // Apply routing constraints
    const filteredRule = this.applyConstraints(rule, options);

    // Find best available provider/model
    const decision = await this.findBestOption(filteredRule, options);

    this.logger.log(
      `Routed ${taskType} to ${decision.provider}:${decision.model} (${decision.reason})`,
    );

    return decision;
  }

  /**
   * Apply budget mode modifications to a rule
   */
  private applyBudgetMode(rule: RoutingRule, mode: BudgetMode): RoutingRule {
    if (mode === 'normal') {
      return rule;
    }

    const overrides =
      mode === 'economy' ? ECONOMY_MODE_RULES[rule.taskType] : STRICT_MODE_RULES[rule.taskType];

    if (!overrides) {
      return rule;
    }

    return {
      ...rule,
      ...overrides,
    };
  }

  /**
   * Apply routing constraints to filter options
   */
  private applyConstraints(rule: RoutingRule, options: RoutingOptions): RoutingRule {
    const filtered = { ...rule };

    // Filter by local/cloud preference
    if (options.allowLocalModels === false) {
      filtered.preferredProviders = filtered.preferredProviders.filter((p) => p !== 'ollama');
    }
    if (options.allowCloudModels === false) {
      filtered.preferredProviders = filtered.preferredProviders.filter((p) => p === 'ollama');
    }

    // Filter by max cost
    if (options.maxCost !== undefined) {
      filtered.maxCostPerRequest = Math.min(
        filtered.maxCostPerRequest || Infinity,
        options.maxCost,
      );
    }

    return filtered;
  }

  /**
   * Find the best available provider/model combination
   */
  private async findBestOption(
    rule: RoutingRule,
    options: RoutingOptions,
  ): Promise<RoutingDecision> {
    // Collect ALL available provider/model combinations for fallback
    const allOptions: Array<{
      provider: LLMProviderType;
      model: string;
      capabilities: ModelCapabilities;
      meetsConstraints: boolean;
    }> = [];

    // Try each provider in order of preference
    for (const providerName of rule.preferredProviders) {
      const provider = this.providerRegistry.getProvider(providerName);
      if (!provider) {
        this.logger.debug(`Provider ${providerName} not registered, skipping`);
        continue;
      }

      // Check provider availability
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        this.logger.debug(`Provider ${providerName} not available, skipping`);
        continue;
      }

      // Try each model in order of preference
      for (const modelName of rule.preferredModels) {
        // Check if this provider supports this model
        if (!provider.supportedModels.includes(modelName)) {
          continue;
        }

        const capabilities = provider.getModelCapabilities(modelName);
        if (!capabilities) {
          continue;
        }

        const meetsConstraints = this.meetsConstraints(capabilities, rule, options);
        allOptions.push({
          provider: providerName,
          model: modelName,
          capabilities,
          meetsConstraints,
        });
      }
    }

    // Sort: options meeting constraints first, then by provider preference order
    const sortedOptions = allOptions.sort((a, b) => {
      if (a.meetsConstraints && !b.meetsConstraints) return -1;
      if (!a.meetsConstraints && b.meetsConstraints) return 1;
      return 0;
    });

    // Find the best option (first one that meets constraints)
    const bestOption = sortedOptions.find((opt) => opt.meetsConstraints);

    if (bestOption) {
      // Build fallbacks from remaining options (different providers for resilience)
      const fallbacks = sortedOptions
        .filter((opt) => opt.provider !== bestOption.provider)
        .map((opt) => ({ provider: opt.provider, model: opt.model }));

      this.logger.debug(
        `Selected ${bestOption.provider}:${bestOption.model} with ${fallbacks.length} fallbacks`,
      );

      return {
        provider: bestOption.provider,
        model: bestOption.model,
        capabilities: bestOption.capabilities,
        estimatedCostPer1K:
          (bestOption.capabilities.costPerInputToken + bestOption.capabilities.costPerOutputToken) *
          500,
        reasoningEffort: rule.reasoningEffort,
        reason: `Best match for ${rule.taskType}`,
        fallbacks,
      };
    }

    // No suitable option found - try fallback strategy
    if (rule.fallbackStrategy === 'fail') {
      throw new Error(`No suitable provider/model found for task type: ${rule.taskType}`);
    }

    // Return first fallback if available (even if it doesn't meet all constraints)
    if (sortedOptions.length > 0) {
      const fallback = sortedOptions[0];
      const fallbacks = sortedOptions
        .slice(1)
        .map((opt) => ({ provider: opt.provider, model: opt.model }));

      return {
        provider: fallback.provider,
        model: fallback.model,
        capabilities: fallback.capabilities,
        estimatedCostPer1K:
          (fallback.capabilities.costPerInputToken + fallback.capabilities.costPerOutputToken) *
          500,
        reasoningEffort: rule.reasoningEffort,
        reason: `Fallback: constraints relaxed for ${rule.taskType}`,
        fallbacks,
      };
    }

    throw new Error(`No available provider/model for task type: ${rule.taskType}`);
  }

  /**
   * Check if model capabilities meet the routing constraints
   */
  private meetsConstraints(
    capabilities: ModelCapabilities,
    rule: RoutingRule,
    options: RoutingOptions,
  ): boolean {
    // Check context window
    if (rule.minContextWindow && capabilities.contextWindow < rule.minContextWindow) {
      return false;
    }

    // Check function calling requirement
    if (rule.requiresFunctionCalling && !capabilities.supportsFunctionCalling) {
      return false;
    }

    // Check cost constraint
    if (rule.maxCostPerRequest !== undefined) {
      const estimatedCost = this.estimateCost(capabilities, options);
      if (estimatedCost > rule.maxCostPerRequest) {
        return false;
      }
    }

    return true;
  }

  /**
   * Estimate cost for a request
   */
  private estimateCost(capabilities: ModelCapabilities, options: RoutingOptions): number {
    const inputTokens = options.estimatedInputTokens || 1000;
    const outputTokens = options.estimatedOutputTokens || 500;

    const inputCost = inputTokens * capabilities.costPerInputToken;
    const outputCost = outputTokens * capabilities.costPerOutputToken;

    return inputCost + outputCost;
  }

  /**
   * Create a decision for forced provider/model
   */
  private createForcedDecision(
    providerName: LLMProviderType,
    modelName: string,
    options: RoutingOptions,
  ): RoutingDecision {
    const provider = this.providerRegistry.getProvider(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not registered`);
    }

    const capabilities = provider.getModelCapabilities(modelName);
    if (!capabilities) {
      throw new Error(`Model ${modelName} not supported by ${providerName}`);
    }

    return {
      provider: providerName,
      model: modelName,
      capabilities,
      estimatedCostPer1K: (capabilities.costPerInputToken + capabilities.costPerOutputToken) * 500,
      reason: 'Forced selection',
      fallbacks: [],
    };
  }

  /**
   * Get routing rule for a task type
   */
  getRoutingRule(taskType: AgentTaskType): RoutingRule | undefined {
    return this.routingRules.get(taskType);
  }

  /**
   * Get all routing rules
   */
  getAllRoutingRules(): RoutingRule[] {
    return Array.from(this.routingRules.values());
  }

  /**
   * Update a routing rule dynamically
   */
  setRoutingRule(rule: RoutingRule): void {
    this.routingRules.set(rule.taskType, rule);
    this.logger.log(`Updated routing rule for ${rule.taskType}`);
  }

  /**
   * Get recommended models for a task type
   */
  getRecommendedModels(
    taskType: AgentTaskType,
    budgetMode: BudgetMode = 'normal',
  ): Array<{ provider: LLMProviderType; model: string; cost: string }> {
    const rule = this.routingRules.get(taskType);
    if (!rule) {
      return [];
    }

    const effectiveRule = this.applyBudgetMode(rule, budgetMode);
    const recommendations: Array<{ provider: LLMProviderType; model: string; cost: string }> = [];

    for (const providerName of effectiveRule.preferredProviders) {
      const provider = this.providerRegistry.getProvider(providerName);
      if (!provider) continue;

      for (const modelName of effectiveRule.preferredModels) {
        if (!provider.supportedModels.includes(modelName)) continue;

        const capabilities = provider.getModelCapabilities(modelName);
        if (!capabilities) continue;

        const costPer1K = (capabilities.costPerInputToken + capabilities.costPerOutputToken) * 500;
        const costStr = costPer1K === 0 ? 'Free' : `$${costPer1K.toFixed(4)}/1K`;

        recommendations.push({
          provider: providerName,
          model: modelName,
          cost: costStr,
        });
      }
    }

    return recommendations;
  }

  /**
   * Estimate cost for a task
   */
  estimateTaskCost(
    taskType: AgentTaskType,
    inputTokens: number,
    outputTokens: number,
    budgetMode: BudgetMode = 'normal',
  ): { minCost: number; maxCost: number; recommendedModel: string } {
    const rule = this.routingRules.get(taskType);
    if (!rule) {
      return { minCost: 0, maxCost: 0, recommendedModel: 'unknown' };
    }

    const effectiveRule = this.applyBudgetMode(rule, budgetMode);
    let minCost = Infinity;
    let maxCost = 0;
    let recommendedModel = 'unknown';

    for (const providerName of effectiveRule.preferredProviders) {
      const provider = this.providerRegistry.getProvider(providerName);
      if (!provider) continue;

      for (const modelName of effectiveRule.preferredModels) {
        if (!provider.supportedModels.includes(modelName)) continue;

        const capabilities = provider.getModelCapabilities(modelName);
        if (!capabilities) continue;

        const cost =
          inputTokens * capabilities.costPerInputToken +
          outputTokens * capabilities.costPerOutputToken;

        if (cost < minCost) {
          minCost = cost;
          recommendedModel = `${providerName}:${modelName}`;
        }
        maxCost = Math.max(maxCost, cost);
      }
    }

    return {
      minCost: minCost === Infinity ? 0 : minCost,
      maxCost,
      recommendedModel,
    };
  }
}
