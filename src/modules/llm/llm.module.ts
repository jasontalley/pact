import { Module, Global, Logger } from '@nestjs/common';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { LLMService } from '../../common/llm/llm.service';
import { ProviderRegistry } from '../../common/llm/providers/provider-registry';
import { ModelRouter } from '../../common/llm/routing/model-router';
import { BatchLlmService } from '../../common/llm/batch/batch.service';
import { AnthropicBatchProvider } from '../../common/llm/batch/anthropic-batch.provider';
import { OpenAIBatchProvider } from '../../common/llm/batch/openai-batch.provider';
import { BatchJobEntity } from '../../common/llm/batch/batch-job.entity';
import { LLMConfiguration } from './llm-configuration.entity';
import { LLMUsageTracking } from './llm-usage-tracking.entity';
import { LLMController } from './llm.controller';
import { LLMAdminController } from './llm-admin.controller';

/**
 * Global LLM Module
 *
 * This module provides the LLM service to all parts of the application.
 * It's marked as @Global() so it doesn't need to be imported in every module.
 *
 * Components:
 * - ProviderRegistry: Manages LLM providers (OpenAI, Anthropic, Ollama)
 * - ModelRouter: Intelligent model selection based on task type
 * - LLMService: Main service for LLM invocation with resilience patterns
 * - BatchLlmService: Batch API for high-volume non-interactive LLM workloads
 * - LLMController: REST API for provider/model management and usage tracking
 * - LLMAdminController: Admin API for configuration management
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LLMConfiguration, LLMUsageTracking, BatchJobEntity])],
  controllers: [LLMController, LLMAdminController],
  providers: [
    ProviderRegistry,
    ModelRouter,
    LLMService,
    {
      provide: BatchLlmService,
      useFactory: async (
        configService: ConfigService,
        configRepository: Repository<LLMConfiguration>,
      ): Promise<BatchLlmService> => {
        const logger = new Logger('BatchLlmServiceFactory');
        const service = new BatchLlmService();

        // Try DB-stored keys first (same pattern as ProviderRegistry.mergeDbConfig)
        let anthropicKey: string | undefined;
        let openaiKey: string | undefined;

        try {
          const dbConfig = await configRepository.findOne({
            where: { isActive: true },
          });
          if (dbConfig?.providerConfigs) {
            anthropicKey = dbConfig.providerConfigs.anthropic?.apiKey;
            openaiKey = dbConfig.providerConfigs.openai?.apiKey;
            if (anthropicKey)
              logger.log('Loaded Anthropic API key from database for batch service');
            if (openaiKey) logger.log('Loaded OpenAI API key from database for batch service');
          }
        } catch (error) {
          logger.warn(
            `Failed to load batch config from database: ${error instanceof Error ? error.message : error}`,
          );
        }

        // Fallback to env vars
        anthropicKey = anthropicKey || configService.get<string>('ANTHROPIC_API_KEY');
        openaiKey = openaiKey || configService.get<string>('OPENAI_API_KEY');

        if (anthropicKey) {
          service.registerProvider(new AnthropicBatchProvider(anthropicKey));
        }
        if (openaiKey) {
          service.registerProvider(new OpenAIBatchProvider(openaiKey));
        }

        // Set up lazy initializer for when DB config isn't available at startup
        // (e.g., fresh database that gets populated after app boots)
        service.setLazyInitializer(async () => {
          try {
            const dbConfig = await configRepository.findOne({
              where: { isActive: true },
            });
            if (dbConfig?.providerConfigs) {
              const ak = dbConfig.providerConfigs.anthropic?.apiKey;
              const ok = dbConfig.providerConfigs.openai?.apiKey;
              if (ak) {
                service.registerProvider(new AnthropicBatchProvider(ak));
                logger.log('Lazy-loaded Anthropic API key from database for batch service');
              }
              if (ok) {
                service.registerProvider(new OpenAIBatchProvider(ok));
                logger.log('Lazy-loaded OpenAI API key from database for batch service');
              }
            }
          } catch (err) {
            logger.warn(
              `Lazy batch config load failed: ${err instanceof Error ? err.message : err}`,
            );
          }
          // Also check env vars as fallback
          const ak = configService.get<string>('ANTHROPIC_API_KEY');
          const ok = configService.get<string>('OPENAI_API_KEY');
          if (ak) service.registerProvider(new AnthropicBatchProvider(ak));
          if (ok) service.registerProvider(new OpenAIBatchProvider(ok));
        });

        return service;
      },
      inject: [ConfigService, getRepositoryToken(LLMConfiguration)],
    },
  ],
  exports: [ProviderRegistry, ModelRouter, LLMService, BatchLlmService],
})
export class LLMModule {}
