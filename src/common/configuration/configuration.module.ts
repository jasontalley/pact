import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigurationService } from './configuration.service';
import { SystemConfiguration } from './entities/system-configuration.entity';
import { ConfigurationAuditLog } from './entities/configuration-audit-log.entity';

/**
 * ConfigurationModule provides the layered configuration system.
 *
 * This module is global, so ConfigurationService can be injected anywhere
 * without explicitly importing the module.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SystemConfiguration, ConfigurationAuditLog]),
    EventEmitterModule.forRoot(),
  ],
  providers: [ConfigurationService],
  exports: [ConfigurationService],
})
export class ConfigurationModule {}
