import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { ApiKey } from './api-key.entity';
import { ApiKeyService } from './api-key.service';
import { ApiKeyGuard } from './api-key.guard';
import { ApiKeyController } from './api-key.controller';

/**
 * Global authentication module.
 *
 * Provides API key infrastructure for CLI/CI/external integrations.
 * The ApiKeyGuard is registered globally but only enforces on endpoints
 * decorated with @RequireApiKey() — all other endpoints pass through.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([ApiKey])],
  controllers: [ApiKeyController],
  providers: [
    ApiKeyService,
    ApiKeyGuard,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
  exports: [ApiKeyService, ApiKeyGuard],
})
export class AuthModule {}
