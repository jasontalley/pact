import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LLMService } from '../../common/llm/llm.service';
import { ProviderRegistry } from '../../common/llm/providers/provider-registry';
import { ModelRouter } from '../../common/llm/routing/model-router';
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
 * - LLMController: REST API for provider/model management and usage tracking
 * - LLMAdminController: Admin API for configuration management
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LLMConfiguration, LLMUsageTracking])],
  controllers: [LLMController, LLMAdminController],
  providers: [ProviderRegistry, ModelRouter, LLMService],
  exports: [ProviderRegistry, ModelRouter, LLMService],
})
export class LLMModule {}
