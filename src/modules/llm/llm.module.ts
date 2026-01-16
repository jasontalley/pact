import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LLMService } from '../../common/llm/llm.service';
import { LLMConfiguration } from './llm-configuration.entity';
import { LLMUsageTracking } from './llm-usage-tracking.entity';

/**
 * Global LLM Module
 *
 * This module provides the LLM service to all parts of the application.
 * It's marked as @Global() so it doesn't need to be imported in every module.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LLMConfiguration, LLMUsageTracking])],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMModule {}
