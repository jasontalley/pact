import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
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
      useFactory: (configService: ConfigService): BatchLlmService => {
        const service = new BatchLlmService();

        const anthropicKey = configService.get<string>('ANTHROPIC_API_KEY');
        if (anthropicKey) {
          service.registerProvider(new AnthropicBatchProvider(anthropicKey));
        }

        const openaiKey = configService.get<string>('OPENAI_API_KEY');
        if (openaiKey) {
          service.registerProvider(new OpenAIBatchProvider(openaiKey));
        }

        return service;
      },
      inject: [ConfigService],
    },
  ],
  exports: [ProviderRegistry, ModelRouter, LLMService, BatchLlmService],
})
export class LLMModule {}
