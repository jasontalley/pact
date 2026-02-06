import { Module } from '@nestjs/common';
import { ConfigurationController } from './configuration.controller';

/**
 * Admin Module
 *
 * Provides administrative APIs for system configuration,
 * monitoring, and management.
 */
@Module({
  controllers: [ConfigurationController],
})
export class AdminModule {}
